"use client";

import { useEffect, useMemo, useState } from "react";
import { ListPlus, Plus } from "lucide-react";
import { addToList, createList, getAllLists, type ListRow, type LibraryScope } from "@/lib/library/db";

export function AddToListButton({ bookKey, className }: { bookKey: string; className?: string }) {
  const scope: LibraryScope = bookKey.startsWith("abl:") ? "arabic" : "english";
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  async function refresh() {
    const ls = await getAllLists(scope);
    setLists(ls);
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open]);

  const canCreate = useMemo(() => newName.trim().length >= 2, [newName]);

  return (
    <>
      <button
        type="button"
        className={
          "inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/10 " +
          (className ? className : "")
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAdded(null);
          setOpen(true);
        }}
        aria-label={scope === "arabic" ? "إضافة إلى قائمة" : "Add to list"}
        title={scope === "arabic" ? "إضافة إلى قائمة" : "Add to list"}
      >
        <ListPlus className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="mx-auto mt-[14vh] max-w-md rounded-xl bg-black p-4 ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">{scope === "arabic" ? "إضافة إلى قائمة" : "Add to list"}</div>
              <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15" onClick={() => setOpen(false)}>
                {scope === "arabic" ? "إغلاق" : "Close"}
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs text-zinc-400">{scope === "arabic" ? "اختر قائمة" : "Choose a list"}</div>
              <div className="mt-2 grid gap-2">
                {!lists.length ? <div className="text-sm text-zinc-400">{scope === "arabic" ? "لا توجد قوائم بعد." : "No lists yet."}</div> : null}
                {lists.map((l) => (
                  <button
                    key={l.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-3 text-right text-sm text-zinc-100 ring-1 ring-white/10 hover:bg-white/10"
                    onClick={async () => {
                      try {
                        setBusy(true);
                        await addToList(l.id, bookKey);
                        setAdded(l.name);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                  >
                    <span className="line-clamp-1">{l.name}</span>
                    <span className="text-xs text-zinc-400">{scope === "arabic" ? "إضافة" : "Add"}</span>
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                <div className="text-xs text-zinc-400">{scope === "arabic" ? "قائمة جديدة" : "New list"}</div>
                <div className="mt-2 flex items-end gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={scope === "arabic" ? "مثال: أقرأ لاحقًا" : "e.g. Read later"}
                    className="h-10 flex-1 rounded-md bg-black/40 px-3 text-sm text-white ring-1 ring-white/10"
                  />
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-500 px-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                    disabled={busy || !canCreate}
                    onClick={async () => {
                      try {
                        setBusy(true);
                        const row = await createList(newName.trim(), scope);
                        setNewName("");
                        await refresh();
                        await addToList(row.id, bookKey);
                        setAdded(row.name);
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

              {added ? (
                <div className="mt-3 text-sm text-emerald-300">
                  {scope === "arabic" ? "تمت الإضافة إلى:" : "Added to:"} {added}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
