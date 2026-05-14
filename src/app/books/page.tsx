import Link from "next/link";
import { TopicsSelect } from "@/components/TopicsSelect";
import { getCoverUrl, gutendex, type GutendexList } from "@/lib/gutendex";

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

  const data = await gutendex<GutendexList>("/books", {
    search,
    topic,
    sort,
    page,
    languages: "en",
  });

  return (
    <main className="mx-auto max-w-7xl py-10 animate-fade-in-up" data-testid="books-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-white md:text-5xl" data-testid="books-title">Books</h1>
          <p className="mt-2 text-sm text-zinc-500">English catalog via Gutendex &middot; Page {page}</p>
        </div>
        <Link href="/" className="text-sm text-zinc-500 hover:text-amber-400 transition" data-testid="books-home-link">Home</Link>
      </div>

      <form className="mt-8 grid gap-3 sm:grid-cols-4" action="/books" method="get" data-testid="books-filter-form">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search title/author..."
          className="h-11 rounded-xl bg-white/5 px-4 text-sm text-white ring-1 ring-white/8 placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-500/40 transition"
          data-testid="books-search-input"
        />
        <TopicsSelect />
        <select
          name="sort"
          defaultValue={sort}
          className="h-11 rounded-xl bg-white/5 px-4 text-sm text-white ring-1 ring-white/8 focus:ring-2 focus:ring-amber-500/40 transition"
          data-testid="books-sort-select"
        >
          <option value="popular">Popular</option>
          <option value="ascending">ID ascending</option>
          <option value="descending">ID descending</option>
        </select>
        <button type="submit" className="btn-primary h-11 text-sm" data-testid="books-search-btn">
          Search
        </button>
      </form>

      <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 stagger-children" data-testid="books-grid">
        {data.results.map((b) => {
          const cover = getCoverUrl(b.formats);
          return (
            <Link
              key={b.id}
              href={`/book/${b.id}`}
              className="book-card group"
              data-testid={`book-card-${b.id}`}
            >
              <div className="aspect-[2/3] bg-[#0F0F16] overflow-hidden rounded-lg">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={b.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-xs text-zinc-600">No cover</div>
                )}
                <div className="book-overlay flex items-end p-3">
                  <span className="text-xs font-medium text-amber-400">View details &rarr;</span>
                </div>
              </div>
              <div className="mt-2.5 px-0.5">
                <div className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100 group-hover:text-white transition">{b.title}</div>
                <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{b.authors?.[0]?.name ?? "Unknown"}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-12 flex items-center justify-between" data-testid="books-pagination">
        <Link
          className={page <= 1 ? "pointer-events-none text-zinc-700" : "btn-glass px-5 py-2 text-sm"}
          href={`/books?${new URLSearchParams({ ...(search ? { search } : {}), ...(topic ? { topic } : {}), sort, page: String(page - 1) }).toString()}`}
          data-testid="books-prev-page"
        >
          &larr; Previous
        </Link>
        <div className="text-sm text-zinc-500">Page {page}</div>
        <Link
          className={data.next ? "btn-glass px-5 py-2 text-sm" : "pointer-events-none text-zinc-700"}
          href={`/books?${new URLSearchParams({ ...(search ? { search } : {}), ...(topic ? { topic } : {}), sort, page: String(page + 1) }).toString()}`}
          data-testid="books-next-page"
        >
          Next &rarr;
        </Link>
      </div>
    </main>
  );
}
