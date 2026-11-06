"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, MessageSquare, Quote, Send, X } from "lucide-react";
import type { ActiveBook, ChatMessage } from "@/lib/voice/types";
import { addNote } from "@/lib/library/db";

interface RoomMarginaliaProps {
  messages: ChatMessage[];
  selfId: string;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => Promise<boolean>;
  roomName?: string;
  book?: ActiveBook | null;
  participantCount?: number;
}

export function RoomMarginalia({
  messages,
  selfId,
  isOpen,
  onClose,
  onSendMessage,
  roomName = "غرفة القراءة",
  book,
  participantCount,
}: RoomMarginaliaProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [exported, setExported] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages.length]);

  async function handleExportFolio() {
    if (messages.length === 0) return;

    const dateStr = new Date().toLocaleDateString("ar-EG", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

    const quotes = messages.filter((m) => m.isQuote && m.quoteData);
    const discussions = messages.filter((m) => !m.isQuote);

    let md = `# كراسة جلسة القراءة: ${roomName}\n\n`;
    md += `- **التاريخ**: ${dateStr} (${timeStr})\n`;
    if (book) {
      md += `- **الكتاب**: ${book.title}${book.author ? ` — ${book.author}` : ""}\n`;
      md += `- **المصدر**: ${book.source === "abl" ? "المكتبة العربية (ABL)" : "مشروع غوتنبرغ (Gutenberg)"}\n`;
    }
    if (participantCount) {
      md += `- **عدد الحضور**: ${participantCount}\n`;
    }
    md += `\n---\n\n`;

    md += `## الاقتباسات المقيدة من الكتاب (${quotes.length})\n\n`;
    if (quotes.length === 0) {
      md += `*لم يتم تقييد اقتباسات خلال هذه الجلسة.*\n\n`;
    } else {
      for (const q of quotes) {
        const qTime = new Date(q.ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
        md += `> "${q.quoteData?.text}"\n>\n`;
        md += `> — **${q.quoteData?.citation || "صفحة غير محددة"}** (قيدها: ${q.name} في ${qTime})\n\n`;
      }
    }

    md += `---\n\n`;
    md += `## حوارات وهوامش الحلقة (${discussions.length})\n\n`;
    if (discussions.length === 0) {
      md += `*لا توجد هوامش مسجلة.*\n\n`;
    } else {
      for (const d of discussions) {
        const dTime = new Date(d.ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
        md += `- **${d.name}** [${dTime}]: ${d.text}\n`;
      }
    }

    md += `\n---\n*تم تصدير هذه الكراسة عبر منصة Gutenlib*\n`;

    // 1. Download Markdown file
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cleanName = roomName.replace(/[^\w\u0600-\u06FF]+/g, "_");
    a.download = `folio-${cleanName}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 2. Persist quotes to personal library notes in IndexedDB if book exists
    if (book) {
      try {
        const scope = book.source === "abl" ? "arabic" : "english";
        for (const q of quotes) {
          if (q.quoteData?.text) {
            // Extract page number if present in citation, else default to 1
            const pageMatch = q.quoteData.citation?.match(/\d+/);
            const pageNum = pageMatch ? parseInt(pageMatch[0], 10) : 1;
            const noteText = `[اقتباس من حلقة ${roomName}]: "${q.quoteData.text}"`;
            await addNote(scope, String(book.id), pageNum, noteText, q.quoteData.citation);
          }
        }
      } catch (err) {
        console.warn("Failed to save quotes to indexedDB notes:", err);
      }
    }

    setExported(true);
    setTimeout(() => setExported(false), 2500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const ok = await onSendMessage(text);
      if (ok) setDraft("");
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="marginalia-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="marginalia-drawer" aria-label="الملاحظات والاقتباسات" dir="rtl">
        <div className="marginalia-header">
          <div className="marginalia-title-wrap">
            <MessageSquare size={15} strokeWidth={1.5} className="marginalia-icon" />
            <h3>الملاحظات والاقتباسات</h3>
          </div>
          <div className="marginalia-header-actions">
            <button
              type="button"
              className={"marginalia-export-btn" + (exported ? " is-success" : "")}
              onClick={handleExportFolio}
              title="تصدير كراسة الملاحظات والاقتباسات كملف Markdown وحفظها"
              disabled={messages.length === 0}
            >
              {exported ? <Check size={13} strokeWidth={1.5} /> : <Download size={13} strokeWidth={1.5} />}
              <span>{exported ? "تم التصدير" : "تصدير الكراسة"}</span>
            </button>
            <button
              type="button"
              className="marginalia-close-btn"
              onClick={onClose}
              aria-label="إغلاق الملاحظات"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="marginalia-feed">
          {messages.length === 0 ? (
            <div className="marginalia-empty">
              <p>لا توجد ملاحظات أو اقتباسات بعد.</p>
              <span>حدد أي جملة في الكتاب لاقتباسها هنا فورًا مع رقم الصفحة.</span>
            </div>
          ) : (
            messages.map((item) => {
              const isMine = item.peerId === selfId;
              const timeString = new Date(item.ts).toLocaleTimeString("ar", {
                hour: "2-digit",
                minute: "2-digit",
              });

              if (item.isQuote && item.quoteData) {
                return (
                  <article
                    key={item.id}
                    className={"marginalia-quote-card" + (isMine ? " is-mine" : "")}
                  >
                    <div className="quote-card-header">
                      <span className="quote-sender">{isMine ? "أنت" : item.name}</span>
                      <time className="quote-time">{timeString}</time>
                    </div>
                    <blockquote className="quote-card-body">
                      <Quote size={13} strokeWidth={1.5} className="quote-mark" />
                      <p>{item.quoteData.text}</p>
                    </blockquote>
                    {item.quoteData.citation && (
                      <span className="quote-citation">{item.quoteData.citation}</span>
                    )}
                  </article>
                );
              }

              return (
                <article
                  key={item.id}
                  className={"marginalia-message" + (isMine ? " is-mine" : "")}
                >
                  <div className="message-meta">
                    <strong className="message-sender">{isMine ? "أنت" : item.name}</strong>
                    <time className="message-time">{timeString}</time>
                  </div>
                  <p className="message-text">{item.text}</p>
                </article>
              );
            })
          )}
          <div ref={listEndRef} />
        </div>

        <form className="marginalia-compose" onSubmit={handleSubmit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="اكتب ملاحظة أو سؤالاً…"
            maxLength={350}
            aria-label="نص الملاحظة"
          />
          <button
            type="submit"
            className="marginalia-send-btn"
            disabled={!draft.trim() || sending}
            aria-label="إرسال الملاحظة"
          >
            <Send size={15} strokeWidth={1.5} />
          </button>
        </form>
      </aside>
    </>
  );
}
