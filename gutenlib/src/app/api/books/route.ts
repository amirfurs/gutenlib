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

  try {
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upstream catalog temporarily unavailable";
    return NextResponse.json(
      {
        count: 0,
        next: null,
        previous: null,
        results: [],
        error: msg,
        degraded: true,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
