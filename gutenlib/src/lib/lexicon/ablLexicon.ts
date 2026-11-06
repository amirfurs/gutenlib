import { ablSearchClient, ablBookClient } from "@/lib/abl/client";
import { formatRootLetters } from "./stemmer";
import type { LexiconEntry, LexiconLookupResult, DictionaryDefinition } from "./types";
import { normalizeArabic } from "@/lib/abl/normalizeArabic";

// In-memory cache for ABL remote lexicon queries (LRU / fast map)
const ablCache = new Map<string, LexiconLookupResult>();

/**
 * Searches the full ABL heritage corpus (including all classical lexicons and dictionaries)
 * via ABL's gRPC Search & Book services.
 */
export async function lookupAblLexicon(
  rawWord: string,
  candidateRoots: string[]
): Promise<LexiconLookupResult | null> {
  const normWord = normalizeArabic(rawWord);
  if (!normWord) return null;

  if (ablCache.has(normWord)) {
    return ablCache.get(normWord)!;
  }

  const queryTerms = [rawWord, ...candidateRoots].filter(Boolean);
  const primaryTerm = queryTerms[0];

  try {
    const searchClient = ablSearchClient({ language: "ar" });

    // 1. Query ABL SearchService with fast timeout protection (900ms max)
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("ABL_TIMEOUT")), 900)
    );

    const searchPromise = searchClient.search({
      query: `"${primaryTerm}"`,
      scope: [0], // 0 = Scope.TEXT
      books: [],
      contributors: [],
      diedAt: [],
      publishers: [],
      languageIds: ["ar"],
      categoryIds: [],
      collectionIds: [],
      paginate: { page: 1, perPage: 10 },
      sortBy: 1, // 1 = Relevance
    });

    const searchRes = await Promise.race([searchPromise, timeoutPromise]);
    const results: any[] = (searchRes as any)?.results ?? [];

    if (results.length > 0) {
      // Prioritize classical dictionary books (معاجم، لسان العرب، تاج العروس، القاموس، الصحاح)
      const dictKeywords = ["معجم", "لسان", "القاموس", "لغة", "صحاح", "تاج العروس", "فقه اللغة", "العين", "مقاييس"];

      const sorted = [...results].sort((a, b) => {
        const aTitle = a.book?.title ?? "";
        const bTitle = b.book?.title ?? "";
        const aIsDict = dictKeywords.some((k) => aTitle.includes(k)) ? 1 : 0;
        const bIsDict = dictKeywords.some((k) => bTitle.includes(k)) ? 1 : 0;
        return bIsDict - aIsDict;
      });

      const best = sorted[0];
      if (best && best.book) {
        const bookTitle = best.book.title ?? "المكتبة العربية (ABL)";
        const authorName = best.book.contributors?.[0]?.name ?? "علماء التراث";

        // Extract excerpt from pages
        let textExcerpt = "";
        let pageNumber = 1;
        const pages = best.result?.value?.pages ?? [];

        for (const p of pages) {
          pageNumber = p.page?.number ?? p.page?.sourceNumber ?? 1;
          const contents = p.page?.contents ?? [];
          for (const c of contents) {
            // Check paragraph contents
            if (c.data?.case === "paragraph" && c.data.value?.text) {
              const pt: string = c.data.value.text;
              if (pt.includes(primaryTerm) || candidateRoots.some((r) => pt.includes(r))) {
                textExcerpt = pt;
                break;
              }
            }
          }
          if (textExcerpt) break;
        }

        // Clean up and trim excerpt
        if (textExcerpt) {
          const cleanExcerpt = textExcerpt
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const def: DictionaryDefinition = {
            source: bookTitle.includes("لسان") ? "لسان العرب" : bookTitle,
            author: authorName,
            century: "خزانة التراث (ABL)",
            definition: cleanExcerpt.slice(0, 520) + (cleanExcerpt.length > 520 ? "..." : ""),
            citation: `توثيق من: ${bookTitle} · ص ${pageNumber}`,
            citationAuthor: authorName,
            bookId: String(best.book.id ?? ""),
            pageNumber,
          };

          const entry: LexiconEntry = {
            word: rawWord,
            root: candidateRoots[0] || normWord.slice(0, 3),
            vocalized: rawWord,
            partOfSpeech: "مفردة من أمهات الكتب",
            definitions: [def],
          };

          const lookupResult: LexiconLookupResult = {
            found: true,
            query: rawWord,
            root: entry.root,
            entry,
            suggestedRoots: candidateRoots,
          };

          ablCache.set(normWord, lookupResult);
          return lookupResult;
        }
      }
    }
  } catch (err) {
    // Graceful fallback: if ABL service is offline, slow, or times out, proceed to local stemmer
    console.warn("ABL Lexicon search note (fallback applied):", (err as any)?.message || err);
  }

  return null;
}
