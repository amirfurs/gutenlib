import { BookDetailClient } from "@/components/catalog/BookDetailClient";
import { gutendex, getFallbackBook, type GutendexBook } from "@/lib/gutendex";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let book: GutendexBook | null = null;
  let isDegraded = false;

  try {
    book = await gutendex<GutendexBook>(`/books/${id}`);
  } catch {
    isDegraded = true;
    book = getFallbackBook(id);
  }

  if (!book) {
    book = getFallbackBook(id);
  }

  return (
    <main className="mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-10">
      <BookDetailClient initialBook={book} isInitialDegraded={isDegraded} />
    </main>
  );
}
