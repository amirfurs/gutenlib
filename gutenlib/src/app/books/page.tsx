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

  const qs = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(topic ? { topic } : {}),
    ...(sort ? { sort } : {}),
    page: String(page),
  });

  const data = await gutendex<GutendexList>("/books", {
    search,
    topic,
    sort,
    page,
    languages: "en",
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Books</h1>
          <p className="mt-1 text-sm text-zinc-400">English-only catalog via Gutendex.</p>
        </div>
        <Link href="/" className="text-sm text-zinc-300 hover:text-white">Home</Link>
      </div>

      <form className="mt-6 grid gap-3 sm:grid-cols-4" action="/books" method="get">
        <input name="search" defaultValue={search} placeholder="Search title/author..." className="h-10 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10" />

        {/* Topics from subjects (select instead of typing) */}
        <TopicsSelect />

        <select name="sort" defaultValue={sort} className="h-10 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10">
          <option value="popular">Popular</option>
          <option value="ascending">ID ↑</option>
          <option value="descending">ID ↓</option>
        </select>

        <button type="submit" className="h-10 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
          Search
        </button>
      </form>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {data.results.map((b) => {
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
                <div className="mt-1 line-clamp-1 text-xs text-zinc-400">{b.authors?.[0]?.name ?? "Unknown"}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between text-sm">
        <Link
          className={page <= 1 ? "pointer-events-none text-zinc-600" : "text-zinc-200 hover:text-white"}
          href={`/books?${new URLSearchParams({ ...(search ? { search } : {}), ...(topic ? { topic } : {}), sort, page: String(page - 1) }).toString()}`}
        >
          ← Prev
        </Link>
        <div className="text-zinc-400">Page {page}</div>
        <Link
          className={data.next ? "text-zinc-200 hover:text-white" : "pointer-events-none text-zinc-600"}
          href={`/books?${new URLSearchParams({ ...(search ? { search } : {}), ...(topic ? { topic } : {}), sort, page: String(page + 1) }).toString()}`}
        >
          Next →
        </Link>
      </div>
    </main>
  );
}
