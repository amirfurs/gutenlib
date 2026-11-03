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
  error?: string;
  degraded?: boolean;
};

const BASE = "https://gutendex.com";
const USER_AGENT = "Mozilla/5.0 (compatible; GutenLib/1.0; +https://github.com/amirfurs/gutenlib)";

let ipv4Configured = false;
export async function ensureIpv4() {
  if (ipv4Configured) return;
  ipv4Configured = true;
  if (typeof window === "undefined") {
    try {
      const dns = await import("node:dns");
      if (typeof dns.setDefaultResultOrder === "function") {
        dns.setDefaultResultOrder("ipv4first");
      }
    } catch {
      // ignore
    }
  }
}

export async function gutendex<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 9000
): Promise<T> {
  await ensureIpv4();

  // Django REST framework expects trailing slash on endpoints like /books/ and /books/1342/
  let normalizedPath = path;
  if (!normalizedPath.startsWith("http") && !normalizedPath.endsWith("/")) {
    normalizedPath += "/";
  }

  const url = new URL(normalizedPath.startsWith("http") ? normalizedPath : `${BASE}${normalizedPath}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        next: { revalidate: 60 * 10 },
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(timeoutMs),
      } as any);

      if (!res.ok) {
        throw new Error(`Gutendex error ${res.status}: ${await res.text().catch(() => "")}`);
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Gutendex request failed"));
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
