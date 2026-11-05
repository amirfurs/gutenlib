import { NextResponse } from "next/server";
import { ensureIpv4, gutendex, type GutendexBook } from "@/lib/gutendex";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureIpv4();
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
  }

  // Optimized candidates: Prefer Gutenberg's official fast prebuilt EPUB first (~500KB vs 15MB+ epub3)
  const candidateUrls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.epub`,
    `https://www.gutenberg.org/ebooks/${id}.epub.noimages`,
    `https://www.gutenberg.org/ebooks/${id}.epub.images`,
    `https://www.gutenberg.org/ebooks/${id}.epub3.images`,
  ];

  for (const candidate of candidateUrls) {
    try {
      const res = await fetch(candidate, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
          Accept: "application/epub+zip,application/octet-stream;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const buf = await res.arrayBuffer();
        return new NextResponse(buf, {
          headers: {
            "Content-Type": "application/epub+zip",
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            "Content-Disposition": `inline; filename="book-${id}.epub"`,
          },
        });
      }
    } catch {
      // Try next candidate
    }
  }

  // Fallback to gutendex format lookup if direct candidates failed
  try {
    const book = await gutendex<GutendexBook>(`/books/${id}`);
    const epubUrl =
      book.formats["application/epub+zip"] ??
      Object.entries(book.formats).find(([k]) => k.toLowerCase().startsWith("application/epub+zip"))?.[1] ??
      null;

    if (epubUrl) {
      const res = await fetch(epubUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GutenLib/1.0)",
          Accept: "application/epub+zip,*/*",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return new NextResponse(buf, {
          headers: {
            "Content-Type": "application/epub+zip",
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            "Content-Disposition": `inline; filename="book-${id}.epub"`,
          },
        });
      }
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ error: "Failed to fetch EPUB" }, { status: 502 });
}
