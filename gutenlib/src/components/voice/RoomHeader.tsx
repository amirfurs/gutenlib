"use client";

import Link from "next/link";
import { BookOpen, Check, Copy, Maximize2, Minimize2, Radio } from "lucide-react";
import type { ActiveBook, LayoutMode, ReadingState } from "@/lib/voice/types";
import { useState } from "react";

interface RoomHeaderProps {
  roomName: string;
  book: ActiveBook | null;
  reading: ReadingState;
  token: string;
  isHost: boolean;
  participantCount: number;
  layoutMode: LayoutMode;
  onToggleLayout: () => void;
  onOpenBookPicker?: () => void;
}

export function RoomHeader({
  roomName,
  book,
  reading,
  token,
  participantCount,
  layoutMode,
  onToggleLayout,
  onOpenBookPicker,
  isHost,
}: RoomHeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyInvite = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/room/${token}` : "";
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback handled in parent
    }
  };

  const pageLabel =
    reading.kind === "page"
      ? `الصفحة ${reading.index}`
      : reading.kind === "chunk"
      ? `المقطع ${reading.index + 1}`
      : "";

  return (
    <header className="folio-header" dir="rtl">
      <div className="folio-header__start">
        <Link href="/" className="folio-brand">
          Guten<span>lib</span>
        </Link>
        <span className="folio-divider" aria-hidden="true">/</span>
        <span className="folio-room-title" title={roomName}>
          {roomName}
        </span>
        <span className="folio-count" title={`${participantCount} في الجلسة`}>
          {participantCount}
        </span>
      </div>

      <div className="folio-header__center">
        {book ? (
          <div className="folio-book-badge">
            <BookOpen size={14} strokeWidth={1.5} className="folio-icon" />
            <span className="folio-book-title" title={book.title}>
              {book.title}
            </span>
            {book.author && <span className="folio-book-author">· {book.author}</span>}
            {pageLabel && <span className="folio-page-label">({pageLabel})</span>}
            {isHost && onOpenBookPicker && (
              <button
                type="button"
                className="folio-action-btn"
                onClick={onOpenBookPicker}
                title="تغيير كتاب الجلسة"
              >
                تغيير
              </button>
            )}
          </div>
        ) : (
          <div className="folio-book-empty">
            <Radio size={13} strokeWidth={1.5} className="folio-live-dot" />
            <span>جلسة قراءة صوتية</span>
            {isHost && onOpenBookPicker && (
              <button
                type="button"
                className="folio-action-btn"
                onClick={onOpenBookPicker}
              >
                اختيار كتاب
              </button>
            )}
          </div>
        )}
      </div>

      <div className="folio-header__end">
        <button
          type="button"
          className="folio-tool-btn"
          onClick={onToggleLayout}
          title={layoutMode === "focus" ? "إظهار الحلقة والملاحظات" : "عرض القراءة المركزة"}
          aria-label={layoutMode === "focus" ? "عرض مقسم" : "عرض مركز"}
        >
          {layoutMode === "focus" ? <Minimize2 size={15} strokeWidth={1.5} /> : <Maximize2 size={15} strokeWidth={1.5} />}
          <span className="hidden-mobile">{layoutMode === "focus" ? "عرض الحلقة" : "تركيز القراءة"}</span>
        </button>

        <button
          type="button"
          className={"folio-tool-btn" + (copied ? " is-copied" : "")}
          onClick={copyInvite}
          title="نسخ رابط دعوة المشاركين"
        >
          {copied ? <Check size={15} strokeWidth={1.5} /> : <Copy size={15} strokeWidth={1.5} />}
          <span className="hidden-mobile">{copied ? "تم النسخ" : "نسخ الرابط"}</span>
        </button>
      </div>
    </header>
  );
}
