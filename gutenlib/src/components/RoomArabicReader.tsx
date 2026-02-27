"use client";

import { useEffect, useMemo, useState } from "react";

type HtmlResponse = { data?: string; error?: string };

type TocItem = {
  title?: string;
  pageNumber?: number;
  pageId?: string;
  children?: TocItem[];
};

type TocResponse = { items?: TocItem[] };

type FlatToc = Array<{ level: number; title: string; pageNumber?: number; pageId?: string }>;

function flatten(items: TocItem[], level = 0): FlatToc {
  const out: FlatToc = [];
  for (const it of items) {
    out.push({
      level,
      title: it.title ?? "(بدون عنوان)",
      pageNumber: it.pageNumber,
      pageId: it.pageId,
    });
    if (it.children?.length) out.push(...flatten(it.children, level + 1));
  }
  return out;
}

export function RoomArabicReader({
  bookId,
  page,
  onPageChange,
  isHost,
}: {
  bookId: string;
  page: number;
  onPageChange: (nextPage: number) => void;
  isHost: boolean;
}) {
  const [toc, setToc] = useState<TocItem[]>([]);
  const [pagesCount, setPagesCount] = useState<number>(0);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // metadata
        try {
          const res = await fetch(`/api/abl/book/${bookId}?lang=ar`, { cache: "no-store" });
          const j = await res.json();
          const book = j?.book;
          if (!cancelled) setPagesCount(Number(book?.pagesCount ?? 0) || 0);
        } catch {
          // ignore
        }

        const tocRes = await fetch(`/api/abl/book/${bookId}/toc?lang=ar`, { cache: "no-store" });
        const tocJson = (await tocRes.json()) as TocResponse;
        if (!cancelled) setToc(tocJson.items ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "فشل تحميل الفهرس");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const flat = useMemo(() => flatten(toc).filter((x) => x.pageNumber != null || x.pageId), [toc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPage(true);
        setError(null);
        const qs = new URLSearchParams({ lang: "ar", page: String(page) });
        const res = await fetch(`/api/abl/book/${bookId}/html?${qs.toString()}`, { cache: "no-store" });
        const j = (await res.json()) as HtmlResponse;
        if (j?.error) throw new Error(j.error);
        const data = String(j?.data ?? "");
        if (!data.trim()) throw new Error("لا يوجد محتوى لهذه الصفحة");
        if (!cancelled) setHtml(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "فشل تحميل الصفحة");
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, page]);

  if (loading) return <div style={{ opacity: 0.75 }}>جاري تحميل بيانات الكتاب…</div>;
  if (error) return <div style={{ color: "#fca5a5" }}>خطأ: {error}</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>صفحة</div>
          <div style={{ fontWeight: 900 }}>{page}{pagesCount ? ` / ${pagesCount}` : ""}</div>

          <button
            onClick={() => setTocOpen(true)}
            style={{ padding: "8px 10px", background: "#111", border: "1px solid #2a2a2a", borderRadius: 12 }}
            title="الفهرس"
          >
            الفهرس
          </button>

          {isHost ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => onPageChange(Math.max(1, page - 1))}
                style={{ padding: "8px 10px", background: "#111", border: "1px solid #2a2a2a", borderRadius: 12 }}
                title="السابق"
              >
                ◀
              </button>
              <button
                onClick={() => onPageChange(page + 1)}
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

        <div style={{ fontSize: 12, opacity: 0.65 }}>
          {loadingPage ? "جاري تحميل الصفحة…" : flat.length ? `عناصر الفهرس: ${flat.length}` : ""}
        </div>
      </div>

      <div
        style={{
          border: "1px solid #232323",
          background: "#0b0b0b",
          borderRadius: 12,
          padding: 12,
          lineHeight: 2.0,
          fontSize: 18,
        }}
        // ABL returns already-sanitized book HTML. For production: sanitize further.
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {tocOpen ? (
        <>
          <div onClick={() => setTocOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 80 }} />
          <div
            style={{
              position: "fixed",
              top: "12vh",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(720px, 92vw)",
              maxHeight: "76vh",
              background: "#0b0b0b",
              border: "1px solid #2a2a2a",
              borderRadius: 16,
              zIndex: 90,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            role="dialog"
            aria-modal="true"
          >
            <div style={{ padding: 14, borderBottom: "1px solid #232323", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>الفهرس</div>
              <button onClick={() => setTocOpen(false)} style={{ padding: "8px 10px", background: "#111", border: "1px solid #2a2a2a", borderRadius: 12 }}>
                إغلاق
              </button>
            </div>

            <div style={{ padding: 14, overflow: "auto", display: "grid", gap: 8 }}>
              {flat.length === 0 ? <div style={{ opacity: 0.7 }}>لا يوجد فهرس متاح.</div> : null}

              {flat.map((it, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (!isHost) return;
                    if (it.pageNumber != null) onPageChange(Math.max(1, Number(it.pageNumber)));
                    setTocOpen(false);
                  }}
                  disabled={!isHost || it.pageNumber == null}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: "#101010",
                    border: "1px solid #232323",
                    textAlign: "right",
                    opacity: isHost && it.pageNumber != null ? 1 : 0.6,
                    cursor: isHost && it.pageNumber != null ? "pointer" : "not-allowed",
                  }}
                  title={isHost ? "اذهب" : "المضيف فقط"}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {"\u00A0".repeat(Math.min(6, it.level * 2))}{it.title}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{it.pageNumber != null ? `ص ${it.pageNumber}` : ""}</div>
                  </div>
                </button>
              ))}

              {!isHost ? <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>يمكنك رؤية الفهرس، لكن التنقل للمضيف فقط.</div> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
