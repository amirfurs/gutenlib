/* eslint-disable no-restricted-globals */

import { openDB, idbGet, idbPut } from "@/lib/abl/idb";
import { normalizeArabic, normalizeQuery } from "@/lib/abl/normalizeArabic";

type StartMsg = {
  type: "start";
  payload: { bookId: string; pageCount: number; normVersion: number; indexVersion: number };
};

type SearchMsg = {
  type: "search";
  id: string;
  payload: { bookId: string; pageCount: number; q: string; mode: "partial" | "word" };
};

type Msg = StartMsg | SearchMsg;

const DB_NAME = "gutenlib-reader";
const DB_VERSION = 1;

function upgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains("books")) db.createObjectStore("books");
  if (!db.objectStoreNames.contains("pages")) db.createObjectStore("pages");
  if (!db.objectStoreNames.contains("tri")) db.createObjectStore("tri");
}

let current: { bookId: string; pageCount: number } | null = null;
let indexing = false;

self.onmessage = async (ev: MessageEvent<Msg>) => {
  const msg = ev.data;
  if (msg.type === "start") {
    current = { bookId: msg.payload.bookId, pageCount: msg.payload.pageCount };
    if (!indexing) {
      indexing = true;
      void indexBook(msg.payload.bookId, msg.payload.pageCount);
    }
    return;
  }

  if (msg.type === "search") {
    const { bookId, pageCount, q, mode } = msg.payload;
    const hits = await searchBook(bookId, pageCount, q, mode);
    self.postMessage({ type: "searchResult", id: msg.id, payload: { hits } });
    return;
  }
};

function bookKey(bookId: string) {
  return `abl:${bookId}`;
}

function pageKey(bookId: string, pageNo: number) {
  return `abl:${bookId}|${pageNo}`;
}

function triKey(bookId: string, tri: string) {
  return `abl:${bookId}|${tri}`;
}

function trigramsFromText(normText: string): string[] {
  const s = normText.replace(/\s+/g, "");
  if (s.length < 3) return [];
  const set = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
  return [...set];
}

async function indexBook(bookId: string, pageCount: number) {
  const db = await openDB({ name: DB_NAME, version: DB_VERSION }, upgrade);

  // read book row to resume
  const row = await idbGet<any>(db, "books", bookKey(bookId));
  let startFrom = Math.max(1, Number(row?.indexedUpTo ?? 0) + 1);

  // allow a full rebuild when missing row
  if (!row) {
    await idbPut(db, "books", {
      bookId,
      pageCount,
      normVersion: 1,
      indexVersion: 1,
      indexedUpTo: 0,
      done: false,
      updatedAt: Date.now(),
    }, bookKey(bookId));
    startFrom = 1;
  }

  const buffer = new Map<string, number[]>();
  const FLUSH_KEYS = 1200;

  const emitProgress = (indexedUpTo: number, done: boolean) => {
    const pct = Math.round((indexedUpTo / Math.max(1, pageCount)) * 100);
    self.postMessage({
      type: "progress",
      payload: { bookId, done, indexedUpTo, pageCount, pct },
    });
  };

  for (let pageNo = startFrom; pageNo <= pageCount; pageNo++) {
    // Fetch HTML
    const qs = new URLSearchParams({ lang: "ar", page: String(pageNo) });
    const url = `/api/abl/book/${bookId}/html?${qs.toString()}`;

    try {
      const r = await fetch(url);
      const j = await r.json();
      const html = String(j?.data ?? "");

      // Extract text as the user sees it.
      const text = htmlToText(html);
      const normText = normalizeArabic(text);

      await idbPut(db, "pages", { normText, updatedAt: Date.now() }, pageKey(bookId, pageNo));

      // Build trigram postings (buffered)
      const tris = trigramsFromText(normText);
      for (const tri of tris) {
        const arr = buffer.get(tri);
        if (arr) arr.push(pageNo);
        else buffer.set(tri, [pageNo]);
      }

      if (buffer.size >= FLUSH_KEYS) {
        await flushTriBuffer(db, bookId, buffer);
        buffer.clear();
      }

      // update resume marker
      await idbPut(db, "books", { ...row, bookId, pageCount, indexedUpTo: pageNo, done: false, updatedAt: Date.now() }, bookKey(bookId));
      emitProgress(pageNo, false);

      // yield to keep the system responsive
      await sleep(60);
    } catch {
      // transient page failure: skip and keep going
      await sleep(120);
    }
  }

  if (buffer.size) {
    await flushTriBuffer(db, bookId, buffer);
    buffer.clear();
  }

  const finalRow = await idbGet<any>(db, "books", bookKey(bookId));
  await idbPut(db, "books", { ...finalRow, bookId, pageCount, indexedUpTo: pageCount, done: true, updatedAt: Date.now() }, bookKey(bookId));
  emitProgress(pageCount, true);
}

