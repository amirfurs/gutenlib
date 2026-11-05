import { NextResponse } from "next/server";
import { gutendex, getCuratedBooksList, type GutendexList } from "@/lib/gutendex";

function norm(s: string) {
  return s.toLowerCase().trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return NextResponse.json({ q: "", books: [], authors: [], topics: [] });

  try {
    const data = await gutendex<GutendexList>(
      "/books",
      {
        search: q,
        page: 1,
        languages: "en",
      },
      7000
    );

    const books = (data.results ?? []).slice(0, 8).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.authors?.[0]?.name ?? "Unknown",
      cover: b.formats?.["image/jpeg"] ?? null,
    }));

    const authorsMap = new Map<string, { name: string; count: number }>();
    const topicsMap = new Map<string, { topic: string; count: number }>();

    for (const b of data.results ?? []) {
      for (const a of b.authors ?? []) {
        const name = a.name?.trim();
        if (!name) continue;
        if (!norm(name).includes(norm(q))) continue;
        const cur = authorsMap.get(norm(name));
        authorsMap.set(norm(name), { name, count: (cur?.count ?? 0) + 1 });
      }

      for (const s of b.subjects ?? []) {
        const topic = s.trim();
        if (!topic) continue;
        if (!norm(topic).includes(norm(q))) continue;
        const cur = topicsMap.get(norm(topic));
        topicsMap.set(norm(topic), { topic, count: (cur?.count ?? 0) + 1 });
      }
    }

    const authors = Array.from(authorsMap.values())
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5)
      .map((x) => x.name);

    const topics = Array.from(topicsMap.values())
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
      .slice(0, 6)
      .map((x) => x.topic);

    return NextResponse.json(
      { q, books, authors, topics },
      {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    const fallback = getCuratedBooksList({ search: q });
    const books = (fallback.results ?? []).slice(0, 8).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.authors?.[0]?.name ?? "Unknown",
      cover: b.formats?.["image/jpeg"] ?? null,
    }));

    const authors = Array.from(
      new Set(
        (fallback.results ?? [])
          .flatMap((b) => b.authors.map((a) => a.name))
          .filter((name) => norm(name).includes(norm(q)))
      )
    ).slice(0, 5);

    const topics = Array.from(
      new Set(
        (fallback.results ?? [])
          .flatMap((b) => b.subjects)
          .filter((s) => norm(s).includes(norm(q)))
      )
    ).slice(0, 6);

    return NextResponse.json(
      { q, books, authors, topics },
      {
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
        },
      }
    );
  }
}
