import { loadPrefs, savePrefs, type ReaderPrefs } from "@/lib/abl/readerPrefs";
import { loadReadingMap, saveReadingMap, type ReadingEntry } from "@/lib/readingStore";
import { openLibraryDB, type FavoriteRow, type ListItemRow, type ListRow, type NoteRow, type ReadingDayRow, type LibraryScope } from "@/lib/library/db";

export type BackupV1 = {
  version: 1;
  createdAt: number;
  readerPrefs: ReaderPrefs;
  readingStore: Record<string, ReadingEntry>;
  localProgress: {
    ablRead: Record<string, any>; // gutenlib.abl.read.{id}
    gutTxtPage: Record<string, number>; // gutenlib_reader_page_{id}
  };
  library: {
    favorites: FavoriteRow[];
    lists: ListRow[];
    listItems: ListItemRow[];
    notes: NoteRow[];
    readingDays: ReadingDayRow[];
  };
};

function lsKeys(prefix: string) {
  if (typeof window === "undefined") return [] as string[];
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;
}

function safeJsonParse(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function exportBackup(scope?: LibraryScope): Promise<BackupV1> {
  const readerPrefs = loadPrefs();
  const readingStore = loadReadingMap();

  // LocalStorage progress
  const ablRead: Record<string, any> = {};
  for (const k of lsKeys("gutenlib.abl.read.")) {
    const id = k.replace("gutenlib.abl.read.", "");
    const v = safeJsonParse(window.localStorage.getItem(k));
    if (v) ablRead[id] = v;
  }

  const gutTxtPage: Record<string, number> = {};
  for (const k of lsKeys("gutenlib_reader_page_")) {
    const id = k.replace("gutenlib_reader_page_", "");
    const n = Number(window.localStorage.getItem(k) ?? "0");
    if (Number.isFinite(n)) gutTxtPage[id] = n;
  }

  // Library DB
  const db = await openLibraryDB();
  const readAll = async <T>(store: string): Promise<T[]> => {
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);
    return await new Promise((resolve) => {
      const out: T[] = [];
      const req = os.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value as T);
        cur.continue();
      };
      req.onerror = () => resolve(out);
    });
  };

  const [favoritesAll, listsAll, listItemsAll, notesAll, readingDaysAll] = await Promise.all([
    readAll<FavoriteRow>("favorites"),
    readAll<any>("lists"),
    readAll<any>("listItems"),
    readAll<any>("notes"),
    readAll<ReadingDayRow>("readingDays"),
  ]);

  const normList = (r: any): ListRow => ({ ...r, scope: (r.scope as LibraryScope) ?? "arabic" });
  const normNote = (r: any): NoteRow => ({ ...r, scope: (r.scope as LibraryScope) ?? "arabic" });

  const lists = (listsAll as any[]).map(normList);
  const notes = (notesAll as any[]).map(normNote);
  const listItems = listItemsAll as ListItemRow[];
  const favorites = favoritesAll as FavoriteRow[];

  const scoped = scope
    ? {
        favorites: favorites.filter((r) => (scope === "arabic" ? r.bookKey.startsWith("abl:") : r.bookKey.startsWith("gutendex:"))),
        lists: lists.filter((r) => r.scope === scope),
        listItems,
        notes: notes.filter((r) => r.scope === scope),
        readingDays: readingDaysAll,
      }
    : { favorites, lists, listItems, notes, readingDays: readingDaysAll };

  return {
    version: 1,
    createdAt: Date.now(),
    readerPrefs,
    readingStore,
    localProgress: { ablRead, gutTxtPage },
    library: scoped,
  };
}

function mergeByUpdatedAt<T extends { id: string; updatedAt?: number }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of existing) map.set(r.id, r);
  for (const r of incoming) {
    const cur = map.get(r.id);
    if (!cur) {
      map.set(r.id, r);
      continue;
    }
    const a = Number(cur.updatedAt ?? 0);
    const b = Number(r.updatedAt ?? 0);
    if (b >= a) map.set(r.id, r);
  }
  return [...map.values()];
}

