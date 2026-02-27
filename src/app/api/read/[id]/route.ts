import { NextResponse } from "next/server";
import { gutendex, getBestTextUrl, type GutendexBook } from "@/lib/gutendex";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "txt").toLowerCase();

  const book = await gutendex<GutendexBook>(`/books/${id}`);
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

  const res = await fetch(chosen.url, {
    // do not forward cookies
    headers: { "Accept": chosen.mime === "text/html" ? "text/html" : "text/plain" },
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
    // If tags are entity-escaped, decode the minimal entities first.
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');

    // drop common noisy sections (best-effort)
    text = text.replace(/<div[^>]*class=["']mynote["'][^>]*>[\s\S]*?<\/div>/gi, "\n");

    // convert some tags to newlines
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h\d|tr)>/gi, "\n")
      .replace(/<\/(td|th)>/gi, "\t")
      .replace(/<\/(table|tbody|thead)>/gi, "\n");

    // strip all remaining tags
    text = text.replace(/<[^>]+>/g, "");

    // entities already decoded above (if needed)

    // normalize whitespace
    text = text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return new NextResponse(text, {
    headers: {
      // Always return plain text to the reader
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
