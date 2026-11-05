import { NextResponse } from "next/server";
import { gutendex, type GutendexBook } from "@/lib/gutendex";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let epubUrl: string | null = null;

  try {
    const book = await gutendex<GutendexBook>(`/books/${id}`);
    epubUrl =
      book.formats["application/epub+zip"] ??
      Object.entries(book.formats).find(([k]) => k.toLowerCase().startsWith("application/epub+zip"))?.[1] ??
      null;
  } catch {
    epubUrl = null;
  }

  const candidateUrls = [
    ...(epubUrl ? [epubUrl] : []),
    `https://www.gutenberg.org/ebooks/${id}.epub3.images`,
    `https://www.gutenberg.org/ebooks/${id}.epub.images`,
    `https://www.gutenberg.org/ebooks/${id}.epub.noimages`,
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
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const buf = await res.arrayBuffer();
        return new NextResponse(buf, {
          headers: {
            "Content-Type": "application/epub+zip",
            "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
            "Content-Disposition": `inline; filename="book-${id}.epub"`,
          },
        });
      }
    } catch {
      // Try next candidate
    }
  }

  return NextResponse.json({ error: "Failed to fetch EPUB" }, { status: 502 });
}
