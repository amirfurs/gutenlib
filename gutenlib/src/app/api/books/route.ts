import { NextResponse } from "next/server";
import { gutendex, getCuratedBooksList, type GutendexList } from "@/lib/gutendex";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const search = url.searchParams.get("search") ?? "";
  const topic = url.searchParams.get("topic") ?? "";
  const sort = url.searchParams.get("sort") ?? "popular";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const languages = url.searchParams.get("languages") ?? "en";

  try {
    const data = await gutendex<GutendexList>("/books", {
      search,
      topic,
      sort,
      page,
      languages,
    });

    if (data.results && data.results.length > 0) {
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "s-maxage=600, stale-while-revalidate=3600",
        },
      });
    }

    const fallback = getCuratedBooksList({ search, topic, sort, page });
    return NextResponse.json(fallback, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=1800",
      },
    });
  } catch {
    const fallback = getCuratedBooksList({ search, topic, sort, page });
    return NextResponse.json(fallback, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=1800",
      },
    });
  }
}
