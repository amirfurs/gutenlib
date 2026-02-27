import { NextResponse } from "next/server";
import { gutendex, type GutendexBook } from "@/lib/gutendex";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await gutendex<GutendexBook>(`/books/${id}`);

  const epubUrl =
    book.formats["application/epub+zip"] ??
    // some entries may have a charset suffix (rare)
    Object.entries(book.formats).find(([k]) => k.toLowerCase().startsWith("application/epub+zip"))?.[1] ??
    null;

  if (!epubUrl) {
    return NextResponse.json({ error: "No EPUB format available" }, { status: 404 });
  }

  const res = await fetch(epubUrl, {
    redirect: "follow",
    headers: {
      // helps some CDNs
      Accept: "application/epub+zip,application/octet-stream;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Failed to fetch EPUB (${res.status})` }, { status: 502 });
  }

  const buf = await res.arrayBuffer();

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      // Let the browser fetch as a file if needed
      "Content-Disposition": `inline; filename="book-${id}.epub"`,
    },
  });
}
