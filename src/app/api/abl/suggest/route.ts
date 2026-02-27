import { NextResponse } from "next/server";
import { ablBookClient } from "@/lib/abl/client";

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const type = (url.searchParams.get("type") ?? "author").trim();
  const lang = (url.searchParams.get("lang") ?? "ar").trim();

  if (!q) return NextResponse.json({ suggestions: [] });

  try {
    const client = ablBookClient({ language: lang });

    // We use list() as a lightweight "suggest" source.
    // Keep perPage low to reduce load.
    const res = await client.list({
      page: 1,
      perPage: 80,
      query: q,
      title: "",
      contributors: [],
      publishers: [],
      categories: [],
      collections: [],
      languages: [],
      sources: [],
      attachments: [],
      tags: [],
      status: [],
      isDownloaded: false,
      bookIds: [],
      sortBy: 0,
      sortDir: 0,
    });

    const books: any[] = (res as any).books ?? [];

    if (type === "category") {
      const cats = uniq(
        books
          .flatMap((b) => (b.categories ?? []).map((c: any) => c?.name).filter(Boolean))
          .filter((name) => String(name).includes(q))
          .map(String)
      ).slice(0, 20);
      return NextResponse.json({ suggestions: cats });
    }

    // default: author
    // Use contributor filter (works better for partial author names)
    const res2 = await client.list({
      page: 1,
      perPage: 120,
      query: "",
      title: "",
      contributors: [{ name: q }],
      publishers: [],
      categories: [],
      collections: [],
      languages: [],
      sources: [],
      attachments: [],
      tags: [],
      status: [],
      isDownloaded: false,
      bookIds: [],
      sortBy: 0,
      sortDir: 0,
    });

    const books2: any[] = (res2 as any).books ?? [];

    const authors = uniq(
      books2
        .flatMap((b) => (b.contributors ?? []).map((c: any) => c?.contributor?.name || c?.displayName).filter(Boolean))
        .filter((name) => String(name).includes(q))
        .map(String)
    ).slice(0, 20);

    return NextResponse.json({ suggestions: authors });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "suggest failed", suggestions: [] }, { status: 502 });
  }
}
