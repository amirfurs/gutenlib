import { openDB, idbGet, idbPut } from "@/lib/abl/idb";
import { normalizeQuery } from "@/lib/abl/normalizeArabic";

export type SearchMode = "partial" | "word";

export type BookSearchHit = {
  pageNumber: number;
  excerpt: string;
};

export type IndexProgress = {
  bookId: string;
  done: boolean;
  indexedUpTo: number;
  pageCount: number;
  pct: number;
};

const DB_NAME = "gutenlib-reader";
const DB_VERSION = 1;

function upgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains("books")) db.createObjectStore("books");
  if (!db.objectStoreNames.contains("pages")) db.createObjectStore("pages");
  if (!db.objectStoreNames.contains("tri")) db.createObjectStore("tri");
}

type BookRow = {
  bookId: string;
  pageCount: number;
  normVersion: number;
  indexVersion: number;
  indexedUpTo: number;
  done: boolean;
  updatedAt: number;
};

const NORM_VERSION = 1;
const INDEX_VERSION = 1;

export class ABLSearchIndex {
  private bookId: string;
  private pageCount: number;
  private worker: Worker | null = null;
  private listeners = new Set<(p: IndexProgress) => void>();

  constructor(opts: { bookId: string; pageCount: number }) {
    this.bookId = opts.bookId;
    this.pageCount = opts.pageCount;
  }

  onProgress(cb: (p: IndexProgress) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(p: IndexProgress) {
    for (const cb of this.listeners) cb(p);
  }

  async ensureIndexing(): Promise<void> {
    if (!this.pageCount) return;

    const db = await openDB({ name: DB_NAME, version: DB_VERSION }, upgrade);
    const bookKey = this.bookKey();
    const existing = await idbGet<BookRow>(db, "books", bookKey);

    const needsRebuild =
      !existing ||
      existing.pageCount !== this.pageCount ||
      existing.normVersion !== NORM_VERSION ||
      existing.indexVersion !== INDEX_VERSION;

    if (needsRebuild) {
      const row: BookRow = {
        bookId: this.bookId,
        pageCount: this.pageCount,
        normVersion: NORM_VERSION,
        indexVersion: INDEX_VERSION,
        indexedUpTo: 0,
        done: false,
        updatedAt: Date.now(),
      };
      await idbPut(db, "books", row, bookKey);
    }

    // start (or resume) worker indexing
    if (this.worker) return;

    this.worker = new Worker(new URL("./search.worker.ts", import.meta.url));
    this.worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as any;
      if (msg?.type === "progress") {
        this.emit(msg.payload as IndexProgress);
      }
    };

    this.worker.postMessage({
      type: "start",
      payload: {
        bookId: this.bookId,
        pageCount: this.pageCount,
        normVersion: NORM_VERSION,
        indexVersion: INDEX_VERSION,
      },
    });
  }

  stopIndexing() {
    this.worker?.terminate();
    this.worker = null;
  }

  async search(query: string, mode: SearchMode = "partial"): Promise<BookSearchHit[]> {
    const q = normalizeQuery(query);
    if (!q) return [];

    // Use worker for search too (keeps UI smooth).
    // If worker isn't running (e.g., SSR or disabled), do a fallback scan.
    if (!this.worker) {
      return this.fallbackScan(q, mode);
    }

    const id = Math.random().toString(36).slice(2);
    return await new Promise<BookSearchHit[]>((resolve) => {
      const onMsg = (ev: MessageEvent) => {
        const msg = ev.data as any;
        if (msg?.type === "searchResult" && msg?.id === id) {
          this.worker?.removeEventListener("message", onMsg);
          resolve((msg?.payload?.hits ?? []) as BookSearchHit[]);
        }
      };
      this.worker!.addEventListener("message", onMsg);
      this.worker!.postMessage({
        type: "search",
        id,
        payload: { bookId: this.bookId, pageCount: this.pageCount, q, mode },
      });
    });
  }

  private bookKey() {
    return `abl:${this.bookId}`;
  }

  private async fallbackScan(q: string, mode: SearchMode): Promise<BookSearchHit[]> {
    const db = await openDB({ name: DB_NAME, version: DB_VERSION }, upgrade);
    const hits: BookSearchHit[] = [];

    // scan all indexed pages
    for (let pageNo = 1; pageNo <= this.pageCount; pageNo++) {
      const row = await idbGet<{ normText: string }>(db, "pages", this.pageKey(pageNo));
      if (!row?.normText) continue;
      if (!matches(row.normText, q, mode)) continue;
      hits.push({ pageNumber: pageNo, excerpt: makeExcerpt(row.normText, q) });
      if (hits.length >= 200) break;
    }

    return hits;
  }

  private pageKey(pageNo: number) {
    return `abl:${this.bookId}|${pageNo}`;
  }
}

function matches(text: string, q: string, mode: SearchMode): boolean {
  if (mode === "partial") return text.includes(q);
  // word mode: crude token boundaries (works decently for Arabic)
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.includes(q);
}

function makeExcerpt(text: string, q: string): string {
  const i = text.indexOf(q);
  if (i < 0) return text.slice(0, 120);
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + q.length + 60);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}
