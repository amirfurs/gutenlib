"use client";

import { useEffect, useMemo, useState } from "react";

function stripHtmlToText(html: string) {
  // very lightweight, best-effort
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

type TocItem = { title: string; pageId?: string; pageNumber?: number };

function flattenToc(node: any, out: TocItem[]) {
  if (!node) return;
  const title = String(node.title ?? "").trim();
  const pageId = node.pageId ? String(node.pageId) : undefined;
  const pageNumber = node.pageNumber != null ? Number(node.pageNumber) : undefined;
  if (title && (pageId || Number.isFinite(pageNumber))) {
    out.push({ title, pageId, pageNumber });
  }
  const children = node.children ?? node.items ?? [];
  if (Array.isArray(children)) {
    for (const c of children) flattenToc(c, out);
  }
}

export function AblRoomReader({
  bookId,
  chunkIndex,
  onChunkChange,
  isHost,
}: {
  bookId: string;
  chunkIndex: number;
  onChunkChange: (next: number) => void;
  isHost: boolean;
}) {
  const [toc, setToc] = useState<TocItem[]>([]);
  const [loadingToc, setLoadingToc] = useState(true);
  const [pageHtml, setPageHtml] = useState<string>("");
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingToc(true);
        setError(null);
        const res = await fetch(`/api/abl/book/${bookId}/toc?lang=ar`);
        const j = await res.json();
        const root = j?.tableOfContents ?? j?.toc ?? j;
        const items: TocItem[] = [];
        if (root) flattenToc(root, items);
        // fallback: try array
        const arr = Array.isArray(j?.items) ? j.items : Array.isArray(j?.tableOfContents?.items) ? j.tableOfContents.items : null;
        if (arr) {
          for (const n of arr) flattenToc(n, items);
        }
        const uniq: TocItem[] = [];
        const seen = new Set<string>();
        for (const it of items) {
          const key = `${it.pageId ?? ""}|${it.pageNumber ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          uniq.push(it);
        }
        if (!cancelled) setToc(uniq);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "فشل تحميل الفهرس");
      } finally {
        if (!cancelled) setLoadingToc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const total = toc.length;
  const clamped = Math.max(0, Math.min(chunkIndex, Math.max(0, total - 1)));

  useEffect(() => {
    if (clamped !== chunkIndex) onChunkChange(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  const current = useMemo(() => toc[clamped] ?? null, [toc, clamped]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!current) return;
      try {
        setLoadingPage(true);
        setError(null);
        const qs = new URLSearchParams({ lang: "ar" });
        if (current.pageId) qs.set("pageId", current.pageId);
        else if (current.pageNumber != null) qs.set("page", String(current.pageNumber));
        const res = await fetch(`/api/abl/book/${bookId}/html?${qs.toString()}`);
        const text = await res.text();

        // The endpoint may return JSON (preferred) or raw HTML (depending on upstream/schema).
        let html: string | null = null;
        try {
          const j = JSON.parse(text);
          html =
            (typeof j?.data === "string" ? String(j.data) : null) ??
            (Array.isArray(j?.pages) && (j.pages[0]?.html || j.pages[0]?.contentHtml || j.pages[0]?.content) ? String(j.pages[0].html ?? j.pages[0].contentHtml ?? j.pages[0].content) : null) ??
            (Array.isArray(j?.contents) && (j.contents[0]?.html || j.contents[0]?.contentHtml || j.contents[0]?.content) ? String(j.contents[0].html ?? j.contents[0].contentHtml ?? j.contents[0].content) : null) ??
            (j?.html ? String(j.html) : null) ??
            null;
        } catch {
          // not JSON
          html = text;
        }

        if (!html || !html.trim()) throw new Error("لا يوجد محتوى لهذه الصفحة");
        if (!cancelled) setPageHtml(html);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "فشل تحميل الصفحة");
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, current?.pageId, current?.pageNumber]);

  if (loadingToc) return <div style={{ opacity: 0.75 }}>جاري تحميل فهرس الكتاب…</div>;
  if (error) return <div style={{ color: "#fca5a5" }}>خطأ: {error}</div>;
  if (!current) return <div style={{ opacity: 0.75 }}>لا يوجد فهرس قابل للعرض لهذا الكتاب.</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>قسم</div>
          <div style={{ fontWeight: 900 }}>
            {total ? clamped + 1 : 0} / {total}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {current.title}
          </div>

          {isHost ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => onChunkChange(Math.max(0, clamped - 1))}
                style={{ padding: "8px 10px", background: "#111", border: "1px solid #2a2a2a", borderRadius: 12 }}
                title="السابق"
              >
                ◀
              </button>
              <button
                onClick={() => onChunkChange(Math.min(total - 1, clamped + 1))}
                style={{ padding: "8px 10px", background: "#111", border: "1px solid #2a2a2a", borderRadius: 12 }}
                title="التالي"
              >
                ▶
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.6 }}>المضيف يتحكم بالتنقل</div>
          )}
        </div>
      </div>

      {loadingPage ? <div style={{ opacity: 0.75 }}>جاري تحميل الصفحة…</div> : null}
      <article style={{ whiteSpace: "pre-wrap", lineHeight: 1.9, fontSize: 18 }}>
        {stripHtmlToText(pageHtml)}
      </article>
    </div>
  );
}
