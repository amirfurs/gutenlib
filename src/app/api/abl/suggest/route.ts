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
    const qNorm = q.toLowerCase();

    const listByQuery = async (page: number, perPage: number) =>
      client.list({
        page,
        perPage,
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
      } as any);

    const listByContributor = async (page: number, perPage: number) =>
      client.list({
        page,
        perPage,
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
      } as any);

    const [r1, r2, r3] = await Promise.all([
      listByQuery(1, 100),
      listByContributor(1, 120),
      listByContributor(2, 120),
    ]);

    const books: any[] = [
      ...(((r1 as any)?.books ?? []) as any[]),
      ...(((r2 as any)?.books ?? []) as any[]),
      ...(((r3 as any)?.books ?? []) as any[]),
    ];

    if (type === "category") {
      const cats = uniq(
        books
          .flatMap((b) => (b.categories ?? []).map((c: any) => c?.name).filter(Boolean))
          .map(String)
          .filter((name) => name.toLowerCase().includes(qNorm))
      ).slice(0, 20);
      return NextResponse.json({ suggestions: cats });
    }

    const extractAuthorNames = (b: any): string[] => {
      const fromContrib = (b?.contributors ?? []).flatMap((c: any) => [
        c?.name,
        c?.displayName,
        c?.contributor?.name,
        c?.contributor?.displayName,
      ]).filter(Boolean).map(String);
      const fromAuthors = (b?.authors ?? []).flatMap((a: any) => [a?.name, a?.displayName]).filter(Boolean).map(String);
      return [...fromContrib, ...fromAuthors];
    };

    const scored = uniq(
      books
        .flatMap((b) => extractAuthorNames(b))
        .map(String)
        .filter((name) => name.toLowerCase().includes(qNorm))
    )
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(qNorm) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(qNorm) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.localeCompare(b, "ar");
      })
      .slice(0, 20);

    return NextResponse.json({ suggestions: scored });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "suggest failed", suggestions: [] }, { status: 502 });
  }
}
