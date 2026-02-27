"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List, Search, Settings2, CheckCircle2, StickyNote } from "lucide-react";
import { getEntry, markFinished, upsertEntry } from "@/lib/readingStore";
import { addNote, deleteNote, getNotesForBookPage } from "@/lib/library/db";
import { ABLSearchIndex } from "@/lib/abl/searchIndex";
import { LruPageCache, pageKey, prefetchPage, shouldAllowPrefetch } from "@/lib/abl/pageCache";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type ReaderPrefs, type ReaderTheme } from "@/lib/abl/readerPrefs";

type TocItem = {
  id?: string;
  title?: string;
  pageNumber?: number;
  pageId?: string;
  children?: TocItem[];
};

type TocResponse = {
  items?: TocItem[];
};

type HtmlResponse = {
  data?: string;
  error?: string;
};

type Saved = {
  page?: number;
  pageId?: string;
  updatedAt: number;
};

function flatten(items: TocItem[], level = 0): Array<{ level: number; title: string; pageNumber?: number; pageId?: string }> {
  const out: Array<{ level: number; title: string; pageNumber?: number; pageId?: string }> = [];
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

export function ArabicReader({ id, initialPage }: { id: string; initialPage?: number }) {
  const KEY = `gutenlib.abl.read.${id}`;
  const STORE_ID = `abl:${id}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);

  const [isFinished, setIsFinished] = useState(false);
  const [meta, setMeta] = useState<{ title?: string; author?: string; cover?: string | null }>({});

  const [page, setPage] = useState<number | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [html, setHtml] = useState<string>("");

  // bottom controls
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState<string>("");
  const [sliderValue, setSliderValue] = useState<number>(1);

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

  const ui = useMemo(() => {
    const light = effectiveTheme === "light";
    return {
      link: light ? "text-zinc-600 hover:text-zinc-900" : "text-zinc-300 hover:text-white",

      btnBase: "rounded-md px-3 py-2 font-semibold transition",
      btnSm: "text-sm",
      btnXs: "text-xs",

      btn: light
        ? "bg-black/5 text-zinc-900 ring-1 ring-black/10 hover:bg-black/10"
        : "bg-white/10 text-white ring-1 ring-white/10 hover:bg-white/15",

      btnPrimary: "bg-brand-500 text-white hover:bg-brand-600",
      btnSuccess: "bg-emerald-600 text-white hover:bg-emerald-700",

      panel: light ? "bg-white text-zinc-900 ring-1 ring-black/10" : "bg-black text-white ring-1 ring-white/10",
      overlay: "bg-black/70 backdrop-blur-sm",
    };
  }, [effectiveTheme]);

  const [searchQ, setSearchQ] = useState("");

  // notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notes, setNotes] = useState<Array<{ id: string; text: string; pageNumber: number; updatedAt: number }>>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ pageNumber: number; excerpt: string }>>([]);
  const [matchIdx, setMatchIdx] = useState(-1);
  const [highlightTerm, setHighlightTerm] = useState<string>("");
  const searchAbortRef = useRef<AbortController | null>(null);

  const contentRef = useRef<HTMLDivElement | null>(null);

  const cacheRef = useRef<LruPageCache | null>(null);
  const searchIndexRef = useRef<ABLSearchIndex | null>(null);
  const [indexPct, setIndexPct] = useState<number>(0);

  // load persisted reading prefs
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  // persist reading prefs
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // per-book in-memory LRU cache
  useEffect(() => {
    cacheRef.current = new LruPageCache(20);
    return () => {
      cacheRef.current = null;
    };
  }, [id]);

  const flat = useMemo(() => flatten(toc), [toc]);
  const tocNav = useMemo(() => {
    const raw = flat.filter((x) => x.pageId || x.pageNumber != null);
    // Deduplicate because TOC can repeat the same pageId in parent/child nodes.
    const seen = new Set<string>();
    const out: typeof raw = [];
    for (const it of raw) {
      const key = it.pageId ? `id:${it.pageId}` : `n:${it.pageNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  }, [flat]);

  // Load TOC + metadata + restore progress
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const existing = getEntry(STORE_ID);
        setIsFinished(!!existing?.finished);

        // fetch metadata for reading lists
        try {
          const bookRes = await fetch(`/api/abl/book/${id}?lang=ar`);
          const j = await bookRes.json();
          const book = j?.book;
          const m = {
            title: book?.title,
            author: (book?.contributors ?? [])
              .map((c: any) => c?.contributor?.name || c?.displayName)
              .filter(Boolean)
              .slice(0, 3)
              .join("، ") || undefined,
            cover: (book?.attachments ?? []).find((a: any) => a?.context === 4 || a?.context === "BOOK_ATTACHMENT_CONTEXT_THUMBNAIL")?.file?.url ?? null,
          };
          if (!cancelled) setTotalPages(Number(book?.pagesCount ?? 0) || 0);
          if (!cancelled) setMeta(m);
          upsertEntry(STORE_ID, { ...m, finished: existing?.finished ?? false });
        } catch {
          // ignore
        }

        const tocRes = await fetch(`/api/abl/book/${id}/toc?lang=ar`);
        const tocJson = (await tocRes.json()) as TocResponse;
        if (cancelled) return;

        const items = tocJson.items ?? [];
        setToc(items);

        // restore last reading position
        let saved: Saved | null = null;
        try {
          const raw = window.localStorage.getItem(KEY);
          if (raw) saved = JSON.parse(raw);
        } catch {
          // ignore
        }

        const nav = flatten(items).filter((x) => x.pageId || x.pageNumber != null);
        const first = nav[0];

        // Prefer numeric page navigation (1..pagesCount). TOC is not "all pages".
        const tp = Number((window as any).__tp ?? 0);
        const max = totalPages || tp || 0;

        const desired = initialPage != null && Number.isFinite(initialPage) ? Number(initialPage) : null;
        const desiredValid = desired != null && desired >= 1 && (!max || desired <= max);

        const savedPage = saved?.page != null ? Number(saved.page) : null;
        const savedPageValid = savedPage != null && Number.isFinite(savedPage) && savedPage >= 1 && (!max || savedPage <= max);

        if (desiredValid) {
          setPage(desired);
          setPageId(null);
        } else if (savedPageValid) {
          setPage(savedPage);
          setPageId(null);
        } else if (first?.pageNumber != null) {
          setPage(Number(first.pageNumber));
          setPageId(null);
        } else {
          setPage(1);
          setPageId(null);
        }

        // clear search state when loading a new book
        setSearchResults([]);
        setMatchIdx(-1);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load TOC");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, initialPage]);

  // Load HTML for selected page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (page == null && !pageId) return;
      try {
        setError(null);
        const qs = new URLSearchParams({ lang: "ar" });
        // Prefer page number for sequential navigation; fall back to pageId when needed
        if (page != null) qs.set("page", String(page));
        else if (pageId) qs.set("pageId", pageId);

        // LRU cache hit (only for numeric pages)
        if (page != null) {
          const key = pageKey(id, page);
          const hit = cacheRef.current?.get(key);
          if (hit?.html) {
            setHtml(hit.html);
          } else {
            const r = await fetch(`/api/abl/book/${id}/html?${qs.toString()}`);
            const j = (await r.json()) as HtmlResponse;
            if (cancelled) return;
            if ((j as any).error) throw new Error((j as any).error);
            const nextHtml = j.data ?? "";
            setHtml(nextHtml);
            cacheRef.current?.set(key, { html: nextHtml, fetchedAt: Date.now() });
          }
        } else {
          const r = await fetch(`/api/abl/book/${id}/html?${qs.toString()}`);
          const j = (await r.json()) as HtmlResponse;
          if (cancelled) return;
          if ((j as any).error) throw new Error((j as any).error);
          setHtml(j.data ?? "");
        }

        // save progress (reader state)
        try {
          const payload: Saved = { page: page ?? undefined, pageId: pageId ?? undefined, updatedAt: Date.now() };
          window.localStorage.setItem(KEY, JSON.stringify(payload));
        } catch {
          // ignore
        }

        // also save into shared reading store
        try {
          const p = totalPages && page != null ? Math.max(0, Math.min(1, page / totalPages)) : 0;
          upsertEntry(STORE_ID, {
            ...meta,
            progress: p,
            finished: isFinished,
          });
        } catch {
          // ignore
        }

        // keep searchQ (for book search modal). Only clear the old highlights when page changes.
        // scroll to top
        requestAnimationFrame(() => {
          contentRef.current?.scrollTo({ top: 0 });
        });

        // apply highlight if we have a search term
        requestAnimationFrame(() => {
          const root = contentRef.current;
          if (!root) return;
          const container = root.querySelector(".prose") as HTMLElement | null;
          if (!container) return;
          if (highlightTerm.trim()) highlightInElement(container, highlightTerm);
          else clearHighlights(container);
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load page");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, page, pageId, tocNav, meta, isFinished, highlightTerm, totalPages]);

  // Auto-build search index in the background (option 1)
  useEffect(() => {
    if (!totalPages) return;

    const idx = new ABLSearchIndex({ bookId: id, pageCount: totalPages });
    searchIndexRef.current = idx;

    const off = idx.onProgress((p) => setIndexPct(p.pct));

    const t = window.setTimeout(() => {
      // start indexing after UI settles
      void idx.ensureIndexing();
    }, 2000);

    return () => {
      off();
      window.clearTimeout(t);
      idx.stopIndexing();
      if (searchIndexRef.current === idx) searchIndexRef.current = null;
    };
  }, [id, totalPages]);

  // Prefetch around the current page (instant next/prev)
  useEffect(() => {
    if (page == null) return;
    if (!shouldAllowPrefetch()) return;

    const qs = (n: number) => new URLSearchParams({ lang: "ar", page: String(n) }).toString();
    const nextUrl = (n: number) => `/api/abl/book/${id}/html?${qs(n)}`;

    // Always prefetch next. Then one more depending on direction.
    void prefetchPage(nextUrl(page + 1), { maxConcurrent: 2, allow: page + 1 <= totalPages });
    void prefetchPage(nextUrl(page - 1), { maxConcurrent: 2, allow: page - 1 >= 1 });

    // extra warm-up
    void prefetchPage(nextUrl(page + 2), { maxConcurrent: 2, allow: page + 2 <= totalPages });
  }, [id, page, totalPages]);

  const progressPct = useMemo(() => {
    if (!totalPages || page == null) return 0;
    return Math.round(Math.max(0, Math.min(1, page / totalPages)) * 100);
  }, [totalPages, page]);

  function goPage(next: number) {
    const n = !totalPages ? Math.max(1, next) : Math.max(1, Math.min(totalPages, next));
    setPage(n);
    setSliderValue(n);
    setPageId(null);
  }

  // keep slider in sync when page changes externally
  useEffect(() => {
    if (page != null) setSliderValue(page);
  }, [page]);

  // load notes for current page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (page == null) return;
      const bookKey = `abl:${id}`;
      const rows = await getNotesForBookPage(bookKey, page);
      if (cancelled) return;
      setNotes(rows.map((r) => ({ id: r.id, text: r.text, pageNumber: r.pageNumber, updatedAt: r.updatedAt })));
    })();
    return () => {
      cancelled = true;
    };
  }, [id, page]);

  function findInPage() {
    const q = searchQ.trim();
    if (!q) return;

    // very simple in-page find: mark first match by using native find (best-effort)
    const el = contentRef.current;
    if (!el) return;

    const text = el.innerText ?? "";
    if (!text.includes(q)) return;

    try {
      // @ts-ignore
      window.find(q);
    } catch {
      // ignore
    }
  }

  function stripHtml(s: string) {
    return s
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clearHighlights(root: HTMLElement) {
    const hits = root.querySelectorAll("span[data-search-hit]");
    hits.forEach((node) => {
      const parent = node.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(node.textContent ?? ""), node);
      parent.normalize();
    });
  }

  function highlightInElement(root: HTMLElement, term: string) {
    const q = term.trim();
    if (!q) return;

    clearHighlights(root);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const matches: HTMLElement[] = [];
    let node: Text | null;

    // limit to keep it fast
    const MAX_MATCHES = 80;

    while ((node = walker.nextNode() as Text | null)) {
      const text = node?.nodeValue ?? "";
      const idx = text.indexOf(q);
      if (idx < 0) continue;

      const before = document.createTextNode(text.slice(0, idx));
      const hit = document.createElement("span");
      hit.setAttribute("data-search-hit", "1");
      hit.className = "rounded bg-brand-500/25 ring-1 ring-brand-500/30 px-0.5";
      hit.textContent = text.slice(idx, idx + q.length);
      const after = document.createTextNode(text.slice(idx + q.length));

      const frag = document.createDocumentFragment();
      frag.appendChild(before);
      frag.appendChild(hit);
      frag.appendChild(after);

      const parent = node.parentNode;
      if (!parent) continue;
      parent.replaceChild(frag, node);

      matches.push(hit);
      if (matches.length >= MAX_MATCHES) break;
    }

    // scroll to first hit
    if (matches[0]) {
      matches[0].scrollIntoView({ block: "center" });
    }
  }

  async function runBookSearch() {
    const q = searchQ.trim();
    if (!q) return;

    setSearchOpen(true);
    setSearching(true);
    setSearchResults([]);
    setMatchIdx(-1);

    // If an old network search is running, abort it (kept for backward compat)
    searchAbortRef.current?.abort();
    const ac = new AbortController();
    searchAbortRef.current = ac;

    try {
      const idx = searchIndexRef.current;
      if (!idx) {
        setSearchResults([]);
        return;
      }

      const hits = await idx.search(q, "partial");
      if (ac.signal.aborted) return;
      setSearchResults(hits);
    } finally {
      setSearching(false);
    }
  }

  function goToResult(i: number) {
    if (!searchResults.length) return;
    const idx = Math.max(0, Math.min(searchResults.length - 1, i));
    const hit = searchResults[idx];
    setMatchIdx(idx);
    setHighlightTerm(searchQ.trim());
    goPage(Number(hit.pageNumber));
    setSearchOpen(false);
  }

  return (
    <main
      className={
        "mx-auto max-w-6xl px-4 py-6 " +
        (effectiveTheme === "light" ? "bg-white text-zinc-900" : "bg-transparent text-white")
      }
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/ar/book/${id}`} className={"inline-flex items-center gap-2 text-sm " + ui.link} aria-label="رجوع للكتاب">
          <ChevronRight className="h-4 w-4" />
          <span className="hidden sm:inline">رجوع للكتاب</span>
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className={
              "hidden items-center gap-3 rounded-md px-3 py-2 text-xs ring-1 sm:flex " +
              (effectiveTheme === "light" ? "bg-black/5 text-zinc-700 ring-black/10" : "bg-white/5 text-zinc-300 ring-white/10")
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">التقدم</span>
              <span className="font-semibold text-white">{progressPct}%</span>
            </div>
            {indexPct > 0 && indexPct < 100 ? (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">فهرسة البحث</span>
                <span className="tabular-nums text-zinc-200">{indexPct}%</span>
              </div>
            ) : null}
          </div>

          <button
            className={ui.btnBase + " " + ui.btnSm + " " + ui.btn + " disabled:opacity-50"}
            disabled={page == null || page <= 1}
            onClick={() => goPage((page ?? 1) - 1)}
            aria-label="السابق"
            title="السابق"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            className={ui.btnBase + " " + ui.btnSm + " " + ui.btn + " disabled:opacity-50"}
            disabled={!!totalPages && (page == null || page >= totalPages)}
            onClick={() => goPage((page ?? 1) + 1)}
            aria-label="التالي"
            title="التالي"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            className={ui.btnBase + " " + ui.btnSm + " " + (isFinished ? ui.btnSuccess : ui.btn)}
            onClick={() => {
              const next = !isFinished;
              setIsFinished(next);
              markFinished(STORE_ID, next);
              upsertEntry(STORE_ID, { ...meta, finished: next });
            }}
            aria-label={isFinished ? "تمّت القراءة" : "وضع كتمّت القراءة"}
            title={isFinished ? "تمّت القراءة" : "وضع كتمّت القراءة"}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>

          <button
            className={ui.btnBase + " " + ui.btnSm + " " + ui.btn}
            onClick={() => setPrefsOpen(true)}
            aria-label="إعدادات القراءة"
            title="إعدادات القراءة"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          <button
            className={ui.btnBase + " " + ui.btnSm + " " + ui.btn}
            onClick={() => {
              setSearchOpen(true);
              setSearchResults([]);
              setMatchIdx(-1);
            }}
            aria-label="بحث داخل الكتاب"
            title="بحث داخل الكتاب"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            className={ui.btnBase + " " + ui.btnSm + " " + ui.btnPrimary + " disabled:opacity-50"}
            onClick={() => setTocOpen(true)}
            disabled={!tocNav.length}
            aria-label="الفهرس"
            title="الفهرس"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {tocOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setTocOpen(false)}>
          <div className="mx-auto max-w-2xl rounded-xl bg-black p-4 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">الفهرس</div>
              <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setTocOpen(false)}>
                إغلاق
              </button>
            </div>
            <div className="mt-3 max-h-[70vh] overflow-auto">
              {tocNav.length ? (
                <div className="divide-y divide-white/10">
                  {tocNav.map((it, idx) => (
                    <button
                      key={`${it.title}-${idx}`}
                      className="w-full px-2 py-3 text-right text-sm text-zinc-200 hover:bg-white/5"
                      onClick={() => {
                        if (it.pageNumber != null) goPage(Number(it.pageNumber));
                        else if (it.pageId) {
                          setPage(null);
                          setPageId(String(it.pageId));
                        }
                        setTocOpen(false);
                      }}
                    >
                      <div className={"line-clamp-1 " + (it.level ? "pr-4" : "font-semibold")}>{it.title}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-zinc-400">لا يوجد فهرس.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setSearchOpen(false)}>
          <div className="mx-auto max-w-2xl rounded-xl bg-black p-4 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">بحث داخل الكتاب</div>
              <button
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"
                onClick={() => {
                  searchAbortRef.current?.abort();
                  setSearchOpen(false);
                }}
              >
                إغلاق
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="flex-1">
                <div className="text-xs text-zinc-400">اكتب كلمة ثم اضغط بحث</div>
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="مثال: الرازي"
                  className="mt-2 h-10 w-full rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
                />
              </div>
              <button
                className="h-10 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                onClick={runBookSearch}
                disabled={searching}
              >
                {searching ? "جارٍ البحث…" : "بحث"}
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-auto">
              {!searching && !searchResults.length ? (
                <div className="text-sm text-zinc-400">لا توجد نتائج (أو لم يتم البحث بعد).</div>
              ) : null}

              <div className="grid gap-2">
                {searchResults.map((r, i) => (
                  <button
                    key={`${r.pageNumber}-${i}`}
                    className={
                      "rounded-lg p-3 text-right ring-1 transition hover:bg-white/5 " +
                      (i === matchIdx ? "bg-white/10 ring-white/15" : "bg-white/5 ring-white/10")
                    }
                    onClick={() => goToResult(i)}
                  >
                    <div className="text-xs text-zinc-400">صفحة {r.pageNumber}</div>
                    <div className="mt-1 text-sm text-zinc-200">
                      {(() => {
                        const q = searchQ.trim();
                        if (!q) return r.excerpt;
                        const parts = String(r.excerpt).split(q);
                        if (parts.length <= 1) return r.excerpt;
                        return (
                          <>
                            {parts.map((p: string, idx: number) => (
                              <span key={idx}>
                                {p}
                                {idx < parts.length - 1 ? (
                                  <span className="rounded bg-brand-500/25 px-1 ring-1 ring-brand-500/30">{q}</span>
                                ) : null}
                              </span>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl bg-white/5 ring-1 ring-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <div>قارئ عربي</div>
            <div className="h-2 w-40 overflow-hidden rounded bg-white/10">
              <div className="h-full bg-brand-500" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="tabular-nums">{progressPct}%</div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="بحث داخل الصفحة…"
              className="h-9 w-[min(260px,60vw)] rounded-md bg-white/5 px-3 text-xs text-white ring-1 ring-white/10"
            />
            <button className="h-9 rounded-md bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15" onClick={findInPage}>
              بحث
            </button>
          </div>
        </div>

        <div className="relative h-[78vh]">
          {loading ? (
            <div className="absolute inset-0 grid place-items-center text-sm text-zinc-400">تحميل…</div>
          ) : error ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div className="max-w-xl rounded-lg bg-black/40 p-4 ring-1 ring-white/10">
                <div className="text-sm font-semibold text-red-300">خطأ</div>
                <div className="mt-2 text-sm text-zinc-300">{error}</div>
              </div>
            </div>
          ) : null}

          {/* content */}
          <div
            ref={contentRef}
            className={
              "h-full overflow-auto px-3 py-4 sm:px-4 sm:py-6 pb-[calc(8rem+env(safe-area-inset-bottom))] " +
              (effectiveTheme === "light" ? "text-zinc-900" : "text-zinc-100")
            }
            style={{
              // apply user prefs
              fontSize: `${prefs.fontSizePx}px`,
              lineHeight: String(prefs.lineHeight),
              // improve Arabic paragraph flow + punctuation wrapping
              textAlign: "justify",
              textJustify: "inter-word",
              whiteSpace: "normal",
              overflowWrap: "break-word",
              wordBreak: "normal",
              lineBreak: "auto",
            }}
          >
            <div
              className={
                // paragraph spacing + readable structure
                "prose max-w-none prose-a:text-brand-400 prose-p:my-4 prose-li:my-2 prose-hr:my-6 " +
                (effectiveTheme === "light" ? "prose-zinc" : "prose-invert")
              }
              style={{
                // Preserve explicit newlines if upstream HTML uses them inside text nodes
                whiteSpace: "pre-wrap",
              }}
            >
              {/* We trust upstream HTML; if needed we can sanitize later */}
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>

          {/* bottom controls (progress slider + go to page) */}
          <div
            className={
              "absolute bottom-0 left-0 right-0 px-3 py-3 sm:px-4 backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))] " +
              (effectiveTheme === "light" ? "border-t border-black/10 bg-white/90" : "border-t border-white/10 bg-black/80")
            }
          >
            <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="tabular-nums text-zinc-200">
                {page ?? "—"} / {totalPages || "—"}
              </div>

              <div className="flex-1">
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, totalPages || 1)}
                  value={Math.max(1, Math.min(totalPages || 1, sliderValue))}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  onMouseUp={() => goPage(sliderValue)}
                  onTouchEnd={() => goPage(sliderValue)}
                  className="w-full"
                />
              </div>

              <button
                className={ui.btnBase + " " + ui.btnXs + " " + ui.btn}
                onClick={() => {
                  setNotesOpen(true);
                  setNoteText("");
                }}
                aria-label="ملاحظات الصفحة"
                title="ملاحظات الصفحة"
              >
                <StickyNote className="h-4 w-4" />
              </button>

              <button
                className={ui.btnBase + " " + ui.btnXs + " " + ui.btn}
                onClick={() => {
                  setGotoOpen(true);
                  setGotoValue(String(page ?? ""));
                }}
                aria-label="اذهب إلى صفحة"
                title="اذهب إلى صفحة"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {prefsOpen ? (
        <div className={"fixed inset-0 z-50 p-4 " + ui.overlay} onClick={() => setPrefsOpen(false)}>
          <div className={"mx-auto mt-[12vh] max-w-md rounded-xl p-4 " + ui.panel} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className={"text-sm font-semibold " + (effectiveTheme === "light" ? "text-zinc-900" : "text-white")}>إعدادات القراءة</div>
              <button className={ui.btnBase + " " + ui.btnSm + " " + ui.btn} onClick={() => setPrefsOpen(false)}>
                إغلاق
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-xs text-zinc-400">الوضع</div>
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
                      {t === "system" ? "تلقائي" : t === "light" ? "نهاري" : "ليلي"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-400">حجم الخط</div>
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
                  <div className="text-xs text-zinc-400">تباعد الأسطر</div>
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
                <button className={ui.btnBase + " " + ui.btnXs + " " + ui.btn} onClick={() => setPrefs(DEFAULT_PREFS)}>
                  إعادة الضبط
                </button>
                <div className="text-xs text-zinc-500">تُحفظ محليًا على الجهاز</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {notesOpen ? (
        <div className={"fixed inset-0 z-50 p-4 " + ui.overlay} onClick={() => setNotesOpen(false)}>
          <div className={"mx-auto mt-[12vh] max-w-2xl rounded-xl p-4 " + ui.panel} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className={"text-sm font-semibold " + (effectiveTheme === "light" ? "text-zinc-900" : "text-white")}>
                ملاحظات — صفحة {page ?? "—"}
              </div>
              <button className={ui.btnBase + " " + ui.btnSm + " " + ui.btn} onClick={() => setNotesOpen(false)}>
                إغلاق
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-lg bg-black/20 p-3 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">ملاحظات هذه الصفحة</div>
                <div className="mt-2 grid gap-2">
                  {!notes.length ? <div className="text-sm text-zinc-400">لا توجد ملاحظات بعد.</div> : null}
                  {notes.map((n) => (
                    <div key={n.id} className="flex items-start justify-between gap-3 rounded-md bg-white/5 p-3 ring-1 ring-white/10">
                      <div className="whitespace-pre-wrap text-sm text-zinc-100">{n.text}</div>
                      <button
                        className={ui.btnBase + " " + ui.btnXs + " " + ui.btn}
                        onClick={async () => {
                          await deleteNote(n.id);
                          if (page == null) return;
                          const rows = await getNotesForBookPage(`abl:${id}`, page);
                          setNotes(rows.map((r) => ({ id: r.id, text: r.text, pageNumber: r.pageNumber, updatedAt: r.updatedAt })));
                        }}
                        aria-label="حذف"
                        title="حذف"
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-black/20 p-3 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">إضافة ملاحظة</div>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="اكتب ملاحظتك هنا…"
                  className={
                    "mt-2 h-28 w-full rounded-md px-3 py-2 text-sm ring-1 focus:outline-none " +
                    (effectiveTheme === "light" ? "bg-white text-zinc-900 ring-black/10" : "bg-black/40 text-white ring-white/10")
                  }
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">تُحفظ محليًا (ومهيأة للمزامنة لاحقًا)</div>
                  <button
                    className={ui.btnBase + " " + ui.btnSm + " " + ui.btnPrimary + " disabled:opacity-50"}
                    disabled={!noteText.trim() || page == null}
                    onClick={async () => {
                      if (page == null) return;
                      await addNote("arabic", `abl:${id}`, page, noteText.trim());
                      setNoteText("");
                      const rows = await getNotesForBookPage(`abl:${id}`, page);
                      setNotes(rows.map((r) => ({ id: r.id, text: r.text, pageNumber: r.pageNumber, updatedAt: r.updatedAt })));
                    }}
                  >
                    حفظ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {gotoOpen ? (
        <div className={"fixed inset-0 z-50 p-4 " + ui.overlay} onClick={() => setGotoOpen(false)}>
          <div className={"mx-auto mt-[20vh] max-w-md rounded-xl p-4 " + ui.panel} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className={"text-sm font-semibold " + (effectiveTheme === "light" ? "text-zinc-900" : "text-white")}>اذهب إلى صفحة</div>
              <button className={ui.btnBase + " " + ui.btnSm + " " + ui.btn} onClick={() => setGotoOpen(false)}>
                إغلاق
              </button>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <div className="text-xs text-zinc-400">اكتب رقم الصفحة</div>
                <input
                  value={gotoValue}
                  onChange={(e) => setGotoValue(e.target.value)}
                  inputMode="numeric"
                  placeholder="مثال: 125"
                  className="mt-2 h-10 w-full rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
                />
              </div>
              <button
                className={"h-10 rounded-md px-4 text-sm font-semibold transition " + ui.btnPrimary}
                onClick={() => {
                  const n = Number(gotoValue);
                  if (!Number.isFinite(n)) return;
                  goPage(n);
                  setGotoOpen(false);
                }}
              >
                انتقال
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-500">المدى: 1 إلى {totalPages || "—"}</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
