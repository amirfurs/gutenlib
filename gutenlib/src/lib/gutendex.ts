export type GutendexPerson = {
  name: string;
  birth_year: number | null;
  death_year: number | null;
};

export type GutendexBook = {
  id: number;
  title: string;
  authors: GutendexPerson[];
  translators: GutendexPerson[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  copyright: boolean | null;
  media_type: string;
  formats: Record<string, string>;
  download_count: number;
};

export type GutendexList = {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
};

const BASE = "https://gutendex.com";

export async function gutendex<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    // Gutendex is cache-friendly; tune later
    next: { revalidate: 60 * 10 },
    headers: { "Accept": "application/json" },
  } as any);

  if (!res.ok) {
    throw new Error(`Gutendex error ${res.status}: ${await res.text().catch(() => "")}`);
  }

  return (await res.json()) as T;
}

export function getCoverUrl(formats: Record<string, string>): string | null {
  return formats["image/jpeg"] ?? null;
}

export function getBestTextUrl(formats: Record<string, string>): { mime: "text/plain" | "text/html"; url: string } | null {
  const txt = formats["text/plain; charset=utf-8"] ?? formats["text/plain"];
  if (txt) return { mime: "text/plain", url: txt };

  const html = formats["text/html; charset=utf-8"] ?? formats["text/html"];
  if (html) return { mime: "text/html", url: html };

  return null;
}
