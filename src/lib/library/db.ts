import { openDB } from "@/lib/abl/idb";

// Local-first, sync-ready schema.
// Later, a signed-in account can sync these rows by (userId, id) using updatedAt + deletedAt + dirty flags.

export const LIB_DB_NAME = "gutenlib-library";
export const LIB_DB_VERSION = 3;

export type LibraryScope = "arabic" | "english";

export type SyncMeta = {
  id: string; // e.g. "device"
  deviceId: string;
  createdAt: number;
};

export type FavoriteRow = {
  id: string; // `${bookKey}` (stable)
  bookKey: string; // e.g. "abl:4489"
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // tombstone for sync
  dirty?: boolean;
};

export type ListRow = {
  id: string; // uuid
  scope: LibraryScope;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  dirty?: boolean;
};

export type ListItemRow = {
  id: string; // `${listId}|${bookKey}`
  listId: string;
  bookKey: string; // e.g. "abl:4489"
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  dirty?: boolean;
};

export type NoteRow = {
  id: string; // uuid
  scope: LibraryScope;
  bookKey: string; // e.g. "abl:4489" | "gutendex:123"
  pageNumber: number; // used for ABL; for EPUB can be a derived value (e.g., percent*1000) or 0
  loc?: string; // location pointer (EPUB CFI)
  text: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  dirty?: boolean;
};

export type ReadingDayRow = {
  id: string; // YYYY-MM-DD
  day: string;
  pages: number; // pages read that day (approx)
  updatedAt: number;
  dirty?: boolean;
};

function upgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
  if (!db.objectStoreNames.contains("favorites")) db.createObjectStore("favorites");
  if (!db.objectStoreNames.contains("lists")) db.createObjectStore("lists");
  if (!db.objectStoreNames.contains("listItems")) db.createObjectStore("listItems");
  if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes");
  if (!db.objectStoreNames.contains("readingDays")) db.createObjectStore("readingDays");
}

export async function openLibraryDB() {
  return openDB({ name: LIB_DB_NAME, version: LIB_DB_VERSION }, upgrade);
}

export async function getDeviceId(): Promise<string> {
  const db = await openLibraryDB();
  const tx = db.transaction("meta", "readwrite");
  const os = tx.objectStore("meta");

  const existing: SyncMeta | undefined = await new Promise((resolve) => {
    const r = os.get("device");
    r.onsuccess = () => resolve(r.result as SyncMeta | undefined);
    r.onerror = () => resolve(undefined);
  });

  if (existing?.deviceId) return existing.deviceId;

  const deviceId = crypto.randomUUID();
  const row: SyncMeta = { id: "device", deviceId, createdAt: Date.now() };
  os.put(row, "device");

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });

  return deviceId;
}

// -------- Helpers --------

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openLibraryDB();
  const tx = db.transaction(storeName, "readonly");
  const os = tx.objectStore(storeName);

  return await new Promise((resolve) => {
    const out: T[] = [];
    const r = os.openCursor();
    r.onsuccess = () => {
      const cur = r.result;
      if (!cur) return resolve(out);
      out.push(cur.value as T);
      cur.continue();
    };
    r.onerror = () => resolve(out);
  });
}

// -------- Favorites --------

export async function isFavorite(bookKey: string): Promise<boolean> {
  const db = await openLibraryDB();
  const tx = db.transaction("favorites", "readonly");
  const r = tx.objectStore("favorites").get(bookKey);
  const row: FavoriteRow | undefined = await new Promise((resolve) => {
    r.onsuccess = () => resolve(r.result as FavoriteRow | undefined);
    r.onerror = () => resolve(undefined);
  });
  return !!row && !row.deletedAt;
}

export async function setFavorite(bookKey: string, fav: boolean): Promise<boolean> {
  const db = await openLibraryDB();
  const now = Date.now();

  const tx = db.transaction("favorites", "readwrite");
  const os = tx.objectStore("favorites");

  const existing: FavoriteRow | undefined = await new Promise((resolve) => {
    const r = os.get(bookKey);
    r.onsuccess = () => resolve(r.result as FavoriteRow | undefined);
    r.onerror = () => resolve(undefined);
  });

  const next: FavoriteRow = existing
    ? {
        ...existing,
        updatedAt: now,
        deletedAt: fav ? undefined : now,
        dirty: true,
      }
    : {
        id: bookKey,
        bookKey,
        createdAt: now,
        updatedAt: now,
        deletedAt: fav ? undefined : now,
        dirty: true,
      };

  os.put(next, bookKey);

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });

  return fav;
}

export async function getFavorites(): Promise<FavoriteRow[]> {
  const rows = await getAllFromStore<FavoriteRow>("favorites");
  const alive = rows.filter((r) => r && !r.deletedAt);
  alive.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return alive;
}

// -------- Lists --------

export async function getAllLists(scope?: LibraryScope): Promise<ListRow[]> {
  const rows = await getAllFromStore<any>("lists");
  const alive = rows
    .filter((r) => r && !r.deletedAt)
    .map((r) => ({ ...r, scope: (r.scope as LibraryScope) ?? "arabic" })) as ListRow[];
  const scoped = scope ? alive.filter((r) => r.scope === scope) : alive;
  scoped.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return scoped;
}

export async function createList(name: string, scope: LibraryScope): Promise<ListRow> {
  const db = await openLibraryDB();
  const now = Date.now();
  const row: ListRow = {
    id: crypto.randomUUID(),
    scope,
    name,
    createdAt: now,
    updatedAt: now,
    dirty: true,
  };

  const tx = db.transaction("lists", "readwrite");
  tx.objectStore("lists").put(row, row.id);

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });

  return row;
}

