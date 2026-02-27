import { NextResponse } from "next/server";
import { ablBookClient } from "@/lib/abl/client";

function stripHtmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|tr)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function flattenToc(node: any, out: Array<{ pageNumber?: number; pageId?: string }>) {
  if (!node) return;
  const pageNumber = node.pageNumber != null ? Number(node.pageNumber) : undefined;
  const pageId = node.pageId ? String(node.pageId) : undefined;
  if (Number.isFinite(pageNumber) || pageId) out.push({ pageNumber, pageId });
  const children = node.children ?? node.items ?? [];
  if (Array.isArray(children)) for (const c of children) flattenToc(c, out);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const language = (url.searchParams.get("lang") ?? "ar").trim();

  try {
    const client = ablBookClient({ language });

    // 1) Get TOC to know which pages exist
    const tocRes = await client.tableOfContents({ bookId: id });
    const json: any = tocRes as any;

    const pages: Array<{ pageNumber?: number; pageId?: string }> = [];
    flattenToc(json?.tableOfContents ?? json, pages);

    const nums = Array.from(
      new Set(
        pages
          .map((p) => (p.pageNumber != null ? Number(p.pageNumber) : NaN))
          .filter((n) => Number.isFinite(n))
      )
    ).sort((a, b) => a - b);

    if (!nums.length) {
      return NextResponse.json({ error: "No pages found for this book" }, { status: 404 });
    }

    // 2) Fetch pages in small batches
    const BATCH = 6;
    const parts: string[] = [];

    for (let i = 0; i < nums.length; i += BATCH) {
      const batch = nums.slice(i, i + BATCH);
      const htmlRes = await client.hTMLContents({ bookId: id, pageNumbers: batch, pageIds: [] });
      const h: any = htmlRes as any;

      // Try common shapes
      const pagesArr =
        (Array.isArray(h?.pages) ? h.pages : null) ??
        (Array.isArray(h?.contents) ? h.contents : null) ??
        null;

      if (pagesArr) {
        for (const p of pagesArr) {
          const html = p?.html ?? p?.contentHtml ?? p?.content ?? "";
          const text = stripHtmlToText(String(html ?? ""));
          if (text) parts.push(text);
        }
      } else if (typeof h?.data === "string") {
        const text = stripHtmlToText(h.data);
        if (text) parts.push(text);
      }
    }

    const full = parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

    return new NextResponse(full, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "s-maxage=600, stale-while-revalidate=3600",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "ABL request failed" }, { status: 502 });
  }
}
