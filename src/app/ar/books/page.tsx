import Link from "next/link";
import { AblCover } from "@/components/abl/AblCover";
import { ablAuthors, ablThumbnailUrl } from "@/lib/abl/helpers";
import { getServerBaseUrl } from "@/lib/serverUrl";
import { ArabicBooksFilters } from "@/components/abl/ArabicBooksFilters";

type AblList = {
  books?: any[];
  pagination?: {
    currentPage?: number;
    perPage?: number;
    totalPages?: number;
    totalItems?: number;
  };
};

export default async function ArabicBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; author?: string; category?: string; sort?: string; diedFrom?: string; diedTo?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const author = (sp.author ?? "").trim();
  const category = (sp.category ?? "").trim();
  const diedFrom = (sp.diedFrom ?? "").trim();
  const diedTo = (sp.diedTo ?? "").trim();
  const sort = (sp.sort ?? "died_desc").trim();

  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const qs = new URLSearchParams({
    page: String(page),
    perPage: "40",
    lang: "ar",
    // filter out non-Arabic books (e.g., Persian)
    languages: "ar",
  });
  if (q) qs.set("query", q);
  if (author) qs.set("author", author);
  if (category) qs.set("categories", category);
  if (diedFrom) qs.set("diedFrom", diedFrom);
  if (diedTo) qs.set("diedTo", diedTo);

  // sort mapping
  const SORT_MAP: Record<string, { sortBy: string; sortDir: string }> = {
    died_desc: { sortBy: "3", sortDir: "2" },
    died_asc: { sortBy: "3", sortDir: "1" },
    created_desc: { sortBy: "6", sortDir: "2" },
    created_asc: { sortBy: "6", sortDir: "1" },
    updated_desc: { sortBy: "7", sortDir: "2" },
    updated_asc: { sortBy: "7", sortDir: "1" },
    title_asc: { sortBy: "1", sortDir: "1" },
    title_desc: { sortBy: "1", sortDir: "2" },
    pages_asc: { sortBy: "4", sortDir: "1" },
    pages_desc: { sortBy: "4", sortDir: "2" },
  };
  const s = SORT_MAP[sort] ?? SORT_MAP.died_desc;
  qs.set("sortBy", s.sortBy);
  qs.set("sortDir", s.sortDir);

  const baseUrl = await getServerBaseUrl();
  const res = await fetch(`${baseUrl}/api/abl/books?${qs.toString()}`, {
    cache: "no-store",
  });

  const data = (await res.json()) as AblList;
  const items = data.books ?? [];
  const pagination = data.pagination;

  const availableCategories = Array.from(
    new Map(
      items
        .flatMap((b: any) => (b.categories ?? []).map((c: any) => ({ id: String(c.id), name: String(c.name) })))
        .filter((c: any) => c.id && c.name)
        .map((c: any) => [c.id, c])
    ).values()
  ).slice(0, 60);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">كتب عربية</h1>
          <p className="mt-1 text-sm text-zinc-400">المصدر: grpc.ablibrary.net</p>
        </div>
        <Link href="/" className="text-sm text-zinc-300 hover:text-white">الرئيسية</Link>
      </div>

      <ArabicBooksFilters
        initial={{ q, author, category, page, sort, diedFrom, diedTo }}
        categories={availableCategories}
      />

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((b: any) => {
          const cover = ablThumbnailUrl(b);
          return (
            <Link
              key={b.id}
              href={`/ar/book/${b.id}`}
              className="group relative overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 transition hover:bg-white/7 hover:ring-white/15"
            >
              <div className="relative aspect-[2/3] bg-black/40">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt={b.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                ) : (
                  <AblCover title={String(b.title ?? "").trim() || `ABL #${b.id}`} subtitle={ablAuthors(b)} seed={`abl:${b.id}:${b.title ?? ""}`} />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
              </div>

              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="line-clamp-2 text-sm font-semibold text-white">{b.title}</div>
                  {b.volumeNumber || b.volumeLabel ? (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-zinc-200 ring-1 ring-white/10">
                      {(() => {
                        const n = b.volumeNumber != null ? String(b.volumeNumber) : "";
                        const label = b.volumeLabel != null ? String(b.volumeLabel).trim() : "";
                        if (label) {
                          if (n && (label === n || label.includes(n))) return label;
                          return n ? `${label} ${n}` : label;
                        }
                        return n ? `الجزء ${n}` : "";
                      })()}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-zinc-400">{ablAuthors(b)}</div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {b.pagesCount ? (
                    <span className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] text-zinc-300 ring-1 ring-white/10">
                      {b.pagesCount} صفحة
                    </span>
                  ) : null}
                  {(b.categories ?? []).slice(0, 1).map((c: any) => (
                    <span
                      key={c?.id ?? c?.name}
                      className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] text-zinc-300 ring-1 ring-white/10"
                    >
                      {c?.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/5 blur-2xl transition group-hover:bg-white/10" />
            </Link>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between text-sm">
        {(() => {
          const totalPages = pagination?.totalPages ?? 0;
          const current = pagination?.currentPage ?? page;
          const canPrev = current > 1;
          const canNext = totalPages ? current < totalPages : items.length > 0;

          const paramsBase: Record<string, string> = {};
          if (q) paramsBase.q = q;
          if (author) paramsBase.author = author;
          if (category) paramsBase.category = category;
          if (sort) paramsBase.sort = sort;
          if (diedFrom) paramsBase.diedFrom = diedFrom;
          if (diedTo) paramsBase.diedTo = diedTo;

          return (
            <>
              <Link
                className={canPrev ? "text-zinc-200 hover:text-white" : "pointer-events-none text-zinc-600"}
                href={`/ar/books?${new URLSearchParams({ ...paramsBase, page: String(current - 1) }).toString()}`}
              >
                السابق
              </Link>

              <div className="text-zinc-400">
                صفحة {current}
                {totalPages ? ` / ${totalPages}` : ""}
                {pagination?.totalItems ? ` — ${pagination.totalItems} كتاب` : ""}
              </div>

              <Link
                className={canNext ? "text-zinc-200 hover:text-white" : "pointer-events-none text-zinc-600"}
                href={`/ar/books?${new URLSearchParams({ ...paramsBase, page: String(current + 1) }).toString()}`}
              >
                التالي
              </Link>
            </>
          );
        })()}
      </div>
    </main>
  );
}
