import { NextResponse } from "next/server";
import { lookupClassicalWord } from "@/lib/lexicon/classicalDictionary";

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
    const result = lookupClassicalWord(q);
    return NextResponse.json(result, {
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
