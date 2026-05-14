import Link from "next/link";
import { FavoriteStar } from "@/components/library/FavoriteStar";
import { AddToListButton } from "@/components/library/AddToListButton";
import { getCoverUrl, gutendex, type GutendexBook } from "@/lib/gutendex";
import { BookOpen, Download, FileText, ArrowLeft } from "lucide-react";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await gutendex<GutendexBook>(`/books/${id}`);
  const cover = getCoverUrl(book.formats);
  const epub = book.formats["application/epub+zip"] ?? null;
  const txt = book.formats["text/plain; charset=utf-8"] ?? book.formats["text/plain"] ?? null;

  return (
    <main className="mx-auto max-w-6xl py-10 animate-fade-in-up" data-testid="book-detail-page">
      <div className="flex items-center justify-between">
        <Link href="/books" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-amber-400 transition" data-testid="book-back-btn">
          <ArrowLeft className="h-4 w-4" />
          Back to books
        </Link>
        <div className="text-xs text-zinc-600">ID {book.id} &middot; {book.download_count.toLocaleString()} downloads</div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[280px_1fr]">
        {/* Cover */}
        <div className="overflow-hidden rounded-xl ring-1 ring-white/8 shadow-2xl" data-testid="book-cover">
          <div className="aspect-[2/3] bg-[#0F0F16]">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={book.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-3 text-xs text-zinc-600">No cover</div>
            )}
          </div>
        </div>

        {/* Details */}
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-white md:text-4xl" data-testid="book-title">{book.title}</h1>
          <div className="mt-3 text-base text-zinc-400" data-testid="book-author">
            By {book.authors?.length ? book.authors.map((a) => a.name).join(", ") : "Unknown"}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3" data-testid="book-actions">
            <Link href={`/read/${book.id}`} className="btn-primary inline-flex items-center gap-2 text-sm" data-testid="read-book-btn">
              <BookOpen className="h-4 w-4" />
              Read in app
            </Link>
            <FavoriteStar bookKey={`gutendex:${String(book.id)}`} />
            <AddToListButton bookKey={`gutendex:${String(book.id)}`} />
            {epub ? (
              <a href={epub} className="btn-glass inline-flex items-center gap-2 px-5 py-2.5 text-sm" target="_blank" rel="noreferrer" data-testid="download-epub-btn">
                <Download className="h-4 w-4" />
                EPUB
              </a>
            ) : null}
            {txt ? (
              <a href={txt} className="btn-glass inline-flex items-center gap-2 px-5 py-2.5 text-sm" target="_blank" rel="noreferrer" data-testid="download-txt-btn">
                <FileText className="h-4 w-4" />
                TXT
              </a>
            ) : null}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="glass-card rounded-xl p-5" data-testid="book-languages">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Languages</div>
              <div className="mt-2 text-sm text-zinc-300">{book.languages?.join(", ") || "-"}</div>
            </div>
            <div className="glass-card rounded-xl p-5" data-testid="book-bookshelves">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Bookshelves</div>
              <div className="mt-2 text-sm text-zinc-300">{book.bookshelves?.slice(0, 6).join(" / ") || "-"}</div>
            </div>
          </div>

          <div className="mt-4 glass-card rounded-xl p-5" data-testid="book-subjects">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Subjects</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(book.subjects ?? []).slice(0, 18).map((s) => (
                <span key={s} className="chip">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