export async function deleteList(listId: string): Promise<void> {
  const db = await openLibraryDB();
  const now = Date.now();

  const tx = db.transaction(["lists", "listItems"], "readwrite");
  const lists = tx.objectStore("lists");
  const items = tx.objectStore("listItems");

  const existing: ListRow | undefined = await new Promise((resolve) => {
    const r = lists.get(listId);
    r.onsuccess = () => resolve(r.result as ListRow | undefined);
    r.onerror = () => resolve(undefined);
  });

  if (existing) {
    lists.put({ ...existing, deletedAt: now, updatedAt: now, dirty: true }, listId);
  }

  // tombstone all list items
  const allItems: ListItemRow[] = await new Promise((resolve) => {
    const out: ListItemRow[] = [];
    const r = items.openCursor();
    r.onsuccess = () => {
      const cur = r.result;
      if (!cur) return resolve(out);
      const v = cur.value as ListItemRow;
      if (v?.listId === listId && !v.deletedAt) out.push(v);
      cur.continue();
    };
    r.onerror = () => resolve(out);
  });

  for (const it of allItems) {
    items.put({ ...it, deletedAt: now, updatedAt: now, dirty: true }, it.id);
  }

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function addToList(listId: string, bookKey: string): Promise<void> {
  const db = await openLibraryDB();
  const now = Date.now();
  const id = `${listId}|${bookKey}`;

  const tx = db.transaction("listItems", "readwrite");
  const os = tx.objectStore("listItems");

  const existing: ListItemRow | undefined = await new Promise((resolve) => {
    const r = os.get(id);
    r.onsuccess = () => resolve(r.result as ListItemRow | undefined);
    r.onerror = () => resolve(undefined);
  });

  const next: ListItemRow = existing
    ? { ...existing, deletedAt: undefined, updatedAt: now, dirty: true }
    : { id, listId, bookKey, createdAt: now, updatedAt: now, dirty: true };

  os.put(next, id);

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function removeFromList(listId: string, bookKey: string): Promise<void> {
  const db = await openLibraryDB();
  const now = Date.now();
  const id = `${listId}|${bookKey}`;

  const tx = db.transaction("listItems", "readwrite");
  const os = tx.objectStore("listItems");

  const existing: ListItemRow | undefined = await new Promise((resolve) => {
    const r = os.get(id);
    r.onsuccess = () => resolve(r.result as ListItemRow | undefined);
    r.onerror = () => resolve(undefined);
  });

  if (!existing) return;

  os.put({ ...existing, deletedAt: now, updatedAt: now, dirty: true }, id);

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function getListItems(listId: string): Promise<ListItemRow[]> {
  const rows = await getAllFromStore<ListItemRow>("listItems");
  const alive = rows.filter((r) => r && r.listId === listId && !r.deletedAt);
  alive.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return alive;
}

// -------- Notes --------

export async function addNote(
  scope: LibraryScope,
  bookKey: string,
  pageNumber: number,
  text: string,
  loc?: string
): Promise<NoteRow> {
  const db = await openLibraryDB();
  const now = Date.now();
  const row: NoteRow = {
    id: crypto.randomUUID(),
    scope,
    bookKey,
    pageNumber,
    loc,
    text,
    createdAt: now,
    updatedAt: now,
    dirty: true,
  };

  const tx = db.transaction("notes", "readwrite");
  tx.objectStore("notes").put(row, row.id);

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });

  return row;
}

export async function updateNote(noteId: string, patch: { text: string }): Promise<void> {
  const db = await openLibraryDB();
  const now = Date.now();

  const tx = db.transaction("notes", "readwrite");
  const os = tx.objectStore("notes");

  const existing: NoteRow | undefined = await new Promise((resolve) => {
    const r = os.get(noteId);
    r.onsuccess = () => resolve(r.result as NoteRow | undefined);
    r.onerror = () => resolve(undefined);
  });

  if (!existing) return;
  os.put({ ...existing, text: patch.text, updatedAt: now, dirty: true }, noteId);

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  const db = await openLibraryDB();
  const now = Date.now();

  const tx = db.transaction("notes", "readwrite");
  const os = tx.objectStore("notes");

  const existing: NoteRow | undefined = await new Promise((resolve) => {
    const r = os.get(noteId);
    r.onsuccess = () => resolve(r.result as NoteRow | undefined);
    r.onerror = () => resolve(undefined);
  });

  if (!existing) return;
  os.put({ ...existing, deletedAt: now, updatedAt: now, dirty: true }, noteId);

  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function getNotesForBook(bookKey: string): Promise<NoteRow[]> {
  const rows = await getAllFromStore<NoteRow>("notes");
  const alive = rows.filter((r) => r && r.bookKey === bookKey && !r.deletedAt);
  alive.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return alive;
}

export async function getNotesForBookPage(bookKey: string, pageNumber: number): Promise<NoteRow[]> {
  const rows = await getAllFromStore<NoteRow>("notes");
  const alive = rows.filter((r) => r && r.bookKey === bookKey && r.pageNumber === pageNumber && !r.deletedAt);
  alive.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return alive;
}

export async function getAllNotes(scope?: LibraryScope): Promise<NoteRow[]> {
  const rows = await getAllFromStore<any>("notes");
  const alive = rows
    .filter((r) => r && !r.deletedAt)
    .map((r) => ({ ...r, scope: (r.scope as LibraryScope) ?? "arabic" })) as NoteRow[];
  const scoped = scope ? alive.filter((r) => r.scope === scope) : alive;
  scoped.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return scoped;
}

