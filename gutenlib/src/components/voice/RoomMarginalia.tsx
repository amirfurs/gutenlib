"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Quote, Send, X } from "lucide-react";
import type { ChatMessage } from "@/lib/voice/types";

interface RoomMarginaliaProps {
  messages: ChatMessage[];
  selfId: string;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => Promise<boolean>;
}

export function RoomMarginalia({
  messages,
  selfId,
  isOpen,
  onClose,
  onSendMessage,
}: RoomMarginaliaProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isOpen, messages.length]);

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
          <button
            type="button"
            className="marginalia-close-btn"
            onClick={onClose}
            aria-label="إغلاق الملاحظات"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
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
