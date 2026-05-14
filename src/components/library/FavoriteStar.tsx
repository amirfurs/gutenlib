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
      data-testid="favorite-star-btn"
      className={
        "inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium ring-1 transition-all duration-200 disabled:opacity-60 " +
        (fav
          ? "bg-amber-500/15 text-amber-300 ring-amber-400/25 hover:bg-amber-500/20"
          : "bg-white/5 text-zinc-400 ring-white/8 hover:bg-white/8 hover:text-zinc-200") +
        (className ? ` ${className}` : "")
      }
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          setBusy(true);
          const next = !fav;
          setFav(next);
          await setFavorite(bookKey, next);
        } finally {
          setBusy(false);
        }
      }}
      aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      title={fav ? "Remove from favorites" : "Add to favorites"}
    >
      <Star className={"h-4 w-4 transition " + (fav ? "fill-amber-400 text-amber-400" : "text-zinc-500")} />
    </button>
  );
}
