import { NextResponse } from "next/server";
import { gutendex, getFallbackBook, type GutendexBook, type GutendexList } from "@/lib/gutendex";
import { fetchOfficialGutenbergBook } from "@/lib/gutenbergOfficial";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  // 1. Try official Gutenberg book details (100% reliable, never blocked)
  try {
    const officialBook = await fetchOfficialGutenbergBook(id);
    return NextResponse.json(officialBook, {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // 2. Try Gutendex
    try {
      const data = await gutendex<GutendexBook>(`/books/${id}`);
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    } catch {
      try {
        const list = await gutendex<GutendexList>("/books", { ids: id }, 4000);
        const book = list.results?.[0];
        if (book) {
          return NextResponse.json(book, {
            headers: {
              "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
            },
          });
        }
      } catch {
        // ignore
      }

      const fallback = getFallbackBook(id);
      if (fallback) {
        return NextResponse.json(fallback, {
          headers: {
            "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      }

      return NextResponse.json({ error: "Book not found or upstream unavailable" }, { status: 404 });
    }
  }
}
