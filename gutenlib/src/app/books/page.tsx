import { BooksCatalog } from "@/components/catalog/BooksCatalog";
import { gutendex, getCuratedBooksList, type GutendexList } from "@/lib/gutendex";

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; topic?: string; sort?: string; page?: string; languages?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.search ?? "").trim();
  const topic = (sp.topic ?? "").trim();
  const sort = (sp.sort ?? "popular").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const languages = (sp.languages ?? "all").trim();

  let initialData: GutendexList;
  try {
    initialData = await gutendex<GutendexList>("/books", {
      search,
      topic,
      sort,
      page,
      ...(languages && languages !== "all" ? { languages } : {}),
    });
  } catch {
    initialData = getCuratedBooksList({ search, topic, sort, page });
  }

  return (
    <main className="mx-auto max-w-6xl px-3 sm:px-4 py-6 sm:py-10">
      <BooksCatalog
        initialData={initialData}
        initialSearch={search}
        initialTopic={topic}
        initialSort={sort}
        initialLanguage={languages}
        initialPage={page}
      />
    </main>
  );
}
