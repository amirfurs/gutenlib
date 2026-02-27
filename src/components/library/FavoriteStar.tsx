"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { isFavorite, setFavorite } from "@/lib/library/db";

export function FavoriteStar({ bookKey, className }: { bookKey: string; className?: string }) {
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await isFavorite(bookKey);
      if (!cancelled) setFav(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookKey]);

  return (
    <button
      type="button"
      className={
        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ring-1 transition disabled:opacity-60 " +
        (fav
          ? "bg-yellow-400/15 text-yellow-200 ring-yellow-400/30 hover:bg-yellow-400/20"
          : "bg-white/5 text-zinc-200 ring-white/10 hover:bg-white/10") +
        (className ? ` ${className}` : "")
      }
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          setBusy(true);
          const next = !fav;
          setFav(next); // optimistic
          await setFavorite(bookKey, next);
        } finally {
          setBusy(false);
        }
      }}
      aria-label={fav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
      title={fav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
    >
      <Star className={"h-4 w-4 " + (fav ? "fill-yellow-400 text-yellow-400" : "text-zinc-300")} />
    </button>
  );
}
