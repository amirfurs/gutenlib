import { NextResponse } from "next/server";
import { ablBookClient } from "@/lib/abl/client";

function stripHtml(s: string) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqBy<T>(arr: T[], keyFn: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    const k = keyFn(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const lang = (url.searchParams.get("lang") ?? "ar").trim();

  if (!q) return NextResponse.json({ q, hits: [], scanned: 0, total: 0 });

  try {
    const client = ablBookClient({ language: lang });

    const tocRes = await client.tableOfContents({ bookId: id });
    const items: any[] = (tocRes as any).items ?? [];

    // TOC entries are PageContentRef; use pageId (string) primarily.
    const pages = uniqBy(
      items
        .map((it) => ({ pageId: it.pageId ? String(it.pageId) : "", title: it.title ? String(it.title) : "" }))
        .filter((x) => x.pageId),
      (x) => x.pageId
    );

    const hits: Array<{ pageId: string; title: string; excerpt: string }> = [];
    const batchSize = 10;

    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);
      const pageIds = batch.map((b) => b.pageId);

      const htmlRes = await client.hTMLContents({ bookId: id, pageNumbers: [], pageIds });
      const html = (htmlRes as any).data ?? "";

      // Note: API returns one big HTML string for requested pageIds; we can't reliably split.
      // So we fall back to requesting one-by-one inside the batch for accurate excerpts.
      for (const p of batch) {
        const single = await client.hTMLContents({ bookId: id, pageNumbers: [], pageIds: [p.pageId] });
        const txt = stripHtml((single as any).data ?? "");
        const idx = txt.indexOf(q);
        if (idx >= 0) {
          const start = Math.max(0, idx - 60);
          const end = Math.min(txt.length, idx + q.length + 140);
          hits.push({ pageId: p.pageId, title: p.title, excerpt: txt.slice(start, end) });
        }
      }
    }

    return NextResponse.json(
      {
        q,
        hits,
        scanned: pages.length,
        total: pages.length,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "search failed", q, hits: [] }, { status: 502 });
  }
}
