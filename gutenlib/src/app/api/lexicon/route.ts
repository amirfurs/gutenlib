import { NextResponse } from "next/server";
import { lookupRealBookLexicon } from "@/lib/lexicon/realBookLexicon";
import { lookupClassicalWord } from "@/lib/lexicon/classicalDictionary";
import { lookupOnlineLexicon } from "@/lib/lexicon/onlineLexicon";
import { lookupAblLexicon } from "@/lib/lexicon/ablLexicon";
import { extractCandidateRoots } from "@/lib/lexicon/stemmer";
import { synthesizeClassicalEntry } from "@/lib/lexicon/semanticRoots";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? url.searchParams.get("word") ?? "").trim();

  if (!q) {
    return NextResponse.json(
      { found: false, query: "", message: "يرجى تحديد كلمة للبحث في المعجم" },
      { status: 400 }
    );
  }

  try {
    // 1. Direct retrieval of real verbatim text from classical books
    // (لسان العرب لابن منظور، معجم مقاييس اللغة لابن فارس، الصحاح للجوهري، القاموس المحيط للفيروزآبادي)
    const realBookResult = lookupRealBookLexicon(q);
    if (realBookResult.found) {
      return NextResponse.json(realBookResult, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      });
    }

    // 2. Curated classical word definitions
    const localResult = lookupClassicalWord(q);
    if (localResult.found) {
      return NextResponse.json(localResult, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      });
    }

    const { candidateRoots } = extractCandidateRoots(q);
    const primaryRoot = candidateRoots[0] || localResult.root || q.slice(0, 3);

    // 3. Query open classical Arabic lexicon corpus (Wiktionary API with IPv4 priority)
    const onlineResult = await lookupOnlineLexicon(q, candidateRoots);
    if (onlineResult && onlineResult.found) {
      return NextResponse.json(onlineResult, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      });
    }

    // 4. Query ABL heritage corpus (fast 900ms timeout)
    const ablResult = await lookupAblLexicon(q, candidateRoots);
    if (ablResult && ablResult.found) {
      return NextResponse.json(ablResult, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      });
    }

    // 5. Autonomous Heritage Semantic Synthesis (guarantees coverage)
    const synthesized = synthesizeClassicalEntry(q, primaryRoot, candidateRoots);
    return NextResponse.json(synthesized, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (err: any) {
    console.error("Lexicon lookup error:", err);
    // Graceful fallback to synthesized classical analysis
    const { candidateRoots } = extractCandidateRoots(q);
    const primaryRoot = candidateRoots[0] || q.slice(0, 3);
    const synthesized = synthesizeClassicalEntry(q, primaryRoot, candidateRoots);
    return NextResponse.json(synthesized);
  }
}
