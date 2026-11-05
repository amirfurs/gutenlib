"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type HtmlResponse = { data?: string; error?: string };

type TocItem = {
  title?: string;
  pageNumber?: number;
  pageId?: string;
  children?: TocItem[];
};

type TocResponse = { items?: TocItem[] };

type FlatToc = Array<{ level: number; title: string; pageNumber?: number; pageId?: string }>;

function sanitizeReaderHtml(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<applet[\s\S]*?<\/applet>/gi, "")
    .replace(/\s*on\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
}

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

function normalizeText(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function applyHighlightToContainer(container: HTMLElement, highlight: string) {
  container.querySelectorAll("mark[data-host-highlight='1']").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(m.textContent || ""), m);
    parent.normalize();
  });

  const full = normalizeText(highlight);
  if (!full) return;

  const candidates = Array.from(
    new Set(
      [
        full,
        full.slice(0, 180).trim(),
        full.slice(0, 120).trim(),
        full.split(/[\.!؟\n]/)[0]?.trim() || "",
      ].filter(Boolean)
    )
  );

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const n = walker.currentNode as Text;
    if ((n.nodeValue || "").trim()) textNodes.push(n);
  }

  for (const node of textNodes) {
    const original = node.nodeValue || "";
    const normalized = normalizeText(original);
    if (!normalized) continue;

    let picked = "";
    for (const c of candidates) {
      if (normalizeText(normalized).includes(normalizeText(c))) {
        picked = c;
        break;
      }
    }
    if (!picked) continue;

    let i = original.indexOf(picked);
    let len = picked.length;

    if (i < 0) {
      const simpleNeedle = normalizeText(picked);
      const simpleOriginal = normalizeText(original);
      const j = simpleOriginal.indexOf(simpleNeedle);
      if (j < 0) continue;

      const token = simpleNeedle.slice(0, Math.min(70, simpleNeedle.length)).trim();
      i = original.indexOf(token);
      len = token.length;
      if (i < 0) continue;
    }

    const before = original.slice(0, i);
    const match = original.slice(i, i + len);
    const after = original.slice(i + len);

    const mark = document.createElement("mark");
    mark.setAttribute("data-host-highlight", "1");
    mark.className = "bg-yellow-400/40 text-white rounded px-1 py-0.5 font-medium ring-1 ring-yellow-400/50";
    mark.textContent = match;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(mark);
    if (after) frag.appendChild(document.createTextNode(after));

    node.parentNode?.replaceChild(frag, node);
    return;
  }
}

