"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function BooksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BooksError]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-16 text-center">
      <div className="rounded-2xl bg-white/[0.03] p-8 ring-1 ring-white/10">
        <h2 className="text-xl font-bold text-white">Temporary Catalog Disruption</h2>
        <p className="mt-2 text-sm text-zinc-400">
          The upstream Project Gutenberg catalog is taking longer than usual to respond.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="pressable rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
          >
            Retry
          </button>
          <Link
            href="/books"
            className="pressable rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
          >
            Browse Curated Classics
          </Link>
          <Link
            href="/"
            className="pressable rounded-xl bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}

