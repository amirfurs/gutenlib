import { NextResponse } from "next/server";
import { gutendex, type GutendexList } from "@/lib/gutendex";

export async function GET() {
  const counts = new Map<string, number>();

  // Sample top pages to extract popular subjects (English only)
  const pages = [1, 2, 3, 4, 5];
  const lists = await Promise.all(
    pages.map((p) =>
      gutendex<GutendexList>("/books", {
        sort: "popular",
        page: p,
        languages: "en",
      }).catch(() => ({ count: 0, next: null, previous: null, results: [] }))
    )
  );

  for (const list of lists) {
    for (const b of list.results ?? []) {
      for (const s of b.subjects ?? []) {
        const topic = s.trim();
        if (!topic) continue;
        counts.set(topic, (counts.get(topic) ?? 0) + 1);
      }
    }
  }

  const topics = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 60)
    .map(([topic]) => topic);

  return NextResponse.json({ topics }, {
    headers: {
      "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
