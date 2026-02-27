import { NextResponse } from "next/server";
import { gutendex, type GutendexList } from "@/lib/gutendex";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const search = url.searchParams.get("search") ?? "";
  const topic = url.searchParams.get("topic") ?? "";
  const sort = url.searchParams.get("sort") ?? "popular";
  const page = url.searchParams.get("page") ?? "1";

  // English-only by default
  const languages = url.searchParams.get("languages") ?? "en";

  const data = await gutendex<GutendexList>("/books", {
    search,
    topic,
    sort,
    page,
    languages,
  });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
