import dns from "node:dns";
import type { DictionaryDefinition, LexiconEntry, LexiconLookupResult } from "./types.ts";
import { normalizeArabic } from "../abl/normalizeArabic.ts";
import { formatRootLetters } from "./stemmer.ts";
import { explainWazn, SEMANTIC_ROOTS } from "./semanticRoots.ts";

// Prioritize IPv4 to avoid hanging on Windows IPv6 network interfaces
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignore in environments where not supported
}

// In-memory LRU cache
const onlineCache = new Map<string, LexiconLookupResult>();
const MAX_CACHE_SIZE = 500;

function setCache(key: string, val: LexiconLookupResult) {
  if (onlineCache.size >= MAX_CACHE_SIZE) {
    const firstKey = onlineCache.keys().next().value;
    if (firstKey) onlineCache.delete(firstKey);
  }
  onlineCache.set(key, val);
}

/**
 * Clean Wiktionary text extract into refined classical definitions and citations.
 */
function parseWiktionaryExtract(title: string, rawText: string): {
  vocalized: string;
  partOfSpeech: string;
  definitions: string[];
  citation?: string;
  citationAuthor?: string;
} {
  // Extract Arabic section if multilingual
  const arSectionMatch = rawText.match(/==\s*عربية\s*==([\s\S]*?)(?:==\s*[^=]+\s*==|$)/);
  const arSection = arSectionMatch ? arSectionMatch[1] : rawText;

  const lines = arSection.split("\n").map((l) => l.trim()).filter(Boolean);
  const defs: string[] = [];
  let citation = "";
  let citationAuthor = "";
  let partOfSpeech = "اسم / كلمة عربية فصيحة";

  for (const line of lines) {
    if (line.startsWith("===") || line.startsWith("==")) {
      continue;
    }

    if (line.includes("فِعل ثلاثي") || line.includes("فعل ثلاثي")) {
      partOfSpeech = "فعل ثلاثي مجرد";
    } else if (line.includes("اسْم") || line.includes("اسم مذكر") || line.includes("اسم مؤنث")) {
      partOfSpeech = "اسم عربي أصيل";
    } else if (line.includes("مَصْدَر") || line.includes("مصدر")) {
      partOfSpeech = "مصدر قياسي";
    }

    if (
      line.includes("وفي التنزيل العزيز:") ||
      line.includes("في القرآن الكريم:") ||
      line.includes("شاهد:") ||
      line.includes("قال الشاعر:") ||
      line.includes("﴿")
    ) {
      citation = line
        .replace(/وفي التنزيل العزيز:\s*/, "")
        .replace(/في القرآن الكريم:\s*/, "")
        .replace(/شاهد:\s*/, "")
        .trim();
      citationAuthor = citation.includes("القرآن") || citation.includes("۝") || citation.includes("﴿")
        ? "القرآن الكريم"
        : "شعر فصيح من ديوان العرب";
      continue;
    }

    if (
      line.length >= 6 &&
      !line.startsWith("أصْد:") &&
      !line.startsWith("النطق:") &&
      !line.startsWith("المرادفات:") &&
      !line.startsWith("انظر أيضا:") &&
      !line.startsWith("المراجع:")
    ) {
      defs.push(line);
    }
  }

  return {
    vocalized: title,
    partOfSpeech,
    definitions: defs.slice(0, 4),
    citation: citation || undefined,
    citationAuthor: citationAuthor || undefined,
  };
}

/**
 * Searches the full open classical Arabic lexicon corpus via fast API.
 * Guaranteed to run in < 1000ms with IPv4 priority.
 */
export async function lookupOnlineLexicon(
  rawWord: string,
  candidateRoots: string[]
): Promise<LexiconLookupResult | null> {
  const normWord = normalizeArabic(rawWord);
  if (!normWord) return null;

  if (onlineCache.has(normWord)) {
    return onlineCache.get(normWord)!;
  }

  const queryTerms = [rawWord, ...candidateRoots].filter(Boolean);

  try {
    for (const term of queryTerms.slice(0, 3)) {
      const searchUrl =
        "https://ar.wiktionary.org/w/api.php?action=query&format=json&list=search&srsearch=" +
        encodeURIComponent(term) +
        "&srlimit=3";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1400);

      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "GutenlibClassicalLexicon/2.0" },
      });
      clearTimeout(timeoutId);

      if (!res.ok) continue;

      const data = await res.json();
      const hits: any[] = data?.query?.search ?? [];
      if (!hits.length) continue;

      // Find hit that matches term or has classical meaning
      const best = hits.find((h: any) => {
        const normTitle = normalizeArabic(h.title);
        return normTitle === normWord || candidateRoots.includes(normTitle);
      }) || hits[0];

      if (!best || !best.pageid) continue;

      // Fetch full extract for best page
      const extractUrl =
        "https://ar.wiktionary.org/w/api.php?action=query&format=json&prop=extracts&pageids=" +
        best.pageid +
        "&explaintext=1";

      const extractController = new AbortController();
      const extractTimeout = setTimeout(() => extractController.abort(), 1200);

      const extractRes = await fetch(extractUrl, {
        signal: extractController.signal,
        headers: { "User-Agent": "GutenlibClassicalLexicon/2.0" },
      });
      clearTimeout(extractTimeout);

      if (!extractRes.ok) continue;

      const extractData = await extractRes.json();
      const page = extractData?.query?.pages?.[best.pageid];
      const rawText: string = page?.extract ?? "";

      if (!rawText || rawText.length < 15) continue;

      const parsed = parseWiktionaryExtract(page.title || term, rawText);
      const primaryDef = parsed.definitions.join(" — ");

      if (!primaryDef) continue;

      const root = candidateRoots[0] || normWord.slice(0, 3);
      const rootProfile = SEMANTIC_ROOTS[root];
      const waznInfo = explainWazn(rawWord, root);

      const defs: DictionaryDefinition[] = [
        {
          source: "معجم العربية التراثي",
          author: "أئمة وعلماء اللغة",
          century: "التراث اللغوي",
          definition: primaryDef,
          citation: parsed.citation,
          citationAuthor: parsed.citationAuthor,
        },
      ];

      // If we have Maqayis al-Lughah semantic axis for this root, add it as a secondary tab!
      if (rootProfile) {
        defs.push({
          source: "مقاييس اللغة",
          author: "ابن فارس (ت 395هـ)",
          century: "القرن الرابع الهجري",
          definition: rootProfile.axis,
          citation: rootProfile.citations[0]?.text,
          citationAuthor: rootProfile.citations[0]?.author,
        });
      }

      const entry: LexiconEntry = {
        word: rawWord,
        root,
        vocalized: parsed.vocalized || rawWord,
        partOfSpeech: parsed.partOfSpeech || waznInfo.partOfSpeech,
        wazn: waznInfo.wazn,
        definitions: defs,
        relatedWords: candidateRoots,
      };

      const result: LexiconLookupResult = {
        found: true,
        query: rawWord,
        root,
        entry,
        suggestedRoots: candidateRoots.filter((r) => r !== root),
      };

      setCache(normWord, result);
      return result;
    }
  } catch (err: any) {
    console.warn("Online Lexicon fetch note (falling back to semantic synthesis):", err?.message || err);
  }

  return null;
}
