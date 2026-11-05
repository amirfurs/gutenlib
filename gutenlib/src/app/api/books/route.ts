import { NextResponse } from "next/server";
import { gutendex, getCuratedBooksList, type GutendexList } from "@/lib/gutendex";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const search = url.searchParams.get("search") ?? "";
  const topic = url.searchParams.get("topic") ?? "";
  const sort = url.searchParams.get("sort") ?? "popular";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const rawLang = url.searchParams.get("languages");
  const languages = rawLang && rawLang !== "all" ? rawLang : undefined;

  try {
    const data = await gutendex<GutendexList>("/books", {
      search,
      topic,
      sort,
      page,
      ...(languages ? { languages } : {}),
    });

    if (data.results && data.results.length > 0) {
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "s-maxage=600, stale-while-revalidate=3600",
        },
      });
    }
  } catch {
    // If direct Gutendex fails (e.g. Cloudflare on Vercel), try voice server proxy if configured
    const voiceServer = (process.env.VOICE_SERVER_URL || process.env.NEXT_PUBLIC_VOICE_SERVER_URL || "").replace(/\/$/, "");
    if (voiceServer) {
      try {
        const proxyUrl = new URL(`${voiceServer}/gutendex/books/`);
        if (search) proxyUrl.searchParams.set("search", search);
        if (topic) proxyUrl.searchParams.set("topic", topic);
        if (sort) proxyUrl.searchParams.set("sort", sort);
        if (page > 1) proxyUrl.searchParams.set("page", String(page));
        if (languages) proxyUrl.searchParams.set("languages", languages);

        const vRes = await fetch(proxyUrl.toString(), {
          headers: { Accept: "application/json" },
          signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? (AbortSignal.timeout(6000) as any) : undefined,
        });

        if (vRes.ok) {
          const vData: GutendexList = await vRes.json();
          if (Array.isArray(vData?.results) && vData.results.length > 0) {
            return NextResponse.json(vData, {
              headers: {
                "Cache-Control": "s-maxage=600, stale-while-revalidate=3600",
              },
            });
          }
        }
      } catch {
        // Fall through to curated fallback
      }
    }
  }

  const fallback = getCuratedBooksList({ search, topic, sort, page });
  return NextResponse.json(fallback, {
    headers: {
      "Cache-Control": "s-maxage=300, stale-while-revalidate=1800",
    },
  });
}
