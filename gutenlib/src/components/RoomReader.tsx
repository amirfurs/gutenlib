"use client";

import { useEffect, useMemo, useState } from "react";

function splitParagraphs(input: string) {
  const text = input.replace(/\r\n/g, "\n");
  return text
    .split(/\n\s*\n+/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

function chunkParagraphs(paras: string[], minParas = 3, maxParas = 5) {
  const chunks: string[] = [];
  const chunkStarts: number[] = [];
  let i = 0;
  while (i < paras.length) {
    const remaining = paras.length - i;

    // choose chunk size between min and max
    let take = Math.min(maxParas, remaining);
    if (take < minParas && chunks.length) {
      // append remainder to last chunk to avoid tiny tail
      chunks[chunks.length - 1] += "\n\n" + paras.slice(i).join("\n\n");
      break;
    }

    // If remaining is between min..max, take all
    if (remaining <= maxParas) take = remaining;

    chunkStarts.push(i);
    chunks.push(paras.slice(i, i + take).join("\n\n"));
    i += take;
  }

  const fallback = paras.join("\n\n");
  return { chunks: chunks.length ? chunks : [fallback], chunkStarts: chunkStarts.length ? chunkStarts : [0] };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWithHighlight(text: string, highlight: string) {
  const needle = (highlight || "").replace(/\s+/g, " ").trim();
  if (!needle) return text;

  const pattern = needle
    .split(" ")
    .filter(Boolean)
    .map(escapeRegExp)
    .join("\\s+");

  const re = new RegExp(`(${pattern})`, "gi");
  const bits = text.split(re);
  if (bits.length <= 1) return text;

  let k = 0;
  return bits.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark key={`hl-${k++}`} style={{ background: "rgba(250,204,21,0.45)", color: "inherit", padding: "0 2px", borderRadius: 4 }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function RoomReader({
  bookId,
  chunkIndex,
  onChunkChange,
  isHost,
  textUrl,
  highlightText,
}: {
  bookId: number;
  chunkIndex: number;
  onChunkChange: (next: number) => void;
  isHost: boolean;
  textUrl?: string;
  highlightText?: string;
}) {
  const [raw, setRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.75);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setRaw("");

        const url = textUrl ?? `/api/read/${bookId}?format=txt`;
        const res = await fetch(url);
        const t = await res.text();
        if (!res.ok) throw new Error(t || `HTTP ${res.status}`);
        if (!cancelled) setRaw(t);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "فشل تحميل الكتاب";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, textUrl]);

  const { chunks, chunkStarts } = useMemo(() => {
    const paras = splitParagraphs(raw);
    return chunkParagraphs(paras, 3, 5);
  }, [raw]);

  const total = chunks.length;
  const clamped = Math.max(0, Math.min(chunkIndex, Math.max(0, total - 1)));

  type TocItem = { title: string; chunk: number };

  const toc = useMemo(() => {
    const paras = splitParagraphs(raw);
    const items: TocItem[] = [];

    const isHeading = (p: string) => {
      const t = p.trim();
      if (!t) return false;
      if (t.length > 80) return false;
      // common Gutenberg headings
      if (/^(chapter|book|part)\b/i.test(t)) return true;
      if (/^\*\*\*\s*(chapter|book|part)\b/i.test(t)) return true;
      // all caps-ish headings
      const letters = t.replace(/[^A-Za-z]/g, "");
      if (letters.length >= 6 && letters === letters.toUpperCase()) return true;
      return false;
    };

    function chunkFromParaIndex(idx: number) {
      // last chunk start <= idx
      let ans = 0;
      for (let i = 0; i < chunkStarts.length; i++) {
        if (chunkStarts[i] <= idx) ans = i;
        else break;
      }
      return ans;
    }

    const seen = new Set<string>();
    for (let i = 0; i < paras.length; i++) {
      const p = paras[i];
      if (!isHeading(p)) continue;
      const title = p.replace(/\s+/g, " ").trim();
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ title, chunk: chunkFromParaIndex(i) });
      if (items.length >= 60) break;
    }

    return items;
  }, [raw, chunkStarts]);

  useEffect(() => {
    if (clamped !== chunkIndex) onChunkChange(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  if (loading) return <div style={{ opacity: 0.75 }}>جاري تحميل النص…</div>;
  if (error) return <div style={{ color: "#fca5a5" }}>خطأ: {error}</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>مقطع</div>
          <div style={{ fontWeight: 900 }}>
            {total ? clamped + 1 : 0} / {total}
          </div>

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

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>A</label>
          <input type="range" min={14} max={26} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
        </div>
      </div>

      <article style={{ fontSize, lineHeight, whiteSpace: "pre-wrap" }}>
        {renderWithHighlight(chunks[clamped] ?? "", highlightText ?? "")}
      </article>

      {tocOpen ? (
        <>
          <div
            onClick={() => setTocOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 80 }}
          />

          {/* Popup */}
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
            <div
              style={{
                padding: 14,
                borderBottom: "1px solid #232323",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 900 }}>الفهرس</div>
              <button
                onClick={() => setTocOpen(false)}
                style={{ padding: "8px 10px", background: "#111", border: "1px solid #2a2a2a", borderRadius: 12 }}
              >
                إغلاق
              </button>
            </div>

            <div style={{ padding: 14, overflow: "auto", display: "grid", gap: 8 }}>
              {toc.length === 0 ? <div style={{ opacity: 0.7 }}>لا يوجد فهرس واضح لهذا الكتاب.</div> : null}

              {toc.map((it, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (!isHost) return;
                    onChunkChange(it.chunk);
                    setTocOpen(false);
                  }}
                  disabled={!isHost}
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: "#101010",
                    border: "1px solid #232323",
                    textAlign: "right",
                    opacity: isHost ? 1 : 0.6,
                    cursor: isHost ? "pointer" : "not-allowed",
                  }}
                  title={isHost ? "اذهب" : "المضيف فقط"}
                >
                  <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>مقطع {it.chunk + 1}</div>
                </button>
              ))}

              {!isHost ? (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                  يمكنك رؤية الفهرس، لكن التنقل للمضيف فقط.
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
