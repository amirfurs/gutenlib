import { NextResponse } from "next/server";
import { gutendex, getBestTextUrl, ensureIpv4, type GutendexBook, type GutendexList } from "@/lib/gutendex";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureIpv4();
  const { id } = await params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "txt").toLowerCase();

  let book: GutendexBook | null = null;
  try {
    book = await gutendex<GutendexBook>(`/books/${id}`);
  } catch {
    try {
      const list = await gutendex<GutendexList>("/books", { ids: id }, 7000);
      book = list.results?.[0] ?? null;
    } catch {
      book = null;
    }
  }

  if (!book) {
    // Direct Gutenberg fallback for plain text if metadata service is unavailable
    try {
      const directUrl = `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`;
      const directRes = await fetch(directUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GutenLib/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
      if (directRes.ok) {
        const text = await directRes.text();
        return new NextResponse(text, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ error: "Failed to load book text" }, { status: 404 });
  }

  const best = getBestTextUrl(book.formats);
  if (!best) return NextResponse.json({ error: "No readable text format" }, { status: 404 });

  // Prefer requested; for TXT, aggressively prefer real .txt URLs.
  let chosen = best;

  if (format === "html") {
    const h = book.formats["text/html; charset=utf-8"] ?? book.formats["text/html"];
    if (h) chosen = { mime: "text/html", url: h };
  } else {
    // Look for any text/plain formats (Gutendex sometimes uses different charsets)
    const plainCandidates = Object.entries(book.formats)
      .filter(([k]) => k.toLowerCase().startsWith("text/plain"))
      .map(([, v]) => v);

    // Prefer cache/epub .txt, then any .txt-like URL, then fallback.
    const pick =
      plainCandidates.find((u) => /\/cache\/epub\//.test(u) && /\.txt(\b|\.)/i.test(u)) ??
      plainCandidates.find((u) => /\.txt(\b|\.)/i.test(u)) ??
      (book.formats["text/plain; charset=utf-8"] ?? book.formats["text/plain"]) ??
      null;

    if (pick) chosen = { mime: "text/plain", url: pick };
  }

  try {
    const res = await fetch(chosen.url, {
      headers: {
        Accept: chosen.mime === "text/html" ? "text/html" : "text/plain",
        "User-Agent": "Mozilla/5.0 (compatible; GutenLib/1.0)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch book text (${res.status})` }, { status: 502 });
    }

    let text = await res.text();

    // Some books return HTML even when requesting "text" formats.
    // Convert to readable plain text for the in-app reader.
    const looksLikeHtml =
      chosen.mime === "text/html" ||
      /<\/?(html|body|div|p|h\d|table|br)\b/i.test(text) ||
      /&lt;\/?(html|body|div|p|h\d|table|br)\b/i.test(text);

    if (looksLikeHtml) {
      text = text
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"');

      text = text.replace(/<div[^>]*class=["']mynote["'][^>]*>[\s\S]*?<\/div>/gi, "\n");
      text = text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h\d|tr)>/gi, "\n")
        .replace(/<\/(td|th)>/gi, "\t")
        .replace(/<\/(table|tbody|thead)>/gi, "\n");

      text = text.replace(/<[^>]+>/g, "");
      text = text
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : "Error reading book content";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
