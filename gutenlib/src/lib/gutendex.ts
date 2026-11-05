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

const BASE = process.env.GUTENDEX_BASE_URL || "https://gutendex.com";

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

export function buildFormats(id: number): Record<string, string> {
  return {
    "text/html": `https://www.gutenberg.org/ebooks/${id}.html.images`,
    "application/epub+zip": `https://www.gutenberg.org/ebooks/${id}.epub3.images`,
    "image/jpeg": `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    "text/plain; charset=utf-8": `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    "text/plain": `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
  };
}

export const FALLBACK_CLASSICS: GutendexBook[] = [
  {
    id: 1342,
    title: "Pride and Prejudice",
    authors: [{ name: "Austen, Jane", birth_year: 1775, death_year: 1817 }],
    translators: [],
    subjects: ["Courtship -- Fiction", "Sisters -- Fiction", "England -- Fiction", "Domestic fiction", "Social classes -- Fiction"],
    bookshelves: ["Best Books Ever Listings", "Historical Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(1342),
    download_count: 65420,
  },
  {
    id: 84,
    title: "Frankenstein; Or, The Modern Prometheus",
    authors: [{ name: "Shelley, Mary Wollstonecraft", birth_year: 1797, death_year: 1851 }],
    translators: [],
    subjects: ["Monsters -- Fiction", "Frankenstein's monster (Fictitious character) -- Fiction", "Science fiction", "Horror tales", "Gothic fiction"],
    bookshelves: ["Precursors of Science Fiction", "Science Fiction by Women", "Gothic Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(84),
    download_count: 48910,
  },
  {
    id: 11,
    title: "Alice's Adventures in Wonderland",
    authors: [{ name: "Carroll, Lewis", birth_year: 1832, death_year: 1898 }],
    translators: [],
    subjects: ["Fantasy fiction", "Children's stories", "Alice (Fictitious character from Carroll) -- Fiction"],
    bookshelves: ["Children's Literature"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(11),
    download_count: 39500,
  },
  {
    id: 345,
    title: "Dracula",
    authors: [{ name: "Stoker, Bram", birth_year: 1847, death_year: 1912 }],
    translators: [],
    subjects: ["Vampires -- Fiction", "Dracula, Count (Fictitious character) -- Fiction", "Horror tales", "Gothic fiction"],
    bookshelves: ["Horror", "Gothic Fiction", "Mystery Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(345),
    download_count: 37800,
  },
  {
    id: 1661,
    title: "The Adventures of Sherlock Holmes",
    authors: [{ name: "Doyle, Arthur Conan", birth_year: 1859, death_year: 1930 }],
    translators: [],
    subjects: ["Detective and mystery stories, English", "Holmes, Sherlock (Fictitious character) -- Fiction"],
    bookshelves: ["Detective Fiction", "Crime Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(1661),
    download_count: 36200,
  },
  {
    id: 2701,
    title: "Moby Dick; Or, The Whale",
    authors: [{ name: "Melville, Herman", birth_year: 1819, death_year: 1891 }],
    translators: [],
    subjects: ["Whales -- Fiction", "Whaling -- Fiction", "Sea stories", "Ahab, Captain (Fictitious character) -- Fiction"],
    bookshelves: ["Best Books Ever Listings", "Adventure"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(2701),
    download_count: 33400,
  },
  {
    id: 1513,
    title: "Romeo and Juliet",
    authors: [{ name: "Shakespeare, William", birth_year: 1564, death_year: 1616 }],
    translators: [],
    subjects: ["Tragedies", "Verona (Italy) -- Drama", "Vendetta -- Drama", "Conflict of generations -- Drama"],
    bookshelves: ["Plays", "Shakespeare"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(1513),
    download_count: 31200,
  },
  {
    id: 98,
    title: "A Tale of Two Cities",
    authors: [{ name: "Dickens, Charles", birth_year: 1812, death_year: 1870 }],
    translators: [],
    subjects: ["Historical fiction", "French Revolution -- Fiction", "London (England) -- Fiction", "Paris (France) -- Fiction"],
    bookshelves: ["Historical Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(98),
    download_count: 29800,
  },
  {
    id: 74,
    title: "The Adventures of Tom Sawyer",
    authors: [{ name: "Twain, Mark", birth_year: 1835, death_year: 1910 }],
    translators: [],
    subjects: ["Boys -- Fiction", "Sawyer, Tom (Fictitious character) -- Fiction", "Mississippi River -- Fiction", "Missouri -- Fiction"],
    bookshelves: ["Children's Literature"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(74),
    download_count: 28500,
  },
  {
    id: 5200,
    title: "Metamorphosis",
    authors: [{ name: "Kafka, Franz", birth_year: 1883, death_year: 1924 }],
    translators: [],
    subjects: ["Psychological fiction", "Metamorphosis -- Fiction"],
    bookshelves: ["Psychological Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(5200),
    download_count: 27900,
  },
  {
    id: 174,
    title: "The Picture of Dorian Gray",
    authors: [{ name: "Wilde, Oscar", birth_year: 1854, death_year: 1900 }],
    translators: [],
    subjects: ["Supernatural -- Fiction", "Conduct of life -- Fiction", "Portraits -- Fiction", "Gothic fiction"],
    bookshelves: ["Gothic Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(174),
    download_count: 26800,
  },
  {
    id: 1260,
    title: "Jane Eyre: An Autobiography",
    authors: [{ name: "Brontë, Charlotte", birth_year: 1816, death_year: 1855 }],
    translators: [],
    subjects: ["Governesses -- Fiction", "Love stories", "Orphans -- Fiction", "England -- Fiction"],
    bookshelves: ["Historical Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(1260),
    download_count: 25700,
  },
  {
    id: 76,
    title: "Adventures of Huckleberry Finn",
    authors: [{ name: "Twain, Mark", birth_year: 1835, death_year: 1910 }],
    translators: [],
    subjects: ["Boys -- Fiction", "Fugitive slaves -- Fiction", "Mississippi River -- Fiction", "Race relations -- Fiction"],
    bookshelves: ["Banned Books from Anne Haight's list"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(76),
    download_count: 24600,
  },
  {
    id: 2600,
    title: "War and Peace",
    authors: [{ name: "Tolstoy, Leo", birth_year: 1828, death_year: 1910 }],
    translators: [],
    subjects: ["Historical fiction", "Napoleonic Wars, 1800-1815 -- Fiction", "Russia -- History -- Alexander I, 1801-1825 -- Fiction"],
    bookshelves: ["Historical Fiction", "Best Books Ever Listings"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(2600),
    download_count: 23800,
  },
  {
    id: 2542,
    title: "A Doll's House: a play",
    authors: [{ name: "Ibsen, Henrik", birth_year: 1828, death_year: 1906 }],
    translators: [],
    subjects: ["Drama", "Marriage -- Drama", "Man-woman relationships -- Drama"],
    bookshelves: ["Plays"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(2542),
    download_count: 22400,
  },
  {
    id: 43,
    title: "The Strange Case of Dr. Jekyll and Mr. Hyde",
    authors: [{ name: "Stevenson, Robert Louis", birth_year: 1850, death_year: 1894 }],
    translators: [],
    subjects: ["Science fiction", "Horror tales", "London (England) -- Fiction", "Multiple personality -- Fiction"],
    bookshelves: ["Precursors of Science Fiction", "Horror"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(43),
    download_count: 21900,
  },
  {
    id: 1952,
    title: "The Yellow Wallpaper",
    authors: [{ name: "Gilman, Charlotte Perkins", birth_year: 1860, death_year: 1935 }],
    translators: [],
    subjects: ["Feminist fiction", "Mental illness -- Fiction", "Married women -- Psychology -- Fiction"],
    bookshelves: ["Gothic Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(1952),
    download_count: 20500,
  },
  {
    id: 46,
    title: "A Christmas Carol in Prose; Being a Ghost Story of Christmas",
    authors: [{ name: "Dickens, Charles", birth_year: 1812, death_year: 1870 }],
    translators: [],
    subjects: ["Ghost stories", "Christmas stories", "Scrooge, Ebenezer (Fictitious character) -- Fiction"],
    bookshelves: ["Children's Literature"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(46),
    download_count: 19700,
  },
  {
    id: 2554,
    title: "Crime and Punishment",
    authors: [{ name: "Dostoyevsky, Fyodor", birth_year: 1821, death_year: 1881 }],
    translators: [],
    subjects: ["Psychological fiction", "Murder -- Fiction", "Saint Petersburg (Russia) -- Fiction"],
    bookshelves: ["Crime Fiction", "Best Books Ever Listings"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(2554),
    download_count: 18900,
  },
  {
    id: 1727,
    title: "The Odyssey",
    authors: [{ name: "Homer", birth_year: null, death_year: null }],
    translators: [],
    subjects: ["Epic poetry, Greek -- Translations into English", "Odysseus, King of Ithaca (Mythological character) -- Poetry"],
    bookshelves: ["Classical Antiquity"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(1727),
    download_count: 18200,
  },
  {
    id: 6130,
    title: "The Iliad",
    authors: [{ name: "Homer", birth_year: null, death_year: null }],
    translators: [],
    subjects: ["Epic poetry, Greek -- Translations into English", "Achilles (Mythological character) -- Poetry", "Trojan War -- Poetry"],
    bookshelves: ["Classical Antiquity"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(6130),
    download_count: 17800,
  },
  {
    id: 1497,
    title: "The Republic",
    authors: [{ name: "Plato", birth_year: null, death_year: null }],
    translators: [],
    subjects: ["Political science -- Early works to 1800", "Utopias -- Early works to 1800"],
    bookshelves: ["Philosophy"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(1497),
    download_count: 17300,
  },
  {
    id: 2852,
    title: "The Hound of the Baskervilles",
    authors: [{ name: "Doyle, Arthur Conan", birth_year: 1859, death_year: 1930 }],
    translators: [],
    subjects: ["Detective and mystery stories", "Holmes, Sherlock (Fictitious character) -- Fiction"],
    bookshelves: ["Detective Fiction"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(2852),
    download_count: 16900,
  },
  {
    id: 28054,
    title: "The Brothers Karamazov",
    authors: [{ name: "Dostoyevsky, Fyodor", birth_year: 1821, death_year: 1881 }],
    translators: [],
    subjects: ["Russia -- Social life and customs -- 19th century -- Fiction", "Fathers and sons -- Fiction"],
    bookshelves: ["Best Books Ever Listings"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(28054),
    download_count: 16400,
  },
];

export function getCuratedBooksList(params?: {
  search?: string;
  topic?: string;
  sort?: string;
  page?: number;
}): GutendexList {
  const search = (params?.search ?? "").toLowerCase().trim();
  const topic = (params?.topic ?? "").toLowerCase().trim();
  const sort = params?.sort ?? "popular";
  const page = Math.max(1, Number(params?.page) || 1);
  const perPage = 18;

  let filtered = [...FALLBACK_CLASSICS];

  if (search) {
    filtered = filtered.filter(
      (b) =>
        b.title.toLowerCase().includes(search) ||
        b.authors.some((a) => a.name.toLowerCase().includes(search)) ||
        b.subjects.some((s) => s.toLowerCase().includes(search))
    );
  }

  if (topic) {
    filtered = filtered.filter(
      (b) =>
        b.subjects.some((s) => s.toLowerCase().includes(topic)) ||
        b.bookshelves.some((bs) => bs.toLowerCase().includes(topic))
    );
  }

  if (sort === "ascending") {
    filtered.sort((a, b) => a.id - b.id);
  } else if (sort === "descending") {
    filtered.sort((a, b) => b.id - a.id);
  } else {
    // popular
    filtered.sort((a, b) => b.download_count - a.download_count);
  }

  const start = (page - 1) * perPage;
  const pageResults = filtered.slice(start, start + perPage);
  const hasNext = start + perPage < filtered.length;
  const hasPrev = page > 1;

  const nextUrl = hasNext ? `/books?page=${page + 1}` : null;
  const prevUrl = hasPrev ? `/books?page=${page - 1}` : null;

  return {
    count: filtered.length,
    next: nextUrl,
    previous: prevUrl,
    results: pageResults,
    degraded: true,
  };
}

export function getFallbackBook(id: string | number): GutendexBook {
  const numId = Number(id);
  const found = FALLBACK_CLASSICS.find((b) => b.id === numId);
  if (found) return found;

  return {
    id: numId || 0,
    title: `Project Gutenberg Book #${id}`,
    authors: [{ name: "Project Gutenberg Author", birth_year: null, death_year: null }],
    translators: [],
    subjects: ["Classical Literature"],
    bookshelves: ["Project Gutenberg"],
    languages: ["en"],
    copyright: false,
    media_type: "Text",
    formats: buildFormats(numId || 0),
    download_count: 1000,
  };
}

export async function gutendex<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  timeoutMs = 5000
): Promise<T> {
  await ensureIpv4();

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

  const modernHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  };

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        next: { revalidate: 60 * 10 },
        headers: modernHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      } as any);

      if (!res.ok) {
        throw new Error(`Gutendex error ${res.status}: ${await res.text().catch(() => "")}`);
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // If direct Gutendex failed (e.g. Cloudflare on Vercel), try via voice server proxy if configured
  const voiceServer = (process.env.VOICE_SERVER_URL || process.env.NEXT_PUBLIC_VOICE_SERVER_URL || "").replace(/\/$/, "");
  if (voiceServer) {
    try {
      const proxyUrl = new URL(`${voiceServer}/gutendex${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v === undefined || v === null || v === "") continue;
          proxyUrl.searchParams.set(k, String(v));
        }
      }
      const pRes = await fetch(proxyUrl.toString(), {
        headers: modernHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (pRes.ok) {
        return (await pRes.json()) as T;
      }
    } catch {
      // ignore
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