async function flushTriBuffer(db: IDBDatabase, bookId: string, buf: Map<string, number[]>) {
  // One-by-one merge (simple + safe). This can be optimized later.
  for (const [tri, newPages] of buf.entries()) {
    const key = triKey(bookId, tri);
    const existing = await idbGet<number[]>(db, "tri", key);
    if (!existing?.length) {
      // de-dup newPages
      const uniq = Array.from(new Set(newPages)).sort((a, b) => a - b);
      await idbPut(db, "tri", uniq, key);
      continue;
    }

    const set = new Set<number>(existing);
    for (const p of newPages) set.add(p);
    const merged = Array.from(set).sort((a, b) => a - b);
    await idbPut(db, "tri", merged, key);
  }
}

async function searchBook(bookId: string, pageCount: number, qNormRaw: string, mode: "partial" | "word") {
  const q = normalizeQuery(qNormRaw);
  if (!q) return [];

  const db = await openDB({ name: DB_NAME, version: DB_VERSION }, upgrade);

  let candidates: number[] | null = null;

  // trigram narrowing for partial queries
  if (mode === "partial") {
    const s = q.replace(/\s+/g, "");
    if (s.length >= 3) {
      const tris = trigramsFromText(s);
      if (tris.length) {
        for (const tri of tris.slice(0, 6)) {
          const pages = (await idbGet<number[]>(db, "tri", triKey(bookId, tri))) ?? [];
          candidates = candidates ? intersectSorted(candidates, pages) : pages;
          if (candidates.length === 0) break;
          // keep candidates bounded
          if (candidates.length > 2000) candidates = candidates.slice(0, 2000);
        }
      }
    }
  }

  const hits: Array<{ pageNumber: number; excerpt: string }> = [];
  const scan = candidates ?? range(1, pageCount);

  for (const pageNo of scan) {
    const row = await idbGet<{ normText: string }>(db, "pages", pageKey(bookId, pageNo));
    const t = row?.normText ?? "";
    if (!t) continue;

    if (!matches(t, q, mode)) continue;
    hits.push({ pageNumber: pageNo, excerpt: makeExcerpt(t, q) });
    if (hits.length >= 200) break;
  }

  return hits;
}

function matches(text: string, q: string, mode: "partial" | "word"): boolean {
  if (mode === "partial") return text.includes(q);
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.includes(q);
}

function makeExcerpt(text: string, q: string): string {
  const i = text.indexOf(q);
  if (i < 0) return text.slice(0, 140);
  const start = Math.max(0, i - 45);
  const end = Math.min(text.length, i + q.length + 70);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function htmlToText(html: string): string {
  // Worker-safe HTML -> text.
  // DOMParser exists in workers on modern browsers; fallback to stripping tags.
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body?.innerText ?? doc.body?.textContent ?? "";
  } catch {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function intersectSorted(a: number[], b: number[]): number[] {
  // assumes a and b are sorted
  const out: number[] = [];
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i]!, y = b[j]!;
    if (x === y) {
      out.push(x);
      i++;
      j++;
    } else if (x < y) i++;
    else j++;
  }
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
