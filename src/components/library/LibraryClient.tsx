"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { List, Star, StickyNote, TrendingUp, Plus, Trash2 } from "lucide-react";
import { BackupButtons } from "@/components/library/BackupButtons";
import { fetchAblMeta, fetchGutendexMeta } from "@/components/library/metaFetch";
import {
  createList,
  deleteList,
  getAllLists,
  getFavorites,
  removeFromList,
  addToList,
  getListItems,
  getAllNotes,
  type ListRow,
  type NoteRow,
  type LibraryScope,
} from "@/lib/library/db";

type Tab = "favorites" | "lists" | "notes" | "stats";

function parseAblKey(bookKey: string): string | null {
  if (!bookKey) return null;
  if (bookKey.startsWith("abl:")) return bookKey.slice(4);
  return null;
}

function parseGutendexKey(bookKey: string): string | null {
  if (!bookKey) return null;
  if (bookKey.startsWith("gutendex:")) return bookKey.slice(9);
  return null;
}

export function LibraryClient({ scope }: { scope: LibraryScope }) {
  const [tab, setTab] = useState<Tab>("favorites");

  const [favorites, setFavorites] = useState<string[]>([]);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listItems, setListItems] = useState<string[]>([]);

  const [newListName, setNewListName] = useState("");
  const [busy, setBusy] = useState(false);

  const [notes, setNotes] = useState<NoteRow[]>([]);

  const openLabel = scope === "arabic" ? "افتح" : "Open";

  const [metaMap, setMetaMap] = useState<Record<string, { title: string; author: string; cover: string | null }>>({});
  const metaAbortRef = useRef<AbortController | null>(null);

  async function refresh() {
    const [fav, ls, ns] = await Promise.all([getFavorites(), getAllLists(scope), getAllNotes(scope)]);

    const scopedFav = fav
      .map((x) => x.bookKey)
      .filter((k) => (scope === "arabic" ? k.startsWith("abl:") : k.startsWith("gutendex:")));

    setFavorites(scopedFav);
    setLists(ls);
    setNotes(ns);
    if (!selectedListId && ls[0]?.id) setSelectedListId(ls[0].id);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedListId) {
      setListItems([]);
      return;
    }
    (async () => {
      const items = await getListItems(selectedListId);
      setListItems(items.map((x) => x.bookKey));
    })();
  }, [selectedListId]);

  // fetch book titles/authors/covers for anything we display (scope-specific)
  useEffect(() => {
    const keys = new Set<string>();
    for (const k of favorites) keys.add(k);
    for (const k of listItems) keys.add(k);
    for (const n of notes) keys.add(n.bookKey);

    const missing = Array.from(keys).filter((k) => {
      if (metaMap[k]) return false;
      return scope === "arabic" ? !!parseAblKey(k) : !!parseGutendexKey(k);
    });
    if (!missing.length) return;

    metaAbortRef.current?.abort();
    const ac = new AbortController();
    metaAbortRef.current = ac;

    (async () => {
      const updates: Record<string, { title: string; author: string; cover: string | null }> = {};

      // small concurrency (mobile-friendly)
      const queue = [...missing];
      const workers = Array.from({ length: 4 }, () =>
        (async () => {
          while (queue.length && !ac.signal.aborted) {
            const bookKey = queue.shift()!;
            try {
              if (scope === "arabic") {
                const id = parseAblKey(bookKey);
                if (!id) continue;
                updates[bookKey] = await fetchAblMeta(id, ac.signal);
              } else {
                const id = parseGutendexKey(bookKey);
                if (!id) continue;
                updates[bookKey] = await fetchGutendexMeta(id, ac.signal);
              }
            } catch {
              // ignore
              const fallbackId = scope === "arabic" ? parseAblKey(bookKey) : parseGutendexKey(bookKey);
              updates[bookKey] = { title: fallbackId ? `#${fallbackId}` : bookKey, author: "", cover: null };
            }
          }
        })()
      );

      await Promise.all(workers);
      if (ac.signal.aborted) return;

      setMetaMap((prev) => ({ ...prev, ...updates }));
    })();

    return () => {
      ac.abort();
    };
  }, [favorites, listItems, notes, metaMap, scope]);

  const tabs = useMemo(() => {
    const isAr = scope === "arabic";
    return [
      { id: "favorites" as const, label: isAr ? "المفضلة" : "Favorites", icon: Star },
      { id: "lists" as const, label: isAr ? "القوائم" : "Lists", icon: List },
      { id: "notes" as const, label: isAr ? "الملاحظات" : "Notes", icon: StickyNote },
      { id: "stats" as const, label: isAr ? "الإحصائيات" : "Stats", icon: TrendingUp },
    ];
  }, [scope]);

  return (
    <main className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8" dir={scope === "arabic" ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">{scope === "arabic" ? "مكتبتي (العربي)" : "My Library"}</h1>
          <div className="mt-1 text-sm text-zinc-400">Local for now — sync-ready later</div>
        </div>
        <div className="flex items-center gap-2">
          <BackupButtons scope={scope} />
          <Link href={scope === "arabic" ? "/ar" : "/"} className="text-sm text-zinc-300 hover:text-white">
            ← {scope === "arabic" ? "الرئيسية" : "Home"}
          </Link>
        </div>
      </div>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              className={
                "shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ring-1 transition " +
                (active ? "bg-brand-500 text-white ring-brand-500/40" : "bg-white/5 text-zinc-200 ring-white/10 hover:bg-white/10")
              }
              onClick={() => setTab(t.id)}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Favorites */}
      {tab === "favorites" ? (
        <section className="mt-6 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-white">{scope === "arabic" ? "⭐ المفضلة" : "⭐ Favorites"}</div>
          <div className="mt-3 grid gap-2">
            {!favorites.length ? (
              <div className="text-sm text-zinc-400">{scope === "arabic" ? "لا توجد كتب مفضلة بعد." : "No favorites yet."}</div>
            ) : null}
            {favorites.map((bk) => {
              const ablId = parseAblKey(bk);
              const href =
                scope === "arabic"
                  ? (ablId ? `/ar/book/${ablId}` : "#")
                  : (() => {
                      const gid = parseGutendexKey(bk);
                      return gid ? `/book/${gid}` : "#";
                    })();

              const readHref =
                scope === "arabic"
                  ? (ablId ? `/ar/read/${ablId}` : "#")
                  : (() => {
                      const gid = parseGutendexKey(bk);
                      return gid ? `/read/${gid}` : "#";
                    })();
              const m = metaMap[bk];
              return (
                <div key={bk} className="flex items-center justify-between gap-3 rounded-lg bg-black/20 p-3 ring-1 ring-white/10">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-white/5 ring-1 ring-white/10">
                      {m?.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.cover} alt={m.title} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-sm font-semibold text-zinc-100">{m?.title ?? (ablId ? `ABL #${ablId}` : bk)}</div>
                      <div className="line-clamp-1 text-xs text-zinc-400">{m?.author ?? ""}</div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {href !== "#" ? (
                      <Link className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15" href={href}>
                        {scope === "arabic" ? "تفاصيل" : "Details"}
                      </Link>
                    ) : null}
                    {readHref !== "#" ? (
                      <Link className="rounded-md bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600" href={readHref}>
                        {scope === "arabic" ? "اقرأ" : "Read"}
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Lists */}
      {tab === "lists" ? (
        <section className="mt-6 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">{scope === "arabic" ? "📚 القوائم" : "📚 Lists"}</div>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <div className="text-xs text-zinc-400">{scope === "arabic" ? "قائمة جديدة" : "New list"}</div>
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder={scope === "arabic" ? "مثال: أقرأ لاحقًا" : "e.g. Read later"}
                  className="mt-1 h-9 w-[min(240px,70vw)] rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
                />
              </div>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                disabled={busy || !newListName.trim()}
                onClick={async () => {
                  try {
                    setBusy(true);
                    await createList(newListName.trim(), scope);
                    setNewListName("");
                    await refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                {scope === "arabic" ? "إنشاء" : "Create"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr]">
            <div className="rounded-lg bg-black/20 p-3 ring-1 ring-white/10">
              <div className="text-xs font-semibold text-zinc-400">{scope === "arabic" ? "قوائمي" : "My lists"}</div>
              <div className="mt-2 grid gap-1">
                {!lists.length ? <div className="text-sm text-zinc-400">{scope === "arabic" ? "لا توجد قوائم." : "No lists yet."}</div> : null}
                {lists.map((l) => (
                  <button
                    key={l.id}
                    className={
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-right text-sm ring-1 transition " +
                      (selectedListId === l.id ? "bg-white/10 text-white ring-white/15" : "bg-white/5 text-zinc-200 ring-white/10 hover:bg-white/10")
                    }
                    onClick={() => setSelectedListId(l.id)}
                  >
                    <span className="line-clamp-1">{l.name}</span>
                    <button
                      className="rounded-md bg-white/10 p-2 text-white hover:bg-white/15"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteList(l.id);
                        await refresh();
                        setSelectedListId((prev) => (prev === l.id ? null : prev));
                      }}
                      aria-label="حذف القائمة"
                      title="حذف القائمة"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-black/20 p-3 ring-1 ring-white/10">
              <div className="text-xs font-semibold text-zinc-400">{scope === "arabic" ? "عناصر القائمة" : "List items"}</div>
              <div className="mt-2 text-sm text-zinc-400">
                {scope === "arabic"
                  ? "إضافة الكتب للقوائم تتم من صفحة الكتاب (زر: إضافة إلى قائمة)."
                  : "Add books to lists from the book page (button: Add to list)."}
              </div>

              <div className="mt-3 grid gap-2">
                {listItems.map((bk) => {
                  const ablId = parseAblKey(bk);
                  const m = metaMap[bk];
                  return (
                    <div key={bk} className="flex items-center justify-between gap-3 rounded-md bg-white/5 px-3 py-2 ring-1 ring-white/10">
                      <div className="min-w-0">
                        <div className="line-clamp-1 text-sm font-semibold text-zinc-100">{m?.title ?? (ablId ? `ABL #${ablId}` : bk)}</div>
                        <div className="line-clamp-1 text-xs text-zinc-400">{m?.author ?? ""}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {ablId ? (
                          <Link className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15" href={`/ar/book/${ablId}`}>
                            تفاصيل
                          </Link>
                        ) : null}
                        {selectedListId ? (
                          <button
                            className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                            onClick={async () => {
                              await removeFromList(selectedListId, bk);
                              const items = await getListItems(selectedListId);
                              setListItems(items.map((x) => x.bookKey));
                            }}
                          >
                            إزالة
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* temporary quick add from favorites */}
              {selectedListId && favorites.length ? (
                <div className="mt-4 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                  <div className="text-xs text-zinc-400">إضافة سريعة من المفضلة (مؤقت)</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {favorites.slice(0, 10).map((bk) => (
                      <button
                        key={bk}
                        className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                        onClick={async () => {
                          await addToList(selectedListId, bk);
                          const items = await getListItems(selectedListId);
                          setListItems(items.map((x) => x.bookKey));
                        }}
                      >
                        إضافة
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "notes" ? (
        <section className="mt-6 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-white">{scope === "arabic" ? "📝 الملاحظات" : "📝 Notes"}</div>

          <div className="mt-3 grid gap-2">
            {!notes.length ? (
              <div className="text-sm text-zinc-400">{scope === "arabic" ? "لا توجد ملاحظات بعد." : "No notes yet."}</div>
            ) : null}
            {notes.map((n) => {
              const ablId = parseAblKey(n.bookKey);
              const href =
                scope === "arabic"
                  ? (ablId ? `/ar/read/${ablId}?page=${n.pageNumber}` : "#")
                  : (() => {
                      const gid = parseGutendexKey(n.bookKey);
                      if (!gid) return "#";
                      // if note has a CFI location, open the reader at that location
                      // @ts-ignore
                      const cfi = (n as any)?.loc as string | undefined;
                      return cfi ? `/read/${gid}?cfi=${encodeURIComponent(cfi)}` : `/read/${gid}`;
                    })();
              const m = metaMap[n.bookKey];
              return (
                <div key={n.id} className="rounded-lg bg-black/20 p-3 ring-1 ring-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-sm font-semibold text-white">{m?.title ?? (ablId ? `ABL #${ablId}` : n.bookKey)}</div>
                      <div className="text-xs text-zinc-400">
                        {scope === "arabic" ? "صفحة" : "Page"} {n.pageNumber}
                        {m?.author ? ` — ${m.author}` : ""}
                      </div>
                    </div>
                    {href !== "#" ? (
                      <Link className="rounded-md bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600" href={href}>
                        {scope === "arabic" ? "افتح" : "Open"}
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{n.text}</div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "stats" ? (
        <section className="mt-6 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="text-sm font-semibold text-white">{scope === "arabic" ? "📈 الإحصائيات" : "📈 Stats"}</div>
          <div className="mt-2 text-sm text-zinc-400">
            {scope === "arabic" ? "سأضيف: صفحات هذا الأسبوع + streak بعد تسجيل القراءة من القارئ." : "Coming soon: pages this week + streak."}
          </div>
        </section>
      ) : null}
    </main>
  );
}
