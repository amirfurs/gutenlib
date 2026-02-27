"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listEntries, markFinished, type ReadingEntry } from "@/lib/readingStore";

function pct(p?: number) {
  if (p == null || !Number.isFinite(p)) return "0%";
  return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

function stripPrefix(id: string) {
  return id.startsWith("abl:") ? id.slice(4) : id;
}

export function ArabicReadingList({ mode }: { mode: "reading" | "finished" }) {
  const [items, setItems] = useState<ReadingEntry[]>([]);

  useEffect(() => {
    const refresh = () => setItems(listEntries());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const filtered = useMemo(() => {
    const isFinished = mode === "finished";
    return items
      .filter((x) => x.id.startsWith("abl:"))
      .filter((x) => !!x.finished === isFinished);
  }, [items, mode]);

  if (!filtered.length) {
    return <div className="mt-6 text-sm text-zinc-400">لا يوجد شيء هنا بعد.</div>;
  }

  return (
    <div className="mt-6 grid gap-3" dir="rtl">
      {filtered.map((b) => {
        const bid = stripPrefix(String(b.id));
        return (
          <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
            <Link href={`/ar/read/${bid}`} className="flex min-w-0 items-center gap-3">
              <div className="h-14 w-10 overflow-hidden rounded bg-white/5 ring-1 ring-white/10">
                {b.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.cover} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="line-clamp-1 text-sm font-semibold text-white">{b.title ?? `كتاب ${bid}`}</div>
                <div className="line-clamp-1 text-xs text-zinc-400">{b.author ?? ""}</div>
                <div className="mt-1 h-2 w-[min(280px,40vw)] overflow-hidden rounded bg-white/10">
                  <div className="h-full bg-brand-500" style={{ width: pct(b.progress) }} />
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">التقدم: {pct(b.progress)}</div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {mode === "reading" ? (
                <button
                  className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  onClick={() => {
                    markFinished(String(b.id), true);
                    setItems(listEntries());
                  }}
                >
                  تمّت القراءة
                </button>
              ) : (
                <button
                  className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                  onClick={() => {
                    markFinished(String(b.id), false);
                    setItems(listEntries());
                  }}
                >
                  أعِد إلى "تتم القراءة"
                </button>
              )}
              <Link href={`/ar/book/${bid}`} className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">
                تفاصيل
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
