import Link from "next/link";
import { TopicsSelect } from "@/components/TopicsSelect";
import { getCoverUrl, gutendex, getCuratedBooksList, type GutendexList } from "@/lib/gutendex";

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; topic?: string; sort?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.search ?? "").trim();
  const topic = (sp.topic ?? "").trim();
  const sort = (sp.sort ?? "popular").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  let data: GutendexList;
  let isDegraded = false;

  try {
    data = await gutendex<GutendexList>("/books", {
      search,
      topic,
      sort,
      page,
      languages: "en",
    });

    if ((!data.results || data.results.length === 0) && (data.error || data.degraded)) {
      isDegraded = true;
      data = getCuratedBooksList({ search, topic, sort, page });
    }
  } catch {
    isDegraded = true;
    data = getCuratedBooksList({ search, topic, sort, page });
  }

  const results = data?.results ?? [];

  return (
    <main className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Books</h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400">
            {isDegraded ? "Curated Project Gutenberg classical literature." : "English-only catalog via Gutendex."}
          </p>
        </div>
        <Link href="/" className="text-xs sm:text-sm text-zinc-300 hover:text-white">Home</Link>
      </div>

      {isDegraded && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200 ring-1 ring-amber-500/20">
          <span>📚 Showing curated classical literature while the Project Gutenberg catalog syncs. All titles are fully readable.</span>
          <Link href="/books" className="shrink-0 font-medium underline hover:text-white">
            Refresh
          </Link>
        </div>
      )}

      <form className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-2.5 sm:gap-3" action="/books" method="get">
        <input name="search" defaultValue={search} placeholder="Search title/author..." className="h-10 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10" />

        {/* Topics from subjects (select instead of typing) */}
        <TopicsSelect />

        <select name="sort" defaultValue={sort} className="h-10 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10">
          <option value="popular">Popular</option>
          <option value="ascending">ID ↑</option>
          <option value="descending">ID ↓</option>
        </select>

        <button type="submit" className="pressable h-10 min-h-[40px] rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-600">
          Search
        </button>
      </form>

      {results.length === 0 ? (
        <div className="mt-12 rounded-2xl bg-white/[0.02] p-8 text-center ring-1 ring-white/10">
          <p className="text-base font-semibold text-white">No books found</p>
          <p className="mt-1 text-xs text-zinc-400">Try adjusting your search query or topic filter.</p>
          <Link href="/books" className="mt-4 inline-flex items-center rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15">
            Reset Filters
          </Link>
        </div>
      ) : (
        <div className="mt-6 sm:mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {results.map((b) => {
            const cover = getCoverUrl(b.formats);
            return (
              <Link
                key={b.id}
                href={`/book/${b.id}`}
                className="pressable interactive-card group overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 shadow-md"
              >
                <div className="aspect-[2/3] overflow-hidden bg-black/40">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt={b.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-3 text-xs text-zinc-400">No cover</div>
                  )}
                </div>
                <div className="p-2.5 sm:p-3">
                  <div className="line-clamp-2 text-xs sm:text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">{b.title}</div>
                  <div className="mt-1 line-clamp-1 text-[11px] sm:text-xs text-zinc-400">{b.authors?.[0]?.name ?? "Unknown"}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between text-sm">
        <Link
          className={page <= 1 ? "pointer-events-none text-zinc-600" : "pressable min-h-[44px] inline-flex items-center justify-center rounded-lg bg-white/5 px-4 py-2 ring-1 ring-white/10 text-zinc-200 hover:text-white"}
          href={`/books?${new URLSearchParams({ ...(search ? { search } : {}), ...(topic ? { topic } : {}), sort, page: String(page - 1) }).toString()}`}
        >
          ← Prev
        </Link>
        <div className="text-zinc-400 font-medium">Page {page}</div>
        <Link
          className={data?.next ? "pressable min-h-[44px] inline-flex items-center justify-center rounded-lg bg-white/5 px-4 py-2 ring-1 ring-white/10 text-zinc-200 hover:text-white" : "pointer-events-none text-zinc-600"}
          href={`/books?${new URLSearchParams({ ...(search ? { search } : {}), ...(topic ? { topic } : {}), sort, page: String(page + 1) }).toString()}`}
        >
          Next →
        </Link>
      </div>
    </main>
  );
}
