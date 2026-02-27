export type ReadingEntry = {
  id: string;
  title?: string;
  author?: string;
  cover?: string | null;
  cfi?: string;
  progress?: number; // 0..1
  updatedAt: number;
  finished?: boolean;
  finishedAt?: number;
};

const KEY = "gutenlib.reading.v1";

function safeParse(json: string | null): Record<string, ReadingEntry> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    if (obj && typeof obj === "object") return obj;
  } catch {
    // ignore
  }
  return {};
}

export function loadReadingMap(): Record<string, ReadingEntry> {
  if (typeof window === "undefined") return {};
  return safeParse(window.localStorage.getItem(KEY));
}

export function saveReadingMap(map: Record<string, ReadingEntry>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
}

export function getEntry(id: string): ReadingEntry | null {
  const map = loadReadingMap();
  return map[id] ?? null;
}

export function upsertEntry(id: string, patch: Partial<ReadingEntry>) {
  const map = loadReadingMap();
  const cur = map[id] ?? ({ id, updatedAt: Date.now() } as ReadingEntry);
  const next: ReadingEntry = { ...cur, ...patch, id, updatedAt: Date.now() };
  map[id] = next;
  saveReadingMap(map);
  return next;
}

export function markFinished(id: string, finished = true) {
  const map = loadReadingMap();
  const cur = map[id] ?? ({ id, updatedAt: Date.now() } as ReadingEntry);
  map[id] = {
    ...cur,
    finished,
    updatedAt: Date.now(),
    finishedAt: finished ? Date.now() : undefined,
  };
  saveReadingMap(map);
}

export function listEntries() {
  const map = loadReadingMap();
  return Object.values(map).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
