"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function pageKey(id: string) {
  return `gutenlib_reader_page_${id}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function paginateText(input: string, targetChars: number) {
  const text = input.replace(/\r\n/g, "\n");
  const paras = text.split(/\n\s*\n+/g).map((p) => p.trim()).filter(Boolean);

  const pages: string[] = [];
  let buf: string[] = [];
  let len = 0;

  for (const p of paras) {
    const extra = (buf.length ? 2 : 0) + p.length;

    if (len + extra > targetChars && buf.length) {
      pages.push(buf.join("\n\n"));
      buf = [p];
      len = p.length;
      continue;
    }

    buf.push(p);
    len += extra;
  }

  if (buf.length) pages.push(buf.join("\n\n"));
  return pages.length ? pages : [text];
}

export function Reader({ id }: { id: string }) {
  const [raw, setRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.75);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/read/${id}?format=txt`);
        const t = await res.text();

        if (!res.ok) throw new Error(t || `Failed to load (HTTP ${res.status})`);
        if (!cancelled) setRaw(t);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const targetChars = useMemo(() => {
    const base = 4200;
    const scale = 18 / fontSize;
    return Math.round(base * scale);
  }, [fontSize]);

  const pages = useMemo(() => paginateText(raw, targetChars), [raw, targetChars]);
  const totalPages = pages.length;

  const toc = useMemo(() => {
    // Smarter TOC (hierarchical):
    // 1) Find the Contents section.
    // 2) Parse entries from Contents (BOOK/PART/CHAPTER lines).
    // 3) Map each entry to the actual location in the full text, then convert to a page number.

    type TocItem = { title: string; page: number; level: 0 | 1 };

    const items: TocItem[] = [];
    const seen = new Set<string>();

    const noise = new Set([
      "illustration",
      "illustrations",
      "transcriber\u2019s notes",
      "transcriber's notes",
      "notes",
      "preface",
      "introduction",
      "etymology",
      "extracts",
    ]);

    const cleanRaw = raw.replace(/\r\n/g, "\n");

    const joinedPages = pages.join("\n\n");
    const boundaries: number[] = [];
    {
      let acc = 0;
      for (let i = 0; i < pages.length; i++) {
        boundaries.push(acc);
        acc += pages[i].length + 2; // separator \n\n
      }
    }

    function pageFromIndex(idx: number): number {
      if (idx <= 0) return 0;
      // last boundary <= idx
      let lo = 0, hi = boundaries.length - 1, ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (boundaries[mid] <= idx) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      return ans;
    }

    function escapeRegExp(s: string) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function add(title: string, page: number, level: 0 | 1) {
      const t = title.replace(/\s{2,}/g, " ").trim();
      if (!t || t.length < 3) return;
      const norm = t.toLowerCase();
      if (noise.has(norm)) return;
      const key = `${level}:${norm}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ title: t, page, level });
    }

    // Locate Contents (supports "CONTENTS", "CONTENTS.", "TABLE OF CONTENTS")
    const contentsMatch = cleanRaw.match(/(^|\n)\s*(table\s+of\s+)?contents\.?\s*(\n|$)/i);
    if (!contentsMatch || contentsMatch.index == null) {
      return [];
    }

    const contentsStart = contentsMatch.index;
    // Take a window after "Contents" to parse entries
    const windowText = cleanRaw.slice(contentsStart, contentsStart + 30000);
    const lines = windowText.split("\n").map((l) => l.trim()).filter(Boolean);

    // Add the Contents itself + compute where the real body starts (after contents page)
    let contentsIdxInJoined = joinedPages.toLowerCase().search(/(^|\n)\s*(table\s+of\s+)?contents\.?\s*(\n|$)/i);
    if (contentsIdxInJoined < 0) contentsIdxInJoined = 0;

    const contentsPage = pageFromIndex(contentsIdxInJoined);

    add("Contents", contentsPage, 0);

    // Determine where the real body starts.
    // Some books have long contents spanning multiple pages, so "page after contents" is not reliable.
    // Strategy: once we know the first chapter number, start searching from its *second* occurrence:
    // - first occurrence is usually inside the Contents section
    // - second occurrence is the real chapter heading in the text
    let bodyStartChar = boundaries[contentsPage + 1] ?? 0;

    function findSecondOccurrence(re: RegExp, from: number) {
      const first = joinedPages.slice(from).search(re);
      if (first < 0) return -1;
      const afterFirst = from + first + 1;
      const second = joinedPages.slice(afterFirst).search(re);
      return second >= 0 ? afterFirst + second : -1;
    }

    // More tolerant matcher for titles (ignores repeated whitespace + optional punctuation)
    function looseTitleRegex(title: string) {
      const t = title
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.]+/g, ".")
        .replace(/[—–-]/g, "-");

      const escaped = escapeRegExp(t)
        .replace(/\\\s+/g, "\\s+")
        .replace(/\\\./g, "\\.?");

      return new RegExp(`\\n\\s*${escaped}\\s*(\\n|$)`, "i");
    }

    function findInBody(re: RegExp) {
      const hay = joinedPages.slice(bodyStartChar);
      const idx = hay.search(re);
      return idx >= 0 ? idx + bodyStartChar : -1;
    }

    const romanOrNum = "[0-9]+|[ivxlcdm]+";
    const reBook = new RegExp(`^\\s*(book|part)\\s+(${romanOrNum})\\s*(?:[.:\\-])?\\s*(.{0,120})$`, "i");
    const reChapterLine = new RegExp(`^\\s*chapter\\s+(${romanOrNum})\\s*(?:[.:\\-])?\\s*(.{0,140})$`, "i");
    // Matches chapters inside a single long line: "Chapter I. Chapter II. ..."
    const reChapterInline = new RegExp(`chapter\\s+(${romanOrNum})\\s*(?:[.:\\-])?\\s*([^\n]{0,80})?`, "gi");

    // Compute bodyStartChar based on the first chapter we can detect in Contents.
    // Prefer CHAPTER 1 / CHAPTER I.
    {
      const firstChapterInContents = lines.find((l) => /^\s*chapter\s+(1|i)\b/i.test(l) || (l.match(/\bchapter\b/gi) ?? []).length > 1);
      if (firstChapterInContents) {
        // Look for a chapter number token in that line
        const m = /chapter\s+([0-9]+|[ivxlcdm]+)/i.exec(firstChapterInContents);
        const num = (m?.[1] ?? "1").toUpperCase();
        const re = new RegExp(`\\n\\s*CHAPTER\\s+${escapeRegExp(num)}\\b`, "i");
        const second = findSecondOccurrence(re, contentsIdxInJoined);
        if (second >= 0) {
          bodyStartChar = second;
        }
      }
    }

    // Parse TOC entries and map them to body positions.
    // We accept both one-per-line entries and "many chapters in one line".
    for (const line of lines) {
      if (line.length > 400) {
        // still attempt inline extraction on long lines
      }

      const mBook = reBook.exec(line);
      if (mBook) {
        const kind = mBook[1].toUpperCase();
        const num = mBook[2].toUpperCase();
        const rest = (mBook[3] ?? "").trim();
        const label = rest ? `${kind} ${num}. ${rest}` : `${kind} ${num}`;

        const idx = findInBody(new RegExp(`\\n\\s*${escapeRegExp(label)}\\s*\\n`, "i"));
        const page = idx >= 0 ? pageFromIndex(idx) : pageFromIndex(bodyStartChar);
        add(label, page, 0);
        continue;
      }

      const mChLine = reChapterLine.exec(line);
      if (mChLine) {
        const num = mChLine[1].toUpperCase();
        const rest = (mChLine[2] ?? "").trim();
        const label = rest ? `CHAPTER ${num}. ${rest}` : `CHAPTER ${num}`;

        // Prefer matching the full label (as written in contents) using the second occurrence (body), then fallback.
        const idx = findSecondOccurrence(looseTitleRegex(label), contentsIdxInJoined);
        if (idx >= 0) {
          add(label, pageFromIndex(idx), 1);
        } else {
          const idx2 = findInBody(new RegExp(`\\n\\s*CHAPTER\\s+${escapeRegExp(num)}\\b`, "i"));
          if (idx2 >= 0) add(label, pageFromIndex(idx2), 1);
        }
        continue;
      }

      // Inline chapters (handles "Chapter I. Chapter II. ...")
      let im: RegExpExecArray | null;
      reChapterInline.lastIndex = 0;
      while ((im = reChapterInline.exec(line))) {
        const num = (im[1] ?? "").toUpperCase();
        const tail = (im[2] ?? "").trim();
        // Tail might actually include the next "Chapter"; trim it.
        const cleanedTail = tail.split(/\bchapter\b/i)[0].trim().replace(/^[.:\-]+/, "").trim();
        const label = cleanedTail ? `CHAPTER ${num}. ${cleanedTail}` : `CHAPTER ${num}`;

        const idx = findSecondOccurrence(looseTitleRegex(label), contentsIdxInJoined);
        if (idx >= 0) {
          add(label, pageFromIndex(idx), 1);
        } else {
          const idx2 = findInBody(new RegExp(`\\n\\s*CHAPTER\\s+${escapeRegExp(num)}\\b`, "i"));
          if (idx2 >= 0) add(label, pageFromIndex(idx2), 1);
        }
      }

      // Stop parsing after we likely passed the contents page
      if (/^\s*chapter\s+(1|i)\b/i.test(line)) break;
    }

    // If we found books but no chapters, keep books only.
    // If we found chapters without books, just list chapters.
    // Sort by page
    items.sort((a, b) => a.page - b.page || a.level - b.level);
    return items;
  }, [pages, raw]);

  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(pageKey(id)) ?? "0");
      if (Number.isFinite(saved)) setPageIndex(saved);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    setPageIndex((p) => clamp(p, 0, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  useEffect(() => {
    try {
      localStorage.setItem(pageKey(id), String(pageIndex));
    } catch {
      // ignore
    }
  }, [id, pageIndex]);

  const current = pages[clamp(pageIndex, 0, Math.max(0, totalPages - 1))] ?? "";

  const blocks = useMemo(() => {
    const cleaned = current
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Split into paragraphs/blocks.
    return cleaned
      ? cleaned.split(/\n\s*\n+/g).map((p) => p.trim()).filter(Boolean)
      : [];
  }, [current]);

  function normalizeInline(s: string) {
    // Many Gutenberg texts wrap lines at ~70 chars; merge soft line breaks.
    // Keep intentional short lines by only merging when there are multiple breaks.
    return s.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/book/${id}`} className="text-sm text-zinc-300 hover:text-white">
          ← Back to book
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => setTocOpen(true)}
            title="Table of contents"
          >
            TOC
          </button>
          <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setFontSize((s) => Math.max(14, s - 1))}>
            A-
          </button>
          <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setFontSize((s) => Math.min(26, s + 1))}>
            A+
          </button>
          <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setLineHeight((h) => Math.max(1.4, Math.round((h - 0.1) * 10) / 10))}>
            LH-
          </button>
          <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setLineHeight((h) => Math.min(2.2, Math.round((h + 0.1) * 10) / 10))}>
            LH+
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <button
            className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-40"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex <= 0}
          >
            ← Prev page
          </button>
          <button
            className="rounded-md bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
            onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageIndex >= totalPages - 1}
          >
            Next page →
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <span>Page</span>
          <input
            className="h-9 w-20 rounded-md bg-black/40 px-2 text-sm text-white ring-1 ring-white/10"
            value={totalPages ? pageIndex + 1 : 0}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              setPageIndex(clamp(n - 1, 0, Math.max(0, totalPages - 1)));
            }}
          />
          <span className="text-zinc-500">/ {totalPages}</span>
        </div>
      </div>

      {/* TOC overlay */}
      {tocOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setTocOpen(false)}>
          <div
            className="mx-auto max-w-2xl rounded-xl bg-black p-4 ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Table of contents</div>
              <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setTocOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-3 max-h-[70vh] overflow-auto">
              {toc.length ? (
                <div className="divide-y divide-white/10">
                  {toc.map((it, idx) => (
                    <button
                      key={`${it.title}-${it.page}-${idx}`}
                      className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left text-sm text-zinc-200 hover:bg-white/5"
                      onClick={() => {
                        setPageIndex(it.page);
                        setTocOpen(false);
                      }}
                    >
                      <span className={"line-clamp-1 " + (it.level === 0 ? "font-semibold" : "pl-4")}>{it.title}</span>
                      <span className="text-xs text-zinc-500">p. {it.page + 1}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-zinc-400">No headings found.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-lg bg-white/5 p-5 ring-1 ring-white/10">
        {loading ? (
          <div className="text-sm text-zinc-400">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-300">{error}</div>
        ) : (
          <article className="text-zinc-100" style={{ fontSize, lineHeight }}>
            {blocks.length ? (
              <div className="space-y-4">
                {blocks.map((b, i) => {
                  const text = normalizeInline(b);
                  const isHeading = /^([A-Z][A-Z\s'\-]{2,}|(chapter|book|part)\s+[\w\divxlc]+\s*[.:\-]?\s*.+|\d+\.)$/i.test(text);

                  if (isHeading) {
                    return (
                      <h2 key={i} className="pt-2 text-lg font-bold tracking-wide text-white">
                        {text}
                      </h2>
                    );
                  }

                  return (
                    <p key={i} className="text-zinc-100/95">
                      {text}
                    </p>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-zinc-400">No text.</div>
            )}
          </article>
        )}
      </div>

      <div className="mt-6 text-xs text-zinc-500">
        Text served via Gutendex formats. Always verify licensing/copyright on Gutenberg.
      </div>
    </main>
  );
}
