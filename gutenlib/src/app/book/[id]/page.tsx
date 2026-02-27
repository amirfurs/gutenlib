import Link from "next/link";
import { FavoriteStar } from "@/components/library/FavoriteStar";
import { AddToListButton } from "@/components/library/AddToListButton";
import { getCoverUrl, gutendex, type GutendexBook } from "@/lib/gutendex";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const book = await gutendex<GutendexBook>(`/books/${id}`);

  const cover = getCoverUrl(book.formats);
  const epub = book.formats["application/epub+zip"] ?? null;
  const txt = book.formats["text/plain; charset=utf-8"] ?? book.formats["text/plain"] ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/books" className="text-sm text-zinc-300 hover:text-white">← Back</Link>
        <div className="text-xs text-zinc-500">ID {book.id} · downloads {book.download_count}</div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
          <div className="aspect-[2/3] bg-black/40">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={book.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-3 text-xs text-zinc-400">No cover</div>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">{book.title}</h1>
          <div className="mt-2 text-sm text-zinc-300">
            By {book.authors?.length ? book.authors.map((a) => a.name).join(", ") : "Unknown"}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href={`/read/${book.id}`} className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              Read in app
            </Link>
            <FavoriteStar bookKey={`gutendex:${String(book.id)}`} />
            <AddToListButton bookKey={`gutendex:${String(book.id)}`} />
            {epub ? (
              <a href={epub} className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15" target="_blank" rel="noreferrer">
                Download EPUB
              </a>
            ) : null}
            {txt ? (
              <a href={txt} className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15" target="_blank" rel="noreferrer">
                Download TXT
              </a>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Languages</div>
              <div className="mt-2 text-sm text-zinc-200">{book.languages?.join(", ") || "-"}</div>
            </div>
            <div className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Bookshelves</div>
              <div className="mt-2 text-sm text-zinc-200">{book.bookshelves?.slice(0, 6).join(" · ") || "-"}</div>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Subjects</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(book.subjects ?? []).slice(0, 18).map((s) => (
                <span key={s} className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