export function RoomArabicReader({
  bookId,
  page,
  onPageChange,
  isHost,
  highlightText,
  bookTitle,
  bookAuthor,
}: {
  bookId: string;
  page: number;
  onPageChange: (nextPage: number) => void;
  isHost: boolean;
  highlightText?: string;
  bookTitle?: string;
  bookAuthor?: string;
}) {
  const [toc, setToc] = useState<TocItem[]>([]);
  const [pagesCount, setPagesCount] = useState<number>(0);
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local browsing state vs synced room state
  const [localPage, setLocalPage] = useState(page);

  useEffect(() => {
    setLocalPage(page);
  }, [page]);

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
  const [searchResults, setSearchResults] = useState<Array<{ pageNumber: number; title: string; excerpt: string }>>([]);

  // Table of contents state
  const [tocOpen, setTocOpen] = useState(false);
  const articleRef = useRef<HTMLDivElement | null>(null);

  // Load book metadata and TOC
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch book metadata for page count
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
        if (!cancelled) setError(e?.message ?? "فشل تحميل بيانات الكتاب");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const flat = useMemo(() => flatten(toc).filter((x) => x.pageNumber != null || x.pageId), [toc]);

  // Load page HTML
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingPage(true);
        setError(null);
        const qs = new URLSearchParams({ lang: "ar", page: String(localPage) });
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
  }, [bookId, localPage]);

  // Re-apply highlight whenever HTML or highlightText changes
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    applyHighlightToContainer(el, highlightText || "");
  }, [html, highlightText]);

  const goToPage = (next: number) => {
    const target = Math.max(1, pagesCount ? Math.min(pagesCount, next) : next);
    setLocalPage(target);
    if (isHost) {
      onPageChange(target);
    }
  };

  // Keyboard navigation & search shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") {
        return;
      }
      // RTL: ArrowRight is previous page, ArrowLeft is next page
      if (e.key === "ArrowRight") goToPage(localPage - 1);
      if (e.key === "ArrowLeft") goToPage(localPage + 1);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [localPage, pagesCount, isHost]);

  // Search in book
  async function runSearch() {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    setHasSearched(true);
    setSearchResults([]);

    try {
      const res = await fetch(`/api/abl/book/${bookId}/search?q=${encodeURIComponent(q)}&lang=ar`);
      if (res.ok) {
        const j = await res.json();
        const hits = (j?.hits ?? []).map((h: any, idx: number) => ({
          pageNumber: Number(h.pageNumber || h.pageId || idx + 1),
          title: h.title || `صفحة ${h.pageNumber || idx + 1}`,
          excerpt: h.excerpt || "",
        }));
        setSearchResults(hits);
      }
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }

  const isDesyncedFromHost = !isHost && localPage !== page;
  const progressPercent = pagesCount ? Math.round((localPage / pagesCount) * 100) : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center" dir="rtl">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent mb-3" />
        <div className="text-sm font-medium text-zinc-300">جاري تحميل بيانات الكتاب…</div>
        <div className="text-xs text-zinc-500 mt-1">يرجى الانتظار</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 p-6 text-center ring-1 ring-red-500/20" dir="rtl">
        <div className="text-sm font-semibold text-red-300">تعذر تحميل الكتاب</div>
        <div className="mt-1 text-xs text-zinc-400">{error}</div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className={
        "relative rounded-xl transition-colors duration-200 " +
        (effectiveTheme === "light"
          ? "bg-zinc-100 text-zinc-900"
          : "bg-white/5 text-zinc-100 ring-1 ring-white/10")
      }
    >
      {/* Reader Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/10 px-3 sm:px-4 py-3">
        {/* Right (start in RTL): Progress & Live Indicator */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className="hidden xs:flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
            <BookOpen className="h-3.5 w-3.5 text-brand-500" />
            <span className="font-semibold text-white">قراءة مشتركة</span>
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
              <Shield className="h-3 w-3" /> تحكم المضيف
            </span>
          ) : isDesyncedFromHost ? (
            <button
              onClick={() => setLocalPage(page)}
              className="pressable inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-yellow-300 ring-1 ring-yellow-500/30 hover:bg-yellow-500/25"
              title="العودة لصفحة المضيف"
            >
              <Users className="h-3 w-3" /> مزامنة مع المضيف (ص {page})
            </button>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400 ring-1 ring-white/10">
              <Users className="h-3 w-3 text-emerald-400" /> متزامن مع المضيف
            </span>
          )}
        </div>

        {/* Left (end in RTL): Controls (Page, Prev, Next, Settings, Search, TOC) */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Page Counter Badge */}
          <div className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-zinc-300 ring-1 ring-white/10">
            <span className="text-zinc-500">صفحة</span>
            <span className="font-bold text-white">{localPage}</span>
            {pagesCount ? <span className="text-zinc-500">/ {pagesCount}</span> : null}
          </div>

          {/* RTL Prev button (Next in book order is right arrow in RTL, prev is right arrow) */}
          <button
            className="pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none"
            onClick={() => goToPage(localPage - 1)}
            disabled={localPage <= 1}
            aria-label="الصفحة السابقة"
            title="الصفحة السابقة"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <button
            className="pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-white hover:bg-white/15 disabled:opacity-30 disabled:pointer-events-none"
            onClick={() => goToPage(localPage + 1)}
            disabled={pagesCount ? localPage >= pagesCount : false}
            aria-label="الصفحة التالية"
            title="الصفحة التالية"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Reading Settings Button */}
          <button
            className="pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-white/10 px-2.5 py-1.5 text-sm text-white hover:bg-white/15"
            onClick={() => setPrefsOpen(true)}
            aria-label="إعدادات القراءة"
            title="إعدادات القراءة"
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
              title="خيارات الخط"
            >
              Aa
            </button>
            {typeOpen && (
              <div
                className="origin-top-popover absolute left-0 top-[calc(100%+8px)] z-40 w-56 rounded-xl bg-zinc-950 p-3 ring-1 ring-white/15 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">
                  حجم الخط: {prefs.fontSizePx}px
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
                      setPrefs((p) => ({ ...p, fontSizePx: Math.min(28, p.fontSizePx + 1) }))
                    }
                  >
                    A+
                  </button>
                </div>
                <div className="text-[11px] font-semibold text-zinc-400 mb-1.5">
                  تباعد الأسطر: {prefs.lineHeight.toFixed(2)}
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
                        lineHeight: Math.min(2.6, Math.round((p.lineHeight + 0.1) * 10) / 10),
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
            aria-label="بحث في الكتاب"
            title="بحث في الكتاب (Ctrl/⌘ + F)"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Table of Contents Button */}
          <button
            className="pressable min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg bg-brand-500 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            onClick={() => setTocOpen(true)}
            disabled={!flat.length}
            aria-label="فهرس المحتويات"
            title="فهرس المحتويات"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Reader Page Content */}
      <div className="p-4 sm:p-6 md:p-8 min-h-[420px]">
        {loadingPage ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent mb-2" />
            <div className="text-sm text-zinc-400">جاري تحميل الصفحة {localPage}…</div>
          </div>
        ) : (
          <div
            ref={articleRef}
            className={
              "mx-auto max-w-3xl select-text transition-all duration-150 leading-loose " +
              (effectiveTheme === "light" ? "text-zinc-900" : "text-zinc-100")
            }
            style={{
              fontSize: `${prefs.fontSizePx}px`,
              lineHeight: prefs.lineHeight,
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeReaderHtml(html) }}
          />
        )}
      </div>

      {/* Reading Settings Modal */}
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
              <div className="text-base font-semibold text-white">إعدادات القراءة</div>
              <button
                className="pressable rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"
                onClick={() => setPrefsOpen(false)}
              >
                إغلاق
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-xs text-zinc-400">المظهر</div>
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
                      {t === "system" ? "تلقائي" : t === "light" ? "فاتح" : "داكن"}
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
                  max={28}
                  value={prefs.fontSizePx}
                  onChange={(e) => setPrefs((p) => ({ ...p, fontSizePx: Number(e.target.value) }))}
                  className="mt-2 w-full accent-brand-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-400">تباعد الأسطر</div>
                  <div className="text-xs tabular-nums text-zinc-200">
                    {prefs.lineHeight.toFixed(2)}
                  </div>
                </div>
                <input
                  type="range"
                  min={1.4}
                  max={2.6}
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
                  استعادة الافتراضي
                </button>
                <div className="text-xs text-zinc-500">محفوظ محليًا</div>
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
                <div className="text-base font-semibold text-white">فهرس المحتويات</div>
                <div className="text-xs text-zinc-400">
                  {isHost ? "انقر على أي فصل لتوجيه الغرفة إليه" : "استعراض فصول الكتاب"}
                </div>
              </div>
              <button
                className="pressable rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                onClick={() => setTocOpen(false)}
              >
                إغلاق
              </button>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto">
              {flat.length ? (
                <div className="divide-y divide-white/10">
                  {flat.map((it, idx) => (
                    <button
                      key={idx}
                      className={
                        "pressable flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-3 text-right text-sm rounded-lg transition " +
                        (localPage === it.pageNumber ? "bg-brand-500/15 text-white ring-1 ring-brand-500/30" : "text-zinc-200 hover:bg-white/5")
                      }
                      onClick={() => {
                        if (it.pageNumber != null) {
                          goToPage(it.pageNumber);
                          setTocOpen(false);
                        }
                      }}
                      disabled={it.pageNumber == null}
                    >
                      <span className={"line-clamp-1 " + (it.level === 0 ? "font-semibold text-white" : "pr-4 text-zinc-300")}>
                        {it.title}
                      </span>
                      {it.pageNumber != null && (
                        <span className="text-xs text-zinc-500 shrink-0">ص {it.pageNumber}</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-zinc-400">لا يوجد فهرس متاح لهذا الكتاب.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* In-Book Search Modal */}
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
                <div className="text-base font-semibold text-white">بحث في الكتاب</div>
                <div className="text-xs text-zinc-400">
                  {isHost ? "ابحث في صفحات الكتاب وانتقل بالغرفة إلى النتيجة" : "ابحث في صفحات الكتاب"}
                </div>
              </div>
              <button
                className="pressable rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                onClick={() => setSearchOpen(false)}
              >
                إغلاق
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
                placeholder="اكتب كلمة أو عبارة للبحث…"
                className="h-10 w-full rounded-lg bg-white/5 px-3.5 text-sm text-white ring-1 ring-white/10 placeholder:text-zinc-500 focus:outline-none focus:ring-brand-500"
                autoFocus
              />
              <button
                type="submit"
                className="pressable h-10 rounded-lg bg-brand-500 px-4 sm:px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 shrink-0"
                disabled={!searchQ.trim() || searching}
              >
                {searching ? "جاري البحث…" : "بحث"}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-400 shrink-0 px-1">
                <span>
                  تم العثور على <strong className="text-white">{searchResults.length}</strong> نتيجة
                </span>
                <span>انقر على النتيجة للانتقال إليها</span>
              </div>
            )}

            <div className="mt-3 flex-1 overflow-y-auto min-h-[140px]">
              {searchResults.length ? (
                <div className="divide-y divide-white/10">
                  {searchResults.map((r, idx) => (
                    <button
                      key={idx}
                      className="pressable w-full px-3 py-3 text-right rounded-lg transition hover:bg-white/5 flex flex-col gap-1"
                      onClick={() => {
                        goToPage(r.pageNumber);
                        setSearchOpen(false);
                      }}
                    >
                      <div className="text-[11px] font-semibold text-brand-400">
                        {r.title || `صفحة ${r.pageNumber}`}
                      </div>
                      <div className="text-sm text-zinc-200 leading-relaxed line-clamp-2">
                        {r.excerpt}
                      </div>
                    </button>
                  ))}
                </div>
              ) : searching ? (
                <div className="py-12 text-center text-sm text-zinc-400">جاري البحث في الكتاب…</div>
              ) : hasSearched ? (
                <div className="py-12 text-center text-sm text-zinc-400">
                  لم يتم العثور على نتائج لـ &ldquo;<span className="text-white font-medium">{searchQ}</span>&rdquo;.
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-zinc-400">
                  أدخل كلمة أو عبارة أعلاه واضغط على <span className="text-zinc-200 font-medium">بحث</span>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
