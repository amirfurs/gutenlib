import { NextResponse } from "next/server";
import { gutendex, type GutendexBook, type GutendexList } from "@/lib/gutendex";

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
    // Resilient fallback: Gutendex CDN caches list endpoints with ?ids= very aggressively
    try {
      const list = await gutendex<GutendexList>("/books", { ids: id }, 7000);
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

    return NextResponse.json({ error: "Book not found or upstream unavailable" }, { status: 404 });
  }
}
