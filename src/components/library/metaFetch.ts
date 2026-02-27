import { ablAuthors, ablThumbnailUrl } from "@/lib/abl/helpers";
import { getCoverUrl } from "@/lib/gutendex";

export async function fetchAblMeta(ablId: string, signal?: AbortSignal) {
  const r = await fetch(`/api/abl/book/${ablId}?lang=ar`, { signal });
  const j = await r.json();
  const book = j?.book;
  return {
    title: String(book?.title ?? `ABL #${ablId}`),
    author: ablAuthors(book),
    cover: ablThumbnailUrl(book),
  };
}

export async function fetchGutendexMeta(id: string, signal?: AbortSignal) {
  const r = await fetch(`/api/book/${id}`, { signal });
  const book = await r.json();
  const authors = Array.isArray(book?.authors) ? book.authors.map((a: any) => a?.name).filter(Boolean).join(", ") : "";
  return {
    title: String(book?.title ?? `#${id}`),
    author: authors || "",
    cover: getCoverUrl(book?.formats ?? {}),
  };
}
