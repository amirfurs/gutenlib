"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Search,
  Settings2,
  Users,
  Shield,
  BookOpen,
} from "lucide-react";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type ReaderPrefs, type ReaderTheme } from "@/lib/abl/readerPrefs";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function paginateText(input: string, targetChars = 3200) {
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

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderWithHighlight(text: string, highlight?: string) {
  const needle = (highlight || "").replace(/\s+/g, " ").trim();
  if (!needle) return text;

  const pattern = needle
    .split(" ")
    .filter(Boolean)
    .map(escapeRegExp)
    .join("\\s+");

  try {
    const re = new RegExp(`(${pattern})`, "gi");
    const bits = text.split(re);
    if (bits.length <= 1) return text;

    let k = 0;
    return bits.map((part, idx) =>
      idx % 2 === 1 ? (
        <mark
          key={`hl-${k++}`}
          className="rounded bg-yellow-400/40 px-1 py-0.5 font-medium text-white ring-1 ring-yellow-400/50"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch {
    return text;
  }
}

function HighlightedSearchMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = escapeRegExp(query.trim());
  try {
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="rounded bg-brand-500/40 px-0.5 font-medium text-white not-italic">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  } catch {
    return <span>{text}</span>;
  }
}

export function RoomReader({
  bookId,
  chunkIndex,
  onChunkChange,
  isHost,
  textUrl,
  highlightText,
  bookTitle,
  bookAuthor,
}: {
  bookId: number;
  chunkIndex: number;
  onChunkChange: (next: number) => void;
  isHost: boolean;
  textUrl?: string;
  highlightText?: string;
  bookTitle?: string;
  bookAuthor?: string;
}) {
  const [raw, setRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local browsing state vs synced room state
  const [localPageIndex, setLocalPageIndex] = useState(chunkIndex);

  // Synchronize when the host changes the page in the room
  useEffect(() => {
    setLocalPageIndex(chunkIndex);
  }, [chunkIndex]);

  // Reading settings & preferences (matching main reader)
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  const effectiveTheme: ReaderTheme = useMemo(() => {
    if (prefs.theme !== "system") return prefs.theme;
    try {
      return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "dark";
    }
  }, [prefs.theme]);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ page: number; excerpt: string }>>([]);

  // Table of Contents state
  const [tocOpen, setTocOpen] = useState(false);

  // Load book text
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
        const msg = e instanceof Error ? e.message : "Failed to load book text";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, textUrl]);

  // Paginate with deterministic length so host and all participants share exact page boundaries
  const pages = useMemo(() => paginateText(raw, 3200), [raw]);
  const totalPages = pages.length;
  const clampedPage = clamp(localPageIndex, 0, Math.max(0, totalPages - 1));

  // Determine Table of Contents from headings
  type TocItem = { title: string; page: number; level: 0 | 1 };

  const toc = useMemo(() => {
    if (!pages.length) return [];
    const items: TocItem[] = [];
    const seen = new Set<string>();

    pages.forEach((pageContent, pIdx) => {
      const lines = pageContent.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.length > 80) continue;
        const isHeading =
          /^([A-Z][A-Z\s'\-]{2,}|(chapter|book|part)\s+[\w\divxlc]+\s*[.:\-]?\s*.+|\d+\.)$/i.test(line) ||
          /^\*\*\*\s*(chapter|book|part)\b/i.test(line);

        if (isHeading) {
          const title = line.replace(/\s+/g, " ").trim();
          const key = title.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            const isSub = /^(chapter|\d+\.)/i.test(title);
            items.push({ title, page: pIdx, level: isSub ? 1 : 0 });
          }
        }
      }
    });

    return items;
  }, [pages]);

  // Current page blocks
  const current = pages[clampedPage] ?? "";
  const blocks = useMemo(() => {
    const cleaned = current.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return cleaned ? cleaned.split(/\n\s*\n+/g).map((p) => p.trim()).filter(Boolean) : [];
  }, [current]);

  function normalizeInline(s: string) {
    return s.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  }

  // Navigate page (with host synchronization)
  const goToPage = (next: number) => {
    const target = clamp(next, 0, Math.max(0, totalPages - 1));
    setLocalPageIndex(target);
    if (isHost) {
      onChunkChange(target);
    }
  };

  // Keyboard navigation & search shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") {
        return;
      }
      if (e.key === "ArrowLeft") goToPage(clampedPage - 1);
      if (e.key === "ArrowRight") goToPage(clampedPage + 1);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clampedPage, totalPages, isHost]);

  // In-book search function
  function runSearch() {
    const q = searchQ.trim().toLowerCase();
    if (!q || !pages.length) return;
    setSearching(true);
    setHasSearched(true);

    const out: Array<{ page: number; excerpt: string }> = [];
    pages.forEach((pageText, pIdx) => {
      const lower = pageText.toLowerCase();
      let pos = lower.indexOf(q);
      while (pos !== -1) {
        const start = Math.max(0, pos - 50);
        const end = Math.min(pageText.length, pos + q.length + 50);
        const prefix = start > 0 ? "..." : "";
        const suffix = end < pageText.length ? "..." : "";
        const excerpt = prefix + pageText.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
        out.push({ page: pIdx, excerpt });
        if (out.length >= 80) break;
        pos = lower.indexOf(q, pos + Math.max(1, q.length));
      }
    });

    setSearchResults(out);
    setSearching(false);
  }

  const isDesyncedFromHost = !isHost && clampedPage !== chunkIndex;
  const progressPercent = totalPages ? Math.round(((clampedPage + 1) / totalPages) * 100) : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent mb-3" />
        <div className="text-sm font-medium text-zinc-300">Loading book for the room…</div>
        <div className="text-xs text-zinc-500 mt-1">Fetching text from Gutenberg archive</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 p-6 text-center ring-1 ring-red-500/20">
        <div className="text-sm font-semibold text-red-300">Unable to load book</div>
        <div className="mt-1 text-xs text-zinc-400">{error}</div>
      </div>
    );
  }

  return (
    <div
      className={
        "relative rounded-xl transition-colors duration-200 " +
        (effectiveTheme === "light"
          ? "bg-zinc-100 text-zinc-900"
          : "bg-white/5 text-zinc-100 ring-1 ring-white/10")
      }
    >
      {/* Reader Top Bar (Exact styling matching main book reader) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 px-3 sm:px-4 py-3">
        {/* Left: Progress bar & Live Indicator */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className="hidden xs:flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
            <BookOpen className="h-3.5 w-3.5 text-brand-500" />
            <span className="font-semibold text-white">Live Reader</span>
          </div>

          <div className="h-2 w-20 sm:w-32 overflow-hidden rounded bg-white/10 shrink-0">
            <div
              className="h-full bg-brand-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="tabular-nums text-xs font-semibold text-zinc-300 shrink-0">
            {progressPercent}%
          </div>

          {/* Sync indicator */}
          {isHost ? (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-400 ring-1 ring-brand-500/30">
              <Shield className="h-3 w-3" /> Host Controller
            </span>
          ) : isDesyncedFromHost ? (
            <button
              onClick={() => setLocalPageIndex(chunkIndex)}
              className="pressable inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-yellow-300 ring-1 ring-yellow-500/30 hover:bg-yellow-500/25"
              title="Return to host's active page"
            >
              <Users className="h-3 w-3" /> Sync to Host (p. {chunkIndex + 1})
            </button>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-white/10">
              <Users className="h-3 w-3 text-emerald-400" /> Synced with Host
            </span>
          )}
        </div>

        {/* Right: Controls (Previous, Next, Page Badge, Settings, Search, TOC) */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Page Counter Badge */}
          <div className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-zinc-300 ring-1 ring-white/10">
            <span className="text-zinc-500">Page</span>
            <span className="font-bold text-white">{clampedPage + 1}</span>
            <span className="text-zinc-500">/ {totalPages}</span>
          </div>

          {/* Previous Page */}
          <button
            className="pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none"
            onClick={() => goToPage(clampedPage - 1)}
            disabled={clampedPage <= 0}
            aria-label="Previous page"
            title="Previous page (Left Arrow)"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Next Page */}
          <button
            className="pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none"
            onClick={() => goToPage(clampedPage + 1)}
            disabled={clampedPage >= totalPages - 1}
            aria-label="Next page"
            title="Next page (Right Arrow)"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Reading Settings Button */}
          <button
            className="pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-white hover:bg-white/15"
            onClick={() => setPrefsOpen(true)}
            aria-label="Reading settings"
            title="Reading settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          {/* Quick Typography Toggle (Aa) */}
          <div className="relative">
            <button
              type="button"
              className={
                "pressable min-h-[36px] px-2.5 py-1.5 text-xs font-bold rounded-lg ring-1 transition " +
                (typeOpen
                  ? "bg-white/20 text-white ring-white/30"
                  : "bg-white/10 text-white ring-white/10 hover:bg-white/15")
              }
              onClick={() => setTypeOpen((v) => !v)}
              title="Typography quick controls"
            >
              Aa
            </button>
            {typeOpen && (
              <div
                className="origin-top-popover absolute right-0 top-[calc(100%+8px)] z-40 w-56 rounded-xl bg-zinc-950 p-3 ring-1 ring-white/15 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">
                  Font Size: {prefs.fontSizePx}px
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    className="pressable flex-1 rounded bg-white/10 py-1.5 text-xs font-bold text-white hover:bg-white/15"
                    onClick={() =>
                      setPrefs((p) => ({ ...p, fontSizePx: Math.max(14, p.fontSizePx - 1) }))
                    }
                  >
                    A-
                  </button>
                  <button
                    className="pressable flex-1 rounded bg-white/10 py-1.5 text-xs font-bold text-white hover:bg-white/15"
                    onClick={() =>
                      setPrefs((p) => ({ ...p, fontSizePx: Math.min(26, p.fontSizePx + 1) }))
                    }
                  >
                    A+
                  </button>
                </div>
                <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">
                  Line Height: {prefs.lineHeight.toFixed(2)}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="pressable flex-1 rounded bg-white/10 py-1.5 text-xs font-bold text-white hover:bg-white/15"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        lineHeight: Math.max(1.4, Math.round((p.lineHeight - 0.1) * 10) / 10),
                      }))
                    }
                  >
                    LH-
                  </button>
                  <button
                    className="pressable flex-1 rounded bg-white/10 py-1.5 text-xs font-bold text-white hover:bg-white/15"
                    onClick={() =>
                      setPrefs((p) => ({
                        ...p,
                        lineHeight: Math.min(2.4, Math.round((p.lineHeight + 0.1) * 10) / 10),
                      }))
                    }
                  >
                    LH+
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Search Button */}
          <button
            className={
              "pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-semibold transition " +
              (searchResults.length > 0
                ? "bg-brand-500 text-white hover:bg-brand-600"
                : "bg-white/10 text-white hover:bg-white/15")
            }
            onClick={() => setSearchOpen(true)}
            aria-label="Search in book"
            title="Search in book (Ctrl/⌘ + F)"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Table of Contents Button */}
          <button
            className="pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-brand-500 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            onClick={() => setTocOpen(true)}
            disabled={!toc.length}
            aria-label="Table of contents"
            title="Table of contents"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Reader Body Content */}
      <div className="p-4 sm:p-6 md:p-8 min-h-[420px]">
        <article
          className={
            "mx-auto max-w-3xl select-text transition-all duration-150 " +
            (effectiveTheme === "light" ? "text-zinc-900" : "text-zinc-100")
          }
          style={{
            fontSize: `${prefs.fontSizePx}px`,
            lineHeight: prefs.lineHeight,
          }}
        >
          {blocks.length ? (
            <div className="space-y-4">
              {blocks.map((b, i) => {
                const text = normalizeInline(b);
                const isHeading =
                  /^([A-Z][A-Z\s'\-]{2,}|(chapter|book|part)\s+[\w\divxlc]+\s*[.:\-]?\s*.+|\d+\.)$/i.test(
                    text
                  ) || /^\*\*\*\s*(chapter|book|part)\b/i.test(text);

                if (isHeading) {
                  return (
                    <h2
                      key={i}
                      className={
                        "pt-3 pb-1 text-lg font-bold tracking-wide " +
                        (effectiveTheme === "light" ? "text-zinc-950" : "text-white")
                      }
                    >
                      {renderWithHighlight(text, highlightText)}
                    </h2>
                  );
                }

                return (
                  <p
                    key={i}
                    className={
                      effectiveTheme === "light"
                        ? "text-zinc-800 leading-relaxed"
                        : "text-zinc-100/95 leading-relaxed"
                    }
                  >
                    {renderWithHighlight(text, highlightText)}
                  </p>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-zinc-400">Empty page content.</div>
          )}
        </article>
      </div>

      {/* Settings Modal (Matching main reader) */}
      {prefsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-md"
          onClick={() => setPrefsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-zinc-950 p-5 sm:p-6 ring-1 ring-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="text-base font-semibold text-white">Reading settings</div>
              <button
                className="pressable rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"
                onClick={() => setPrefsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-xs text-zinc-400">Theme</div>
                <div className="mt-2 flex gap-2">
                  {(["system", "light", "dark"] as const).map((t) => (
                    <button
                      key={t}
                      className={
                        "pressable flex-1 rounded-lg px-3 py-2 text-xs font-semibold ring-1 transition " +
                        (prefs.theme === t
                          ? "bg-brand-500 text-white ring-brand-500/40"
                          : "bg-white/5 text-zinc-200 ring-white/10 hover:bg-white/10")
                      }
                      onClick={() => setPrefs((p) => ({ ...p, theme: t }))}
                    >
                      {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-400">Font size</div>
                  <div className="text-xs tabular-nums text-zinc-200">{prefs.fontSizePx}px</div>
                </div>
                <input
                  type="range"
                  min={14}
                  max={26}
                  value={prefs.fontSizePx}
                  onChange={(e) => setPrefs((p) => ({ ...p, fontSizePx: Number(e.target.value) }))}
                  className="mt-2 w-full accent-brand-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-400">Line height</div>
                  <div className="text-xs tabular-nums text-zinc-200">
                    {prefs.lineHeight.toFixed(2)}
                  </div>
                </div>
                <input
                  type="range"
                  min={1.4}
                  max={2.4}
                  step={0.05}
                  value={prefs.lineHeight}
                  onChange={(e) => setPrefs((p) => ({ ...p, lineHeight: Number(e.target.value) }))}
                  className="mt-2 w-full accent-brand-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  className="pressable rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                  onClick={() => setPrefs(DEFAULT_PREFS)}
                >
                  Reset
                </button>
                <div className="text-xs text-zinc-500">Saved locally</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table of Contents Modal */}
      {tocOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-md"
          onClick={() => setTocOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-zinc-950 p-4 sm:p-6 ring-1 ring-white/10 shadow-2xl max-h-[85dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <div className="text-base font-semibold text-white">Table of contents</div>
                <div className="text-xs text-zinc-400">
                  {isHost ? "Click any chapter to navigate the room" : "Click to view chapters"}
                </div>
              </div>
              <button
                className="pressable rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                onClick={() => setTocOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto">
              {toc.length ? (
                <div className="divide-y divide-white/10">
                  {toc.map((it, idx) => (
                    <button
                      key={`${it.title}-${it.page}-${idx}`}
                      className={
                        "pressable flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm rounded-lg transition " +
                        (clampedPage === it.page ? "bg-brand-500/15 text-white ring-1 ring-brand-500/30" : "text-zinc-200 hover:bg-white/5")
                      }
                      onClick={() => {
                        goToPage(it.page);
                        setTocOpen(false);
                      }}
                    >
                      <span className={"line-clamp-1 " + (it.level === 0 ? "font-semibold text-white" : "pl-4 text-zinc-300")}>
                        {it.title}
                      </span>
                      <span className="text-xs text-zinc-500 shrink-0">p. {it.page + 1}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-zinc-400">No chapters found for this text.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* In-Book Search Modal (Exact layout & highlighting as main reader) */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-md"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-zinc-950 p-4 sm:p-6 ring-1 ring-white/10 shadow-2xl max-h-[85dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <div className="text-base font-semibold text-white">Search in book</div>
                <div className="text-xs text-zinc-400">
                  {isHost ? "Search text across all pages and jump the room to matches" : "Search text across all pages"}
                </div>
              </div>
              <button
                className="pressable rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                onClick={() => setSearchOpen(false)}
              >
                Close
              </button>
            </div>

            <form
              className="mt-4 flex gap-2 shrink-0"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
            >
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Type word or phrase to find…"
                className="h-10 w-full rounded-lg bg-white/5 px-3.5 text-sm text-white ring-1 ring-white/10 placeholder:text-zinc-500 focus:outline-none focus:ring-brand-500"
                autoFocus
              />
              <button
                type="submit"
                className="pressable h-10 rounded-lg bg-brand-500 px-4 sm:px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 shrink-0"
                disabled={!searchQ.trim() || searching}
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-400 shrink-0 px-1">
                <span>
                  Found <strong className="text-white">{searchResults.length}</strong> {searchResults.length === 1 ? "match" : "matches"}
                </span>
                <span>Click any match to jump</span>
              </div>
            )}

            <div className="mt-3 flex-1 overflow-y-auto min-h-[140px]">
              {searchResults.length ? (
                <div className="divide-y divide-white/10">
                  {searchResults.map((r, idx) => (
                    <button
                      key={`${r.page}-${idx}`}
                      className="pressable w-full px-3 py-3 text-left rounded-lg transition hover:bg-white/5 flex flex-col gap-1"
                      onClick={() => {
                        goToPage(r.page);
                        setSearchOpen(false);
                      }}
                    >
                      <div className="text-[11px] font-semibold text-brand-400">
                        Page {r.page + 1} of {totalPages}
                      </div>
                      <div className="text-sm text-zinc-200 leading-relaxed line-clamp-2">
                        <HighlightedSearchMatch text={r.excerpt} query={searchQ.trim()} />
                      </div>
                    </button>
                  ))}
                </div>
              ) : searching ? (
                <div className="py-12 text-center text-sm text-zinc-400">Searching across pages…</div>
              ) : hasSearched ? (
                <div className="py-12 text-center text-sm text-zinc-400">
                  No matches found for &ldquo;<span className="text-white font-medium">{searchQ}</span>&rdquo;.
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-zinc-400">
                  Enter a keyword or phrase above and press <span className="text-zinc-200 font-medium">Search</span>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
