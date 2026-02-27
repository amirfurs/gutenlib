"use client";

import { StickyNote } from "lucide-react";

export function NotesButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={
        "inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/15 " +
        (className ? className : "")
      }
      onClick={onClick}
      aria-label="ملاحظات"
      title="ملاحظات"
    >
      <StickyNote className="h-4 w-4" />
    </button>
  );
}