export async function importBackup(data: BackupV1, scope?: LibraryScope): Promise<void> {
  if (!data || data.version !== 1) throw new Error("Unsupported backup format");

  // prefs
  if (data.readerPrefs) savePrefs(data.readerPrefs);

  // reading store
  const mergedReading = { ...loadReadingMap(), ...(data.readingStore ?? {}) };
  saveReadingMap(mergedReading);

  // local progress
  if (typeof window !== "undefined") {
    const ablRead = data.localProgress?.ablRead ?? {};
    for (const [id, v] of Object.entries(ablRead)) {
      window.localStorage.setItem(`gutenlib.abl.read.${id}`, JSON.stringify(v));
    }
    const gut = data.localProgress?.gutTxtPage ?? {};
    for (const [id, n] of Object.entries(gut)) {
      window.localStorage.setItem(`gutenlib_reader_page_${id}`, String(n));
    }
  }

  // library db merge
  const db = await openLibraryDB();
  const readAll = async <T>(store: string): Promise<T[]> => {
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);
    return await new Promise((resolve) => {
      const out: T[] = [];
      const req = os.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value as T);
        cur.continue();
      };
      req.onerror = () => resolve(out);
    });
  };

  const [favExisting, listExistingRaw, itemExisting, noteExistingRaw, dayExisting] = await Promise.all([
    readAll<FavoriteRow>("favorites"),
    readAll<any>("lists"),
    readAll<ListItemRow>("listItems"),
    readAll<any>("notes"),
    readAll<ReadingDayRow>("readingDays"),
  ]);

  const normList = (r: any): ListRow => ({ ...r, scope: (r.scope as LibraryScope) ?? "arabic" });
  const normNote = (r: any): NoteRow => ({ ...r, scope: (r.scope as LibraryScope) ?? "arabic" });

  const listExisting = (listExistingRaw as any[]).map(normList);
  const noteExisting = (noteExistingRaw as any[]).map(normNote);

  const incoming = data.library;
  let favIn = incoming?.favorites ?? [];
  let listsIn = (incoming?.lists ?? []) as any[];
  let itemsIn = incoming?.listItems ?? [];
  let notesIn = (incoming?.notes ?? []) as any[];
  let daysIn = incoming?.readingDays ?? [];

  if (scope) {
    favIn = favIn.filter((r) => (scope === "arabic" ? r.bookKey.startsWith("abl:") : r.bookKey.startsWith("gutendex:")));
    listsIn = listsIn.filter((r) => (r.scope ?? "arabic") === scope);
    notesIn = notesIn.filter((r) => (r.scope ?? "arabic") === scope);
  }

  const mergedFav = mergeByUpdatedAt(favExisting, favIn);
  const mergedLists = mergeByUpdatedAt(listExisting, listsIn.map(normList));
  const mergedItems = mergeByUpdatedAt(itemExisting as any, itemsIn as any) as any as ListItemRow[];
  const mergedNotes = mergeByUpdatedAt(noteExisting as any, notesIn.map(normNote) as any) as any as NoteRow[];
  const mergedDays = mergeByUpdatedAt(dayExisting as any, daysIn as any) as any as ReadingDayRow[];

  const tx = db.transaction(["favorites", "lists", "listItems", "notes", "readingDays"], "readwrite");
  const putAll = <T extends { id: string }>(store: string, rows: T[]) => {
    const os = tx.objectStore(store);
    for (const r of rows) os.put(r, r.id);
  };

  putAll("favorites", mergedFav);
  putAll("lists", mergedLists);
  putAll("listItems", mergedItems);
  putAll("notes", mergedNotes);
  putAll("readingDays", mergedDays);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function downloadJson(filename: string, obj: any) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file: File): Promise<any> {
  const text = await file.text();
  return JSON.parse(text);
}
