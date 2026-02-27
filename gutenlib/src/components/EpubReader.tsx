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

  // reading prefs (same feature set as Arabic reader)
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

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
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

        // fetch metadata (title/cover/author) for reading list
        let meta: { title?: string; author?: string; cover?: string | null } = {};
        try {
          const bookRes = await fetch(`/api/book/${id}`);
          if (bookRes.ok) {
            const b = await bookRes.json();
            meta = {
              title: b?.title,
              author: b?.authors?.[0]?.name ?? "Unknown",
              cover: b?.formats?.["image/jpeg"] ?? null,
            };
          }
        } catch {
          // ignore
        }

        const res = await fetch(`/api/epub/${id}`);
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || `Failed to load EPUB (HTTP ${res.status})`);
        }

        const buf = await res.arrayBuffer();
        if (cancelled) return;

        // Cleanup any prior instance
        renditionRef.current?.destroy?.();
        bookRef.current?.destroy?.();

        const book = ePub(buf);
        bookRef.current = book;

        await book.ready;
        await book.loaded.navigation;

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

        // Themes + user prefs
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

        // Apply theme + typography
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

        // Build locations to compute percentage (can take a moment)
        try {
          // @ts-ignore
          await (book as any).locations.generate?.(1500);
          if (!cancelled) setProgressReady(true);
        } catch {
          // if locations fail, we still store CFI but percent may be 0
          if (!cancelled) setProgressReady(false);
        }

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
          // keep notes list reasonably fresh (best-effort)
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

        // Make sure we store at least once (initial display)
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

        if (!cancelled) setLoading(false);

        return () => window.removeEventListener("keydown", onKey);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load");
        if (!cancelled) setLoading(false);
      }
    }

    const cleanupPromise = run();

    return () => {
      cancelled = true;
      // best-effort cleanup
      Promise.resolve(cleanupPromise).catch(() => {});
      try {
        renditionRef.current?.destroy?.();
        bookRef.current?.destroy?.();
      } catch {
        // ignore
      }
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [id, initialCfi, effectiveTheme, prefs.fontSizePx, prefs.lineHeight]);

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
          "fill-opacity": "0.25",
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
    await renditionRef.current?.display(target.cfi);
    applyHighlight(target.cfi);
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
    setSearchResults([]);
    setMatchIdx(-1);
    clearHighlight();

    try {
      const spineItems: any[] = book?.spine?.spineItems ?? [];
      const out: Array<{ cfi: string; excerpt: string; label?: string }> = [];

      for (const sec of spineItems) {
        if (searchRunId.current !== runId) return; // cancelled
        if (!sec?.linear) continue;

        try {
          // Ensure the section document is loaded before searching
          await sec.load(book.load.bind(book));
          const hits: Array<{ cfi: string; excerpt: string }> = (sec.search?.(q) ?? []) as any;
          const href = String(sec?.href ?? "").split("#")[0];
          const label = tocLabelByHref.get(href);

          for (const h of hits) {
            out.push({ cfi: h.cfi, excerpt: h.excerpt, label });
            if (out.length >= 60) break;
          }
        } catch {
          // ignore section errors
        } finally {
          try {
            sec.unload?.();
          } catch {
            // ignore
          }
        }

        if (out.length >= 60) break;
      }

      if (searchRunId.current !== runId) return;
      setSearchResults(out);
      setMatchIdx(out.length ? 0 : -1);
    } finally {
      if (searchRunId.current === runId) setSearching(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/book/${id}`} className="text-sm text-zinc-300 hover:text-white">
          ← Back to book
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/10 sm:flex">
            <span className="text-zinc-400">Progress</span>
            <span className="font-semibold text-white">{Math.round(progress * 100)}%</span>
            <span className="text-zinc-500">{progressReady ? "" : "(estimating…)"}</span>
          </div>

          <button
            className={
              isFinished
                ? "rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                : "rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
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
            className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
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
            className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => setPrefsOpen(true)}
            aria-label="Reading settings"
            title="Reading settings"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          <button
            className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => renditionRef.current?.prev()}
            aria-label="Previous"
            title="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => renditionRef.current?.next()}
            aria-label="Next"
            title="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {searchResults.length ? (
            <div className="hidden items-center gap-2 rounded-md bg-white/5 px-2 py-2 text-xs text-zinc-300 ring-1 ring-white/10 md:flex">
              <button
                className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/15"
                onClick={() => goToMatch((matchIdx < 0 ? 0 : matchIdx) - 1)}
                title="Previous match"
              >
                Prev match
              </button>
              <div className="tabular-nums text-zinc-300">
                {Math.max(0, matchIdx) + 1}/{searchResults.length}
              </div>
              <button
                className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/15"
                onClick={() => goToMatch((matchIdx < 0 ? 0 : matchIdx) + 1)}
                title="Next match"
              >
                Next match
              </button>
            </div>
          ) : null}

          <button
            className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            title="Search (Ctrl/⌘ + F)"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            className="rounded-md bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
          <div className="mx-auto max-w-2xl rounded-xl bg-black p-4 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Search in book</div>
              <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setSearchOpen(false)}>
                Close
              </button>
            </div>

            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
            >
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search text…"
                className="h-10 w-full rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
                autoFocus
              />
              <button
                type="submit"
                className="h-10 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                disabled={!searchQ.trim() || searching}
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            <div className="mt-3 max-h-[70vh] overflow-auto">
              {searchResults.length ? (
                <div className="divide-y divide-white/10">
                  {searchResults.map((r, idx) => (
                    <button
                      key={`${r.cfi}-${idx}`}
                      className="w-full px-2 py-3 text-left text-sm text-zinc-200 hover:bg-white/5"
                      onClick={() => {
                        goToMatch(idx);
                        setSearchOpen(false);
                      }}
                    >
                      {r.label ? <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{r.label}</div> : null}
                      <div className="mt-1 line-clamp-3 text-sm text-zinc-200">{r.excerpt}</div>
                    </button>
                  ))}
                </div>
              ) : searching ? (
                <div className="px-2 py-3 text-sm text-zinc-400">Searching the whole book…</div>
              ) : (
                <div className="px-2 py-3 text-sm text-zinc-400">No results yet. Type a query and press Search.</div>
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

      <div className="mt-4 rounded-xl bg-white/5 ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-zinc-400">
          <div className="flex items-center gap-3">
            <div>EPUB reader (use ←/→ arrows)</div>
            <div className="h-2 w-40 overflow-hidden rounded bg-white/10">
              <div className="h-full bg-brand-500" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="tabular-nums">{Math.round(progress * 100)}%</div>
          </div>
          <a className="text-zinc-300 hover:text-white" href={`/api/epub/${id}`} target="_blank" rel="noreferrer">
            Download EPUB
          </a>
        </div>

        <div className="relative h-[78vh]">
          {loading ? (
            <div className="absolute inset-0 grid place-items-center text-sm text-zinc-400">Loading EPUB…</div>
          ) : error ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div className="max-w-xl rounded-lg bg-black/40 p-4 ring-1 ring-white/10">
                <div className="text-sm font-semibold text-red-300">Reader error</div>
                <div className="mt-2 text-sm text-zinc-300">{error}</div>
              </div>
            </div>
          ) : null}

          <div ref={viewerRef} className="h-full w-full" />
        </div>
      </div>
    </main>
  );
}
