import Link from "next/link";
import { getCoverUrl, gutendex, type GutendexList } from "@/lib/gutendex";

export default async function AuthorPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const name = (sp.name ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  if (!name) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-black text-white">Author</h1>
        <p className="mt-2 text-sm text-zinc-400">Missing author name.</p>
        <Link href="/books" className="mt-6 inline-block text-sm text-zinc-300 hover:text-white">← Back to books</Link>
      </main>
    );
  }

  const data = await gutendex<GutendexList>("/books", {
    search: name,
    page,
    languages: "en",
    sort: "popular",
  });

  // filter to books that actually include this author in the author list
  const filtered = (data.results ?? []).filter((b) =>
    (b.authors ?? []).some((a) => a.name?.toLowerCase() === name.toLowerCase())
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">{name}</h1>
          <p className="mt-1 text-sm text-zinc-400">Author page (English books). Found {filtered.length} on this page.</p>
        </div>
        <Link href="/books" className="text-sm text-zinc-300 hover:text-white">← Back</Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {filtered.map((b) => {
          const cover = getCoverUrl(b.formats);
          return (
            <Link
              key={b.id}
              href={`/book/${b.id}`}
              className="group overflow-hidden rounded-md bg-white/5 ring-1 ring-white/10 hover:ring-white/20"
            >
              <div className="aspect-[2/3] bg-black/40">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={b.title} className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-xs text-zinc-400">No cover</div>
                )}
              </div>
              <div className="p-2">
                <div className="line-clamp-2 text-sm font-semibold text-white">{b.title}</div>
                <div className="mt-1 line-clamp-1 text-xs text-zinc-400">downloads {b.download_count}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between text-sm">
        <Link
          className={page <= 1 ? "pointer-events-none text-zinc-600" : "text-zinc-200 hover:text-white"}
          href={`/author?${new URLSearchParams({ name, page: String(page - 1) }).toString()}`}
        >
          ← Prev
        </Link>
        <div className="text-zinc-400">Page {page}</div>
        <Link
          className={data.next ? "text-zinc-200 hover:text-white" : "pointer-events-none text-zinc-600"}
          href={`/author?${new URLSearchParams({ name, page: String(page + 1) }).toString()}`}
        >
          Next →
        </Link>
      </div>
    </main>
  );
}
