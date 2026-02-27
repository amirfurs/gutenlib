import Link from "next/link";
import { AblCover } from "@/components/abl/AblCover";
import { AddToListButton } from "@/components/library/AddToListButton";
import { FavoriteStar } from "@/components/library/FavoriteStar";
import { ablAuthors, ablPdfUrl, ablThumbnailUrl } from "@/lib/abl/helpers";
import { getServerBaseUrl } from "@/lib/serverUrl";

export default async function ArabicBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const baseUrl = await getServerBaseUrl();
  const res = await fetch(`${baseUrl}/api/abl/book/${id}?lang=ar`, { cache: "no-store" });
  const data = await res.json();
  const book = data?.book;

  if (!book) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Link href="/ar/books" className="text-sm text-zinc-300 hover:text-white">← رجوع</Link>
        <div className="mt-6 text-sm text-red-300">لم يتم العثور على الكتاب.</div>
      </main>
    );
  }

  const cover = ablThumbnailUrl(book);
  const pdf = ablPdfUrl(book);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/ar/books" className="text-sm text-zinc-300 hover:text-white">← رجوع</Link>
        <div className="text-xs text-zinc-500">ID {book.id}</div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
          <div className="aspect-[2/3] bg-black/40">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={book.title} className="h-full w-full object-cover" />
            ) : (
              <AblCover
                title={String(book.title ?? "").trim() || `ABL #${book.id}`}
                subtitle={ablAuthors(book)}
                seed={`abl:${book.id}:${book.title ?? ""}`}
              />
            )}
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">{book.title}</h1>
          <div className="mt-2 text-sm text-zinc-300">{ablAuthors(book)}</div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href={`/ar/read/${book.id}`} className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              اقرأ داخل الموقع
            </Link>
            <FavoriteStar bookKey={`abl:${String(book.id)}`} />
            <AddToListButton bookKey={`abl:${String(book.id)}`} />
            {pdf ? (
              <a href={pdf} target="_blank" rel="noreferrer" className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
                تحميل PDF
              </a>
            ) : null}
            <Link href="/books" className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15">
              قسم Gutenberg
            </Link>
          </div>

          <div className="mt-6 rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">معلومات</div>

            <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {book.volumeNumber || book.volumeLabel ? (
                <div className="rounded-md bg-black/20 p-3 ring-1 ring-white/10">
                  <dt className="text-xs text-zinc-400">الجزء / المجلد</dt>
                  <dd className="mt-1 text-zinc-100">
                    {book.volumeLabel ? book.volumeLabel : "الجزء"} {book.volumeNumber ? String(book.volumeNumber) : ""}
                  </dd>
                </div>
              ) : null}

              {book.pagesCount ? (
                <div className="rounded-md bg-black/20 p-3 ring-1 ring-white/10">
                  <dt className="text-xs text-zinc-400">عدد الصفحات</dt>
                  <dd className="mt-1 text-zinc-100">{book.pagesCount}</dd>
                </div>
              ) : null}

              {Array.isArray(book.languages) && book.languages.length ? (
                <div className="rounded-md bg-black/20 p-3 ring-1 ring-white/10">
                  <dt className="text-xs text-zinc-400">اللغة</dt>
                  <dd className="mt-1 text-zinc-100">{book.languages.map((l: any) => l?.name ?? l?.id).filter(Boolean).join("، ")}</dd>
                </div>
              ) : null}

              {book.publisher?.name ? (
                <div className="rounded-md bg-black/20 p-3 ring-1 ring-white/10">
                  <dt className="text-xs text-zinc-400">الناشر</dt>
                  <dd className="mt-1 text-zinc-100">{book.publisher.name}</dd>
                </div>
              ) : null}

              {book.source ? (
                <div className="rounded-md bg-black/20 p-3 ring-1 ring-white/10">
                  <dt className="text-xs text-zinc-400">المصدر</dt>
                  <dd className="mt-1 text-zinc-100">{String(book.source).replace(/^BOOK_SOURCE_/, "")}</dd>
                </div>
              ) : null}

              {book.metadata?.status ? (
                <div className="rounded-md bg-black/20 p-3 ring-1 ring-white/10">
                  <dt className="text-xs text-zinc-400">الحالة</dt>
                  <dd className="mt-1 text-zinc-100">{String(book.metadata.status).replace(/^STATUS_/, "")}</dd>
                </div>
              ) : null}
            </dl>

            {Array.isArray(book.categories) && book.categories.length ? (
              <div className="mt-4">
                <div className="text-xs text-zinc-400">التصنيفات</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {book.categories
                    .map((c: any) => c?.name)
                    .filter(Boolean)
                    .slice(0, 12)
                    .map((name: string) => (
                      <span key={name} className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200 ring-1 ring-white/10">
                        {name}
                      </span>
                    ))}
                </div>
              </div>
            ) : null}
          </div>

          {book.abstract ? (
            <div className="mt-6 rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">نبذة</div>
              <div className="mt-2 text-sm leading-7 text-zinc-200">{book.abstract}</div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
