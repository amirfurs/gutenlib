"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, List, Search, Settings2, StickyNote } from "lucide-react";
import ePub, { type Book, type Rendition } from "epubjs";
import { getEntry, markFinished, upsertEntry } from "@/lib/readingStore";
import { addNote, getNotesForBook, type NoteRow } from "@/lib/library/db";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type ReaderPrefs, type ReaderTheme } from "@/lib/abl/readerPrefs";

type TocItem = {
  id: string;
  label: string;
  href: string;
  subitems?: TocItem[];
};

function flattenToc(items: TocItem[], level = 0): Array<{ label: string; href: string; level: number }> {
  const out: Array<{ label: string; href: string; level: number }> = [];
  for (const it of items) {
    out.push({ label: it.label, href: it.href, level });
    if (it.subitems?.length) out.push(...flattenToc(it.subitems, level + 1));
  }
  return out;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-brand-500/40 text-white rounded px-0.5 font-medium not-italic">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

export function EpubReader({ id, initialCfi }: { id: string; initialCfi?: string }) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [progressReady, setProgressReady] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // reading prefs
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const effectiveTheme: ReaderTheme = useMemo(() => {
    if (prefs.theme !== "system") return prefs.theme;
    try {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "dark";
    }
  }, [prefs.theme]);

  // search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ cfi: string; excerpt: string; label?: string }>>([]);
  const [matchIdx, setMatchIdx] = useState<number>(-1);
  const searchRunId = useRef(0);
  const highlightedCfiRef = useRef<string | null>(null);

  // notes (english library)
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState<Array<{ id: string; text: string; loc?: string; updatedAt: number }>>([]);

  const flatToc = useMemo(() => flattenToc(toc), [toc]);

  // load + persist reading prefs
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  const tocLabelByHref = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of flatToc) {
      const href = (it.href || "").split("#")[0];
      if (href && !map.has(href)) map.set(href, it.label);
    }
    return map;
  }, [flatToc]);

  // Main effect: loads the EPUB file once
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);
        setProgress(0);
        setProgressReady(false);

        const existing = getEntry(String(id));
        if (existing?.finished) setIsFinished(true);
        else setIsFinished(false);

        // Fetch book metadata asynchronously for reading list
        let meta: { title?: string; author?: string; cover?: string | null } = {};
        fetch(`/api/book/${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((b) => {
            if (b) {
              meta = {
                title: b?.title,
                author: b?.authors?.[0]?.name ?? "Unknown",
                cover: b?.formats?.["image/jpeg"] ?? null,
              };
            }
          })
          .catch(() => {});

        const res = await fetch(`/api/epub/${id}`);
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || `Failed to load EPUB (HTTP ${res.status})`);
        }

        const buf = await res.arrayBuffer();
        if (cancelled) return;

        // Cleanup any prior instance
        try {
          renditionRef.current?.destroy?.();
          bookRef.current?.destroy?.();
        } catch {}

        const book = ePub(buf);
        bookRef.current = book;

        await book.ready;
        await Promise.all([
          book.loaded.navigation.catch(() => {}),
          book.loaded.spine.catch(() => {}),
        ]);

        const nav: any = (book as any).navigation;
        const tocItems: TocItem[] = (nav?.toc ?? []) as any;
        setToc(tocItems);

        // Render
        const el = viewerRef.current;
        if (!el) throw new Error("Reader container missing");

        el.innerHTML = "";
        const rendition = book.renderTo(el, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          manager: "default",
        });
        renditionRef.current = rendition;

        // Themes
        rendition.themes.register("dark", {
          body: {
            background: "#000",
            color: "#fff",
          },
          a: { color: "#E50914" },
        });
        rendition.themes.register("light", {
          body: {
            background: "#fff",
            color: "#111",
          },
          a: { color: "#E50914" },
        });

        // Apply initial theme + typography
        rendition.themes.select(effectiveTheme === "light" ? "light" : "dark");
        rendition.themes.fontSize(`${prefs.fontSizePx}px`);
        rendition.themes.default({ body: { lineHeight: String(prefs.lineHeight) } });

        // Try to restore last CFI (or open specific CFI)
        const savedCfi = existing?.cfi;
        const desiredCfi = initialCfi || savedCfi;
        if (desiredCfi) {
          await rendition.display(desiredCfi);
        } else {
          await rendition.display();
        }

        // Rendered! Hide loading indicator immediately
        if (!cancelled) setLoading(false);

        const updateFromCfi = (cfi?: string) => {
          if (!cfi) return;
          let p = 0;
          try {
            // @ts-ignore
            p = (book as any).locations?.percentageFromCfi?.(cfi) ?? 0;
          } catch {
            p = 0;
          }
          if (!cancelled) setProgress(p);
          void refreshNotes(cfi);

          upsertEntry(String(id), {
            ...meta,
            cfi,
            progress: p,
            finished: existing?.finished ?? false,
          });
        };

        // Track progress on page changes
        // @ts-ignore
        rendition.on?.("relocated", (loc: any) => {
          const cfi = loc?.start?.cfi;
          updateFromCfi(cfi);
        });

        updateFromCfi(savedCfi);

        // Keyboard nav + find
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft") rendition.prev();
          if (e.key === "ArrowRight") rendition.next();
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
            e.preventDefault();
            setSearchOpen(true);
          }
        };
        window.addEventListener("keydown", onKey);
        // Also capture inside iframe
        // @ts-ignore
        rendition.on?.("keydown", onKey);

        // Build locations asynchronously in background to compute exact percentage
        (book as any).locations
          ?.generate?.(1500)
          .then(() => {
            if (!cancelled) {
              setProgressReady(true);
              const curCfi = (renditionRef.current as any)?.location?.start?.cfi;
              if (curCfi) updateFromCfi(curCfi);
            }
          })
          .catch(() => {
            if (!cancelled) setProgressReady(false);
          });

        return () => {
          window.removeEventListener("keydown", onKey);
        };
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
        if (!cancelled) setLoading(false);
      }
    }

    const cleanupPromise = run();

    return () => {
      cancelled = true;
      Promise.resolve(cleanupPromise).catch(() => {});
      try {
        renditionRef.current?.destroy?.();
        bookRef.current?.destroy?.();
      } catch {}
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [id, initialCfi]);

  // Synchronize themes and typography preferences dynamically without reloading the EPUB
  useEffect(() => {
    const rendition: any = renditionRef.current;
    if (!rendition?.themes) return;
    try {
      rendition.themes.select(effectiveTheme === "light" ? "light" : "dark");
      rendition.themes.fontSize(`${prefs.fontSizePx}px`);
      rendition.themes.default({ body: { lineHeight: String(prefs.lineHeight) } });
    } catch {
      // ignore
    }
  }, [effectiveTheme, prefs.fontSizePx, prefs.lineHeight]);

  function clearHighlight() {
    const rendition: any = renditionRef.current as any;
    const prev = highlightedCfiRef.current;
    if (!rendition?.annotations || !prev) return;
    try {
      rendition.annotations.remove(prev, "highlight");
    } catch {
      // ignore
    }
    highlightedCfiRef.current = null;
  }

  function applyHighlight(cfi: string) {
    const rendition: any = renditionRef.current as any;
    if (!rendition?.annotations) return;

    clearHighlight();
    try {
      rendition.annotations.highlight(
        cfi,
        { type: "search" },
        undefined,
        "gutenlib-search-hit",
        {
          fill: "#E50914",
          "fill-opacity": "0.35",
          "mix-blend-mode": "screen",
        }
      );
      highlightedCfiRef.current = cfi;
    } catch {
      // ignore
    }
  }

  async function goToMatch(nextIdx: number) {
    if (!searchResults.length) return;
    const idx = ((nextIdx % searchResults.length) + searchResults.length) % searchResults.length;
    const target = searchResults[idx];
    if (!target) return;

    setMatchIdx(idx);
    try {
      await renditionRef.current?.display(target.cfi);
      applyHighlight(target.cfi);
      // Secondary retry ensures highlight paints even across newly attached section viewports
      setTimeout(() => applyHighlight(target.cfi), 60);
    } catch {
      // ignore
    }
  }

  async function refreshNotes(currentCfi?: string) {
    const bookKey = `gutendex:${id}`;
    const rows = (await getNotesForBook(bookKey)) as NoteRow[];
    // Keep newest first
    const mapped = rows.map((r) => ({ id: r.id, text: r.text, loc: (r as any).loc as string | undefined, updatedAt: r.updatedAt }));

    // If we have a current location, prefer notes near this CFI
    if (currentCfi) {
      mapped.sort((a, b) => {
        const aNear = a.loc && a.loc === currentCfi ? 1 : 0;
        const bNear = b.loc && b.loc === currentCfi ? 1 : 0;
        if (aNear !== bNear) return bNear - aNear;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
    }

    setNotes(mapped);
  }

  async function runSearch() {
    const q = searchQ.trim();
    if (!q) return;

    const book: any = bookRef.current as any;
    const rendition: any = renditionRef.current as any;
    if (!book || !rendition) return;

    const runId = ++searchRunId.current;
    setSearching(true);
    setHasSearched(true);
    setSearchResults([]);
    setMatchIdx(-1);
    clearHighlight();

    try {
      const spineItems: any[] = book?.spine?.spineItems ?? [];
      const out: Array<{ cfi: string; excerpt: string; label?: string }> = [];

      for (const sec of spineItems) {
        if (searchRunId.current !== runId) return; // cancelled

        const wasLoaded = !!sec.document;

        try {
          // Ensure the section document is loaded before searching
          if (!wasLoaded) {
            await sec.load(book.load.bind(book));
          }

          // Use sec.find (reliable DOM search) with sec.search fallback
          let hits: Array<{ cfi: string; excerpt: string }> = [];
          if (typeof sec.find === "function") {
            try {
              hits = sec.find(q) || [];
            } catch {
              hits = [];
            }
          }
          if (!hits.length && typeof sec.search === "function") {
            try {
              hits = sec.search(q) || [];
            } catch {
              hits = [];
            }
          }

          const href = String(sec?.href ?? "").split("#")[0];
          const label = tocLabelByHref.get(href);

          for (const h of hits) {
            if (!h?.cfi) continue;
            const cleanExcerpt = (h.excerpt || "").replace(/\s+/g, " ").trim();
            out.push({ cfi: h.cfi, excerpt: cleanExcerpt, label });
            if (out.length >= 100) break;
          }
        } catch {
          // ignore section errors
        } finally {
          // Only unload if it was not already loaded by the active reader
          if (!wasLoaded) {
            try {
              sec.unload?.();
            } catch {
              // ignore
            }
          }
        }

        if (out.length >= 100) break;
      }

      if (searchRunId.current !== runId) return;
      setSearchResults(out);
      setMatchIdx(out.length ? 0 : -1);
    } finally {
      if (searchRunId.current === runId) setSearching(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-3 sm:px-4 py-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Link href={`/book/${id}`} className="pressable min-h-[38px] inline-flex items-center text-xs sm:text-sm text-zinc-300 hover:text-white">
          ← Back to book
        </Link>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-2 rounded-md bg-white/5 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-white/10 sm:flex">
            <span className="text-zinc-400">Progress</span>
            <span className="font-semibold text-white">{Math.round(progress * 100)}%</span>
            <span className="text-zinc-500">{progressReady ? "" : "(estimating…)"}</span>
          </div>

          <button
            className={
              "pressable min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg " +
              (isFinished
                ? "bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                : "bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15")
            }
            onClick={() => {
              const next = !isFinished;
              setIsFinished(next);
              markFinished(String(id), next);
            }}
            aria-label={isFinished ? "Finished" : "Mark finished"}
            title={isFinished ? "Finished" : "Mark finished"}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>

          <button
            className="pressable min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => {
              void refreshNotes((renditionRef.current as any)?.location?.start?.cfi);
              setNotesOpen(true);
              setNoteText("");
            }}
            aria-label="Notes"
            title="Notes"
          >
            <StickyNote className="h-4 w-4" />
          </button>

          <button
            className="pressable min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => setPrefsOpen(true)}
            aria-label="Reading settings"
            title="Reading settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          <button
            className="pressable min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => renditionRef.current?.prev()}
            aria-label="Previous"
            title="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="pressable min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => renditionRef.current?.next()}
            aria-label="Next"
            title="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {searchResults.length ? (
            <div className="flex items-center gap-1.5 sm:gap-2 rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-300 ring-1 ring-white/10">
              <button
                className="pressable rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/15"
                onClick={() => goToMatch((matchIdx < 0 ? 0 : matchIdx) - 1)}
                title="Previous match"
              >
                Prev
              </button>
              <div className="tabular-nums text-zinc-300 text-xs font-medium">
                {Math.max(0, matchIdx) + 1}/{searchResults.length}
              </div>
              <button
                className="pressable rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/15"
                onClick={() => goToMatch((matchIdx < 0 ? 0 : matchIdx) + 1)}
                title="Next match"
              >
                Next
              </button>
            </div>
          ) : null}

          <button
            className={
              "pressable min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition " +
              (searchResults.length > 0 ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-white/10 text-white hover:bg-white/15")
            }
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            title="Search (Ctrl/⌘ + F)"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            className="pressable min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            onClick={() => setTocOpen(true)}
            disabled={!flatToc.length}
            aria-label="Table of contents"
            title="Table of contents"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {notesOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setNotesOpen(false)}>
          <div className="mx-auto mt-[12vh] max-w-2xl rounded-xl bg-black p-4 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Notes</div>
              <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setNotesOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">This book</div>
                <div className="mt-2 grid gap-2">
                  {!notes.length ? <div className="text-sm text-zinc-400">No notes yet.</div> : null}
                  {notes.map((n) => (
                    <button
                      key={n.id}
                      className="w-full rounded-md bg-black/30 p-3 text-left text-sm text-zinc-100 ring-1 ring-white/10 hover:bg-black/20"
                      onClick={async () => {
                        const cfi = n.loc;
                        if (cfi) await renditionRef.current?.display(cfi);
                        setNotesOpen(false);
                      }}
                    >
                      <div className="whitespace-pre-wrap">{n.text}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">Add a note</div>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Write your note…"
                  className="mt-2 h-28 w-full rounded-md bg-black/40 px-3 py-2 text-sm text-white ring-1 ring-white/10"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">Saved locally</div>
                  <button
                    className="rounded-md bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                    disabled={!noteText.trim()}
                    onClick={async () => {
                      const cfi = (renditionRef.current as any)?.location?.start?.cfi as string | undefined;
                      const pct = Math.round(progress * 1000);
                      await addNote("english", `gutendex:${id}`, pct, noteText.trim(), cfi);
                      setNoteText("");
                      await refreshNotes(cfi);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {prefsOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setPrefsOpen(false)}>
          <div className="mx-auto mt-[12vh] max-w-md rounded-xl bg-black p-4 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Reading settings</div>
              <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setPrefsOpen(false)}>
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
                        "rounded-md px-3 py-2 text-xs font-semibold ring-1 transition " +
                        (prefs.theme === t ? "bg-brand-500 text-white ring-brand-500/40" : "bg-white/5 text-zinc-200 ring-white/10 hover:bg-white/10")
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
                  className="mt-2 w-full"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-400">Line height</div>
                  <div className="text-xs tabular-nums text-zinc-200">{prefs.lineHeight.toFixed(2)}</div>
                </div>
                <input
                  type="range"
                  min={1.4}
                  max={2.4}
                  step={0.05}
                  value={prefs.lineHeight}
                  onChange={(e) => setPrefs((p) => ({ ...p, lineHeight: Number(e.target.value) }))}
                  className="mt-2 w-full"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  onClick={() => setPrefs(DEFAULT_PREFS)}
                >
                  Reset
                </button>
                <div className="text-xs text-zinc-500">Saved locally</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-md" onClick={() => setSearchOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-2xl bg-zinc-950 p-4 sm:p-6 ring-1 ring-white/10 shadow-2xl max-h-[85dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div>
                <div className="text-base font-semibold text-white">Search in book</div>
                <div className="text-xs text-zinc-400">Search text across all chapters and sections</div>
              </div>
              <button
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 min-h-[36px]"
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
                className="h-10 rounded-lg bg-brand-500 px-4 sm:px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 shrink-0"
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
                      key={`${r.cfi}-${idx}`}
                      className={
                        "w-full px-3 py-3 text-left rounded-lg transition " +
                        (matchIdx === idx ? "bg-brand-500/15 ring-1 ring-brand-500/30" : "hover:bg-white/5")
                      }
                      onClick={() => {
                        goToMatch(idx);
                        setSearchOpen(false);
                      }}
                    >
                      {r.label ? (
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-400">
                          {r.label}
                        </div>
                      ) : null}
                      <div className="mt-1 line-clamp-3 text-sm text-zinc-200 leading-relaxed">
                        <HighlightedText text={r.excerpt} query={searchQ.trim()} />
                      </div>
                    </button>
                  ))}
                </div>
              ) : searching ? (
                <div className="py-12 text-center text-sm text-zinc-400">
                  <div className="animate-spin inline-block w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full mb-3" />
                  <div>Searching across all chapters and sections…</div>
                </div>
              ) : hasSearched ? (
                <div className="py-12 text-center text-sm text-zinc-400">
                  No matches found for &ldquo;<span className="text-white font-medium">{searchQ}</span>&rdquo;.
                  <div className="text-xs text-zinc-500 mt-1">Try another search term or check spelling.</div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-zinc-400">
                  Enter a keyword or phrase above and press <span className="text-zinc-200 font-medium">Search</span> or Enter.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tocOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setTocOpen(false)}>
          <div className="mx-auto max-w-2xl rounded-xl bg-black p-4 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Table of contents</div>
              <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setTocOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-3 max-h-[70vh] overflow-auto">
              {flatToc.length ? (
                <div className="divide-y divide-white/10">
                  {flatToc.map((it, idx) => (
                    <button
                      key={`${it.href}-${idx}`}
                      className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left text-sm text-zinc-200 hover:bg-white/5"
                      onClick={() => {
                        renditionRef.current?.display(it.href);
                        setTocOpen(false);
                      }}
                    >
                      <span className={"line-clamp-1 " + (it.level ? "pl-4" : "font-semibold")}>{it.label}</span>
                      <span className="text-xs text-zinc-500">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-zinc-400">No TOC found in this EPUB.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-white/10 px-3 sm:px-4 py-2 text-xs text-zinc-400 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="hidden xs:inline truncate">EPUB reader</div>
            <div className="h-2 w-24 sm:w-40 overflow-hidden rounded bg-white/10 shrink-0">
              <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="tabular-nums shrink-0">{Math.round(progress * 100)}%</div>
          </div>
          <a className="text-xs text-zinc-300 hover:text-white shrink-0" href={`/api/epub/${id}`} target="_blank" rel="noreferrer">
            Download EPUB
          </a>
        </div>

        <div className="relative h-[calc(100dvh-170px)] min-h-[460px]">
          {loading ? (
            <div className="absolute inset-0 grid place-items-center text-sm text-zinc-400">Loading EPUB…</div>
          ) : error ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div className="max-w-xl rounded-lg bg-black/40 p-4 ring-1 ring-white/10">
                <div className="text-sm font-semibold text-red-300">Reader error</div>
                <div className="mt-2 text-sm text-zinc-300">{error}</div>
                <div className="mt-4 flex justify-center gap-2">
                  <Link
                    href={`/read/${id}?mode=txt`}
                    className="pressable rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
                  >
                    Switch to Clean Text Reader
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          <div ref={viewerRef} className="h-full w-full" />
        </div>
      </div>
    </main>
  );
}
