import { NextResponse } from "next/server";
import { gutendex, getFallbackBook, type GutendexBook, type GutendexList } from "@/lib/gutendex";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
