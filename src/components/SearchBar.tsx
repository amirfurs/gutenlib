"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { ablAuthors, ablThumbnailUrl } from "@/lib/abl/helpers";

type SuggestResponse = {
  q: string;
  books: Array<{ id: number; title: string; author: string; cover: string | null }>;
  authors: string[];
  topics: string[];
};

export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SuggestResponse | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as any)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const inArabic = pathname === "/ar" || pathname.startsWith("/ar/");

  const trimmed = q.trim();

  useEffect(() => {
    if (!open) return;
    if (!trimmed) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        if (inArabic) {
          const qs = new URLSearchParams({ page: "1", perPage: "10", lang: "ar", languages: "ar", query: trimmed });
          const res = await fetch(`/api/abl/books?${qs.toString()}`, { signal: ac.signal });
          const json = (await res.json()) as any;
          const booksRaw: any[] = json?.books ?? [];
          const books = booksRaw.map((b) => ({
            id: Number(b.id),
            title: String(b.title ?? "").trim() || `#${b.id}`,
            author: ablAuthors(b),
            cover: ablThumbnailUrl(b),
          }));
          setData({ q: trimmed, books, authors: [], topics: [] });
        } else {
          const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`, { signal: ac.signal });
          const json = (await res.json()) as SuggestResponse;
          setData(json);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [trimmed, open]);

  const actionHref = useMemo(() => {
    if (inArabic) {
      const qs = new URLSearchParams();
      if (trimmed) qs.set("q", trimmed);
      return `/ar/books?${qs.toString()}`;
    }
    const qs = new URLSearchParams({ sort: "popular" });
    if (trimmed) qs.set("search", trimmed);
    return `/books?${qs.toString()}`;
  }, [trimmed, inArabic]);

  function submit() {
    if (!trimmed) return;
    router.push(actionHref);
    setOpen(false);
  }

  const hide = pathname === "/read" || pathname.startsWith("/read/") || pathname.startsWith("/ar/read/");
  if (hide) return null;

  return (
    <div ref={wrapRef} className="relative w-[min(520px,55vw)]" data-testid="search-bar">
      <div className="flex items-center gap-2">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder={inArabic ? "ابحث في الكتب العربية..." : "Search books, authors, topics..."}
            data-testid="search-input"
            className="h-10 w-full rounded-full bg-white/5 pl-10 pr-9 text-sm text-white ring-1 ring-white/8 placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-500/40 transition-all duration-200"
          />
          {q ? (
            <button
              onClick={() => { setQ(""); setData(null); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
              data-testid="search-clear"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl glass animate-fade-in" data-testid="search-dropdown">
          <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5">
            <div className="text-xs font-medium text-zinc-500">{loading ? "Searching..." : trimmed ? "Suggestions" : ""}</div>
            {trimmed ? (
              <Link href={actionHref} className="text-xs font-medium text-amber-400 hover:text-amber-300 transition" onClick={() => setOpen(false)} data-testid="search-view-all">
                View all &rarr;
              </Link>
            ) : null}
          </div>

          {!trimmed ? (
            <div className="px-4 py-5 text-sm text-zinc-500">Type to search...</div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <div className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{inArabic ? "الكتب" : "Books"}</div>
              <div className="p-2">
                {(data?.books ?? []).length ? (
                  <div className="grid gap-0.5">
                    {data!.books.map((b) => (
                      <Link
                        key={b.id}
                        href={inArabic ? `/ar/book/${b.id}` : `/book/${b.id}`}
                        className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-white/5"
                        onClick={() => setOpen(false)}
                        data-testid={`search-result-book-${b.id}`}
                      >
                        <div className="h-12 w-8 overflow-hidden rounded-md bg-white/5 ring-1 ring-white/8">
                          {b.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.cover} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-sm font-medium text-white">{b.title}</div>
                          <div className="line-clamp-1 text-xs text-zinc-500">{b.author}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-2 text-sm text-zinc-500">{inArabic ? "لا توجد نتائج." : "No books found."}</div>
                )}
              </div>

              {inArabic ? null : (
                <>
                  <div className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Authors</div>
                  <div className="p-2">
                    {(data?.authors ?? []).length ? (
                      <div className="grid gap-0.5">
                        {data!.authors.map((name) => (
                          <Link
                            key={name}
                            href={`/author?name=${encodeURIComponent(name)}`}
                            className="rounded-xl px-2.5 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                            onClick={() => setOpen(false)}
                          >
                            {name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="px-2 py-2 text-sm text-zinc-500">No authors.</div>
                    )}
                  </div>

                  <div className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Topics</div>
                  <div className="p-2 pb-3">
                    {(data?.topics ?? []).length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {data!.topics.map((t) => (
                          <Link
                            key={t}
                            href={`/books?${new URLSearchParams({ sort: "popular", topic: t }).toString()}`}
                            className="chip"
                            onClick={() => setOpen(false)}
                          >
                            {t}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="px-2 py-2 text-sm text-zinc-500">No topics.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
