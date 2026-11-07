import { NextResponse } from "next/server";
import { lookupRealBookLexicon } from "@/lib/lexicon/realBookLexicon";

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
    // 1. Direct retrieval of real verbatim text from classical books only
    // (لسان العرب لابن منظور، معجم مقاييس اللغة لابن فارس، الصحاح للجوهري، القاموس المحيط للفيروزآبادي، المعجم الوسيط)
    const realBookResult = lookupRealBookLexicon(q);
    if (realBookResult.found && realBookResult.entry && realBookResult.entry.definitions.length > 0) {
      return NextResponse.json(realBookResult, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
        },
      });
    }

    // 2. Strict policy: If the word is NOT in the authentic classical books, DO NOT fabricate or synthesize
    return NextResponse.json({
      found: false,
      query: q,
      message: "لم يُعثر على مادة تراثية مطابقة لهذا اللفظ في أمهات المعاجم.",
    });
  } catch (err: any) {
    console.error("Lexicon lookup error:", err);
    return NextResponse.json({
      found: false,
      query: q,
      message: "تعذر استرجاع المادة من المعاجم التراثية.",
    });
  }
}
