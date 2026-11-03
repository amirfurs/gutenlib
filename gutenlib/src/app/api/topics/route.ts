import { NextResponse } from "next/server";
import { gutendex, type GutendexList } from "@/lib/gutendex";

const DEFAULT_TOPICS = [
  "Adventure stories",
  "Autobiographies",
  "Biography",
  "Children's Literature",
  "Classics",
  "Detective and mystery stories",
  "Drama",
  "Fantasy fiction",
  "Fiction",
  "Historical fiction",
  "History",
  "Horror tales",
  "Humorous stories",
  "Philosophy",
  "Poetry",
  "Psychological fiction",
  "Science fiction",
  "Short stories",
  "Travel",
  "War stories",
];

export async function GET() {
  const counts = new Map<string, number>();

  try {
    // Sample only top 2 pages to extract popular subjects quickly
    const pages = [1, 2];
    const lists = await Promise.all(
      pages.map((p) =>
        gutendex<GutendexList>(
          "/books",
          {
            sort: "popular",
            page: p,
            languages: "en",
          },
          6000
        ).catch(() => ({ count: 0, next: null, previous: null, results: [] }))
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

    const fetchedTopics = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 50)
      .map(([topic]) => topic);

    const merged = Array.from(new Set([...fetchedTopics, ...DEFAULT_TOPICS]));

    return NextResponse.json(
      { topics: merged },
      {
        headers: {
          "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { topics: DEFAULT_TOPICS },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  }
}
