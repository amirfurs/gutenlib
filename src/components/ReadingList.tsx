"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listEntries, type ReadingEntry, markFinished } from "@/lib/readingStore";

function pct(p?: number) {
  if (p == null || !Number.isFinite(p)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

export function ReadingList({ mode }: { mode: "reading" | "finished" }) {
  const [items, setItems] = useState<ReadingEntry[]>([]);

  useEffect(() => {
    const refresh = () => {
      const all = listEntries();
      setItems(all);
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const filtered = useMemo(() => {
    const isFinished = mode === "finished";
    return items.filter((x) => !String(x.id).startsWith("abl:")).filter((x) => !!x.finished === isFinished);
  }, [items, mode]);

  if (!filtered.length) {
    return (
      <div className="mt-8 glass-card rounded-2xl p-8 text-center" data-testid="reading-list-empty">
        <div className="text-sm text-zinc-500">Nothing here yet. Start reading to see your progress.</div>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-3 stagger-children" data-testid="reading-list">
      {filtered.map((b) => (
        <div key={b.id} className="glass-card flex items-center justify-between gap-4 rounded-xl p-4" data-testid={`reading-entry-${b.id}`}>
          <Link href={`/read/${b.id}`} className="flex min-w-0 items-center gap-4">
            <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-white/5 ring-1 ring-white/8">
              {b.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.cover} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="line-clamp-1 text-sm font-semibold text-white">{b.title ?? `Book ${b.id}`}</div>
              <div className="line-clamp-1 text-xs text-zinc-500 mt-0.5">{b.author ?? ""}</div>
              <div className="mt-2 h-1.5 w-[min(280px,40vw)] overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-500 progress-glow transition-all duration-500" style={{ width: pct(b.progress) }} />
              </div>
              <div className="mt-1 text-[11px] text-zinc-600">{pct(b.progress)} complete</div>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            {mode === "reading" ? (
              <button
                className="btn-glass px-3 py-2 text-xs"
                onClick={() => {
                  markFinished(String(b.id), true);
                  setItems(listEntries());
                }}
                data-testid={`mark-finished-${b.id}`}
              >
                Mark finished
              </button>
            ) : (
              <button
                className="btn-glass px-3 py-2 text-xs"
                onClick={() => {
                  markFinished(String(b.id), false);
                  setItems(listEntries());
                }}
                data-testid={`move-to-reading-${b.id}`}
              >
                Move to reading
              </button>
            )}
            <Link href={`/book/${b.id}`} className="btn-glass px-3 py-2 text-xs" data-testid={`book-details-${b.id}`}>
              Details
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
