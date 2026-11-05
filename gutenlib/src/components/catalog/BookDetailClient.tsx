"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FavoriteStar } from "@/components/library/FavoriteStar";
import { AddToListButton } from "@/components/library/AddToListButton";
import { getCoverUrl, type GutendexBook } from "@/lib/gutendex";
import { BookOpen, Download, RefreshCw } from "lucide-react";

interface BookDetailClientProps {
  initialBook: GutendexBook;
  isInitialDegraded: boolean;
}

export function BookDetailClient({ initialBook, isInitialDegraded }: BookDetailClientProps) {
  const [book, setBook] = useState<GutendexBook>(initialBook);
  const [isDegraded, setIsDegraded] = useState<boolean>(isInitialDegraded);
  const [hydrating, setHydrating] = useState<boolean>(false);

  // In the browser, fetch the live metadata via /api/book/[id] if initially degraded
  useEffect(() => {
    if (isInitialDegraded || book.title.startsWith("Project Gutenberg Book #")) {
      setHydrating(true);
      fetch(`/api/book/${initialBook.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: GutendexBook | null) => {
          if (data && data.title && !data.title.startsWith("Project Gutenberg Book #")) {
            setBook(data);
            setIsDegraded(false);
          }
        })
        .catch(() => {})
        .finally(() => setHydrating(false));
    }
  }, [initialBook.id, isInitialDegraded]);

  const formats = book.formats ?? {};
  const cover = getCoverUrl(formats);
  const epub = formats["application/epub+zip"] ?? `https://www.gutenberg.org/ebooks/${book.id}.epub3.images`;
  const txt =
    formats["text/plain; charset=utf-8"] ??
    formats["text/plain"] ??
    `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/books"
          className="pressable inline-flex items-center gap-1.5 text-xs sm:text-sm text-zinc-300 hover:text-white"
        >
          ← Back to catalog
        </Link>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>ID #{book.id}</span>
          {book.download_count != null && book.download_count > 0 && (
            <span>· {book.download_count.toLocaleString()} downloads</span>
          )}
          {hydrating && <RefreshCw className="h-3 w-3 animate-spin text-emerald-400" />}
        </div>
      </div>

      {isDegraded && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200 ring-1 ring-amber-500/20">
          <span>📚 Showing cached Project Gutenberg details while upstream metadata syncs. Reading in-app and downloads remain fully operational.</span>
        </div>
      )}

      <div className="mt-6 sm:mt-8 grid gap-6 sm:gap-8 md:grid-cols-[240px_1fr]">
        <div className="interactive-cover mx-auto max-w-[180px] sm:max-w-[220px] md:max-w-none w-full overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 shadow-2xl">
          <div className="aspect-[2/3] bg-black/40 relative">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={book.title}
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes("cache/epub")) {
                    target.src = `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.cover.medium.jpg`;
                  } else {
                    target.style.display = "none";
                  }
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-3 text-center text-xs text-zinc-400">
                <BookOpen className="h-8 w-8 text-zinc-600 mb-2" />
                <span className="font-semibold text-zinc-300 line-clamp-3">{book.title}</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white">{book.title}</h1>
          <div className="mt-2 text-sm sm:text-base text-zinc-300">
            By{" "}
            <span className="font-medium text-white">
              {book.authors?.length ? book.authors.map((a) => a.name).join(", ") : "Unknown Author"}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href={`/read/${book.id}`}
              className="pressable flex-1 sm:flex-none justify-center min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
            >
              <BookOpen className="h-4 w-4" />
              <span>Read in app</span>
            </Link>
            <div className="flex items-center gap-2">
              <FavoriteStar bookKey={`gutendex:${String(book.id)}`} />
              <AddToListButton bookKey={`gutendex:${String(book.id)}`} />
            </div>
            {epub && (
              <a
                href={epub}
                className="pressable min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>EPUB</span>
              </a>
            )}
            {txt && (
              <a
                href={txt}
                className="pressable min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/15"
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>TXT</span>
              </a>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Languages</div>
              <div className="mt-2 text-sm text-zinc-200">
                {book.languages?.join(", ").toUpperCase() || "ENGLISH"}
              </div>
            </div>
            <div className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Bookshelves</div>
              <div className="mt-2 text-sm text-zinc-200">
                {book.bookshelves?.slice(0, 6).join(" · ") || "Classical Literature"}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Subjects</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(book.subjects ?? []).length > 0 ? (
                (book.subjects ?? []).slice(0, 18).map((s) => (
                  <span key={s} className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-500">Public Domain Literature</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

