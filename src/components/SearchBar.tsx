"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
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

  // only show in header on most pages
  const hide = pathname === "/read" || pathname.startsWith("/read/") || pathname.startsWith("/ar/read/");
  if (hide) return null;

  return (
    <div ref={wrapRef} className="relative w-[min(640px,62vw)]">
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
            placeholder={inArabic ? "ابحث في الكتب العربية…" : "Search books / authors / topics…"}
            className="h-10 w-full rounded-md bg-white/5 pl-10 pr-3 text-sm text-white ring-1 ring-white/10 placeholder:text-zinc-400 focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          className="hidden h-10 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 sm:inline-flex"
        >
          Search
        </button>
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="text-xs text-zinc-400">{loading ? "Searching…" : trimmed ? "Suggestions" : ""}</div>
            {trimmed ? (
              <Link href={actionHref} className="text-xs text-zinc-300 hover:text-white" onClick={() => setOpen(false)}>
                View all →
              </Link>
            ) : null}
          </div>

          {!trimmed ? (
            <div className="px-3 py-4 text-sm text-zinc-400">Type to search…</div>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              {/* Books first */}
              <div className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{inArabic ? "الكتب" : "Books"}</div>
              <div className="p-2">
                {(data?.books ?? []).length ? (
                  <div className="grid gap-1">
                    {data!.books.map((b) => (
                      <Link
                        key={b.id}
                        href={inArabic ? `/ar/book/${b.id}` : `/book/${b.id}`}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5"
                        onClick={() => setOpen(false)}
                      >
                        <div className="h-10 w-7 overflow-hidden rounded bg-white/5 ring-1 ring-white/10">
                          {b.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.cover} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-sm text-white">{b.title}</div>
                          <div className="line-clamp-1 text-xs text-zinc-400">{b.author}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-2 text-sm text-zinc-400">{inArabic ? "لا توجد نتائج." : "No books."}</div>
                )}
              </div>

              {inArabic ? null : (
                <>
                  {/* Authors */}
                  <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Authors</div>
                  <div className="p-2">
                    {(data?.authors ?? []).length ? (
                      <div className="grid gap-1">
                        {data!.authors.map((name) => (
                          <Link
                            key={name}
                            href={`/author?name=${encodeURIComponent(name)}`}
                            className="rounded-lg px-2 py-2 text-sm text-zinc-200 hover:bg-white/5"
                            onClick={() => setOpen(false)}
                          >
                            {name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="px-2 py-2 text-sm text-zinc-400">No authors.</div>
                    )}
                  </div>

                  {/* Topics */}
                  <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Topics</div>
                  <div className="p-2">
                    {(data?.topics ?? []).length ? (
                      <div className="grid gap-1">
                        {data!.topics.map((t) => (
                          <Link
                            key={t}
                            href={`/books?${new URLSearchParams({ sort: "popular", topic: t }).toString()}`}
                            className="rounded-lg px-2 py-2 text-sm text-zinc-200 hover:bg-white/5"
                            onClick={() => setOpen(false)}
                          >
                            {t}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="px-2 py-2 text-sm text-zinc-400">No topics.</div>
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
