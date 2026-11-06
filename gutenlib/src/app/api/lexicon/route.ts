import { NextResponse } from "next/server";
import { lookupClassicalWord } from "@/lib/lexicon/classicalDictionary";
import { lookupAblLexicon } from "@/lib/lexicon/ablLexicon";
import { extractCandidateRoots } from "@/lib/lexicon/stemmer";

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
    // 1. Fast sub-millisecond local curated dictionary check
    const localResult = lookupClassicalWord(q);
    if (localResult.found) {
      return NextResponse.json(localResult, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      });
    }

    // 2. Query full ABL heritage corpus (including all dictionaries)
    const { candidateRoots } = extractCandidateRoots(q);
    const ablResult = await lookupAblLexicon(q, candidateRoots);
    if (ablResult && ablResult.found) {
      return NextResponse.json(ablResult, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      });
    }

    // 3. Fallback: return estimated root analysis
    return NextResponse.json(localResult, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { found: false, query: q, message: err?.message || "خطأ أثناء استعلام المعجم" },
      { status: 500 }
    );
  }
}
