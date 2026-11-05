"use client";

import { useEffect, useState, useRef, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2, Sparkles, Globe, Filter, X, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { getCoverUrl, getCuratedBooksList, type GutendexBook, type GutendexList } from "@/lib/gutendex";

interface BooksCatalogProps {
  initialData?: GutendexList;
  initialSearch?: string;
  initialTopic?: string;
  initialSort?: string;
  initialLanguage?: string;
  initialPage?: number;
}

const LANGUAGES = [
  { code: "all", label: "All Languages (79,000+)" },
  { code: "en", label: "English (63,000+)" },
  { code: "fr", label: "French (Français)" },
  { code: "de", label: "German (Deutsch)" },
  { code: "es", label: "Spanish (Español)" },
  { code: "it", label: "Italian (Italiano)" },
  { code: "la", label: "Latin (Latina)" },
  { code: "zh", label: "Chinese (中文)" },
  { code: "pt", label: "Portuguese (Português)" },
  { code: "ru", label: "Russian (Русский)" },
  { code: "el", label: "Greek (Ελληνικά)" },
  { code: "ja", label: "Japanese (日本語)" },
];

export function BooksCatalog({
  initialData,
  initialSearch = "",
  initialTopic = "",
  initialSort = "popular",
  initialLanguage = "en",
  initialPage = 1,
}: BooksCatalogProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State from URL or props
  const [search, setSearch] = useState(initialSearch);
  const [topic, setTopic] = useState(initialTopic);
  const [sort, setSort] = useState(initialSort);
  const [language, setLanguage] = useState(initialLanguage);
  const [page, setPage] = useState(initialPage);

  // Books data state
  const [books, setBooks] = useState<GutendexBook[]>(initialData?.results ?? []);
  const [totalCount, setTotalCount] = useState<number>(initialData?.count ?? 0);
  const [hasNext, setHasNext] = useState<boolean>(Boolean(initialData?.next));
  const [hasPrev, setHasPrev] = useState<boolean>(Boolean(initialData?.previous));
  const [loading, setLoading] = useState<boolean>(false);
  const [isLive, setIsLive] = useState<boolean>(!initialData?.degraded && (initialData?.count ?? 0) > 100);
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load available topics
  useEffect(() => {
    fetch("/api/topics")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.topics)) {
          setAvailableTopics(d.topics);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch books directly from gutendex.com (with CORS: *) or fallback to local proxy
  const loadBooks = useCallback(
    async (
      currentSearch: string,
      currentTopic: string,
      currentSort: string,
      currentLang: string,
      currentPage: number
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);

      const qs = new URLSearchParams();
      if (currentSearch.trim()) qs.set("search", currentSearch.trim());
      if (currentTopic.trim()) qs.set("topic", currentTopic.trim());
      if (currentSort) qs.set("sort", currentSort);
      if (currentLang && currentLang !== "all") qs.set("languages", currentLang);
      if (currentPage > 1) qs.set("page", String(currentPage));

      // 1. Primary: High-speed App API (/api/books) (covers 79,700+ books, 250ms, no CORS/Cloudflare blocks)
      try {
        const proxyUrl = `/api/books?${qs.toString()}`;
        const res = await fetch(proxyUrl, { signal: controller.signal });
        if (res.ok) {
          const data: GutendexList = await res.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            setBooks(data.results);
            setTotalCount(data.count ?? 79737);
            setHasNext(Boolean(data.next));
            setHasPrev(Boolean(data.previous));
            setIsLive(!data.degraded);
            setLoading(false);
            return;
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
      }

      // 2. Secondary: Direct Gutendex (if reachable by client)
      const directUrl = `https://gutendex.com/books/?${qs.toString()}`;
      try {
        const res = await fetch(directUrl, {
          headers: { Accept: "application/json" },
          signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? (AbortSignal.timeout(5000) as any) : controller.signal,
        });

        if (res.ok) {
          const data: GutendexList = await res.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            setBooks(data.results);
            setTotalCount(data.count ?? 0);
            setHasNext(Boolean(data.next));
            setHasPrev(Boolean(data.previous));
            setIsLive(true);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fall through
      }

      // 3. Fallback to Curated Classics
      const fallback = getCuratedBooksList({
        search: currentSearch,
        topic: currentTopic,
        sort: currentSort,
        page: currentPage,
      });

      setBooks(fallback.results);
      setTotalCount(fallback.count);
      setHasNext(Boolean(fallback.next));
      setHasPrev(Boolean(fallback.previous));
      setIsLive(false);
      setLoading(false);
    },
    []
  );

  // Sync with URL parameters on mount and state changes
  const updateUrlAndFetch = useCallback(
    (
      newSearch: string,
      newTopic: string,
      newSort: string,
      newLang: string,
      newPage: number
    ) => {
      const qs = new URLSearchParams();
      if (newSearch.trim()) qs.set("search", newSearch.trim());
      if (newTopic.trim()) qs.set("topic", newTopic.trim());
      if (newSort && newSort !== "popular") qs.set("sort", newSort);
      if (newLang && newLang !== "en") qs.set("languages", newLang);
      if (newPage > 1) qs.set("page", String(newPage));

      const newUrl = qs.toString() ? `/books?${qs.toString()}` : "/books";
      window.history.replaceState(null, "", newUrl);

      loadBooks(newSearch, newTopic, newSort, newLang, newPage);
    },
    [loadBooks]
  );

  // Auto-fetch full 79k live catalog on mount if initialData was degraded or count is small
  useEffect(() => {
    if (!initialData || initialData.degraded || (initialData.count ?? 0) <= 50) {
      loadBooks(search, topic, sort, language, page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      updateUrlAndFetch(val, topic, sort, language, 1);
    }, 400);
  };

  const handleTopicChange = (newTopic: string) => {
    setTopic(newTopic);
    setPage(1);
    updateUrlAndFetch(search, newTopic, sort, language, 1);
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    setPage(1);
    updateUrlAndFetch(search, topic, sort, newLang, 1);
  };

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    setPage(1);
    updateUrlAndFetch(search, topic, newSort, language, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
    updateUrlAndFetch(search, topic, sort, language, newPage);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / 32));

  return (
    <div className="space-y-6">
      {/* Header with live statistics */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Classic Library</h1>
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live 79,000+ Catalog
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 ring-1 ring-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Connecting 79,000+ Books...
              </span>
            )}
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400">
            {isLive ? (
              <span>
                Exploring <strong className="text-white font-semibold">{totalCount.toLocaleString()}</strong> public domain books
                {language !== "all" && <span> · Filtered by {LANGUAGES.find((l) => l.code === language)?.label.split(" ")[0]}</span>}
              </span>
            ) : (
              <span>
                Accessing <strong className="text-white font-semibold">79,000+</strong> public domain books · Showing popular classics while connecting live
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ar/books" className="pressable inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 ring-1 ring-white/10">
            <span>كتب عربية (ABL)</span>
          </Link>
          <Link href="/" className="text-xs sm:text-sm text-zinc-400 hover:text-white">
            Home
          </Link>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 rounded-2xl bg-zinc-950/60 p-3 sm:p-4 ring-1 ring-white/10 backdrop-blur-xl">
        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search 70,000+ titles, authors..."
            className="w-full h-10 rounded-xl bg-white/5 pl-9 pr-8 text-xs sm:text-sm text-white placeholder:text-zinc-500 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Topics Selector */}
        <div className="relative">
          <select
            value={topic}
            onChange={(e) => handleTopicChange(e.target.value)}
            className="w-full h-10 rounded-xl bg-zinc-900 px-3 text-xs sm:text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="">All Topics & Subjects</option>
            {availableTopics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Language Selector */}
        <div className="relative">
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="w-full h-10 rounded-xl bg-zinc-900 px-3 text-xs sm:text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Selector */}
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="w-full h-10 rounded-xl bg-zinc-900 px-3 text-xs sm:text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="popular">Most Popular</option>
            <option value="ascending">ID ↑ (Earliest Added)</option>
            <option value="descending">ID ↓ (Recently Added)</option>
          </select>
        </div>
      </div>

      {/* Active filters pill list */}
      {(search || topic || language !== "all" || sort !== "popular") && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Active filters:</span>
          {search && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-zinc-200">
              Query: &quot;{search}&quot;
              <button onClick={() => handleSearchChange("")} className="hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {topic && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-zinc-200">
              Topic: {topic}
              <button onClick={() => handleTopicChange("")} className="hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {language !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-zinc-200">
              Lang: {LANGUAGES.find((l) => l.code === language)?.label.split(" ")[0]}
              <button onClick={() => handleLanguageChange("all")} className="hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            onClick={() => {
              setSearch("");
              setTopic("");
              setLanguage("en");
              setSort("popular");
              setPage(1);
              updateUrlAndFetch("", "", "popular", "en", 1);
            }}
            className="text-emerald-400 hover:underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Loading Bar */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs font-medium text-emerald-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Searching 70,000+ classic books...</span>
        </div>
      )}

      {/* Book Grid */}
      {books.length === 0 && !loading ? (
        <div className="rounded-2xl bg-white/[0.02] p-12 text-center ring-1 ring-white/10">
          <BookOpen className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-3 text-base font-semibold text-white">No books found</p>
          <p className="mt-1 text-xs text-zinc-400">Try a different search term or change your language / topic filter.</p>
          <button
            onClick={() => {
              setSearch("");
              setTopic("");
              setLanguage("all");
              setPage(1);
              updateUrlAndFetch("", "", sort, "all", 1);
            }}
            className="mt-4 inline-flex items-center rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
          >
            Show All 79,000+ Books
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {books.map((b) => {
            const cover = getCoverUrl(b.formats);
            const author = b.authors?.[0]?.name ?? "Unknown Author";

            return (
              <Link
                key={b.id}
                href={`/book/${b.id}`}
                className="pressable interactive-card group overflow-hidden rounded-2xl bg-white/[0.03] ring-1 ring-white/10 shadow-md hover:bg-white/[0.06] hover:ring-white/20 transition-all"
              >
                <div className="aspect-[2/3] overflow-hidden bg-black/40 relative">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={b.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      onError={(e) => {
                        // fallback to Gutenberg cache cover URL if default format URL failed
                        const target = e.currentTarget;
                        if (!target.src.includes("cache/epub")) {
                          target.src = `https://www.gutenberg.org/cache/epub/${b.id}/pg${b.id}.cover.medium.jpg`;
                        } else {
                          target.style.display = "none";
                        }
                      }}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-3 text-center bg-zinc-900">
                      <BookOpen className="h-6 w-6 text-zinc-600 mb-2" />
                      <span className="text-[11px] font-semibold text-zinc-300 line-clamp-3">{b.title}</span>
                      <span className="text-[10px] text-zinc-500 mt-1 line-clamp-1">{author}</span>
                    </div>
                  )}

                  {/* Top-right book ID pill */}
                  <span className="absolute top-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300 backdrop-blur-md">
                    #{b.id}
                  </span>
                </div>

                <div className="p-2.5 sm:p-3">
                  <div className="line-clamp-2 text-xs sm:text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                    {b.title}
                  </div>
                  <div className="mt-1 line-clamp-1 text-[11px] sm:text-xs text-zinc-400">
                    {author}
                  </div>
                  {b.download_count != null && b.download_count > 0 && (
                    <div className="mt-2 text-[10px] text-zinc-500">
                      {b.download_count.toLocaleString()} reads
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/5 text-sm">
        <button
          onClick={() => handlePageChange(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="pressable min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Previous</span>
        </button>

        <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
          <span>Page <strong className="text-white">{page}</strong></span>
          {isLive && totalCount > 0 ? (
            <span>of {totalPages.toLocaleString()} ({totalCount.toLocaleString()} books)</span>
          ) : (
            <span>of ~2,490 (79,000+ books)</span>
          )}
        </div>

        <button
          onClick={() => handlePageChange(page + 1)}
          disabled={(!hasNext && page >= totalPages) || loading}
          className="pressable min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
