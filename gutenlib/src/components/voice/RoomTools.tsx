"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import type { ActiveBook } from "@/lib/voice/types";

let sharedAudioContext: AudioContext | null = null;
function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    try {
      sharedAudioContext = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (sharedAudioContext.state === "suspended") {
    const resume = () => {
      void sharedAudioContext?.resume();
      window.removeEventListener("click", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("touchstart", resume);
    };
    window.addEventListener("click", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    window.addEventListener("touchstart", resume, { once: true });
  }
  return sharedAudioContext;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="voice-dialog"
      dir="rtl"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="voice-btn icon-only" aria-label="إغلاق" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

type SearchBook = { id: string | number; title: string; authors?: { name: string }[]; contributors?: { name: string }[] };
export function BookPicker({ select, onClose }: { select: (book: NonNullable<ActiveBook>) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("ar");
  const [books, setBooks] = useState<SearchBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    setBooks([]);
    setSearched(true);
    const url =
      language === "ar"
        ? `/api/abl/books?lang=ar&languages=ar&perPage=20&query=${encodeURIComponent(query.trim())}`
        : `/api/books?languages=en&search=${encodeURIComponent(query.trim())}`;
    try {
      const res = await fetch(url, { signal: request.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!request.signal.aborted) setBooks(language === "ar" ? data.books ?? [] : data.results ?? []);
    } catch {
      if (!request.signal.aborted) setError("تعذر البحث في المكتبة. حاول مجددًا.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return (
    <Modal title="اختَر كتاب الجلسة" onClose={onClose}>
      <form className="voice-form" onSubmit={search}>
        <label htmlFor="book-language">المكتبة</label>
        <select
          id="book-language"
          value={language}
          onChange={(e) => {
            controller.current?.abort();
            setLoading(false);
            setBooks([]);
            setSearched(false);
            setLanguage(e.target.value);
          }}
        >
          <option value="ar">الكتب العربية</option>
          <option value="en">الكتب الإنجليزية</option>
        </select>
        <label htmlFor="book-query">العنوان أو المؤلف</label>
        <div className="search-row">
          <input
            id="book-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            maxLength={150}
            placeholder="ابحث في المكتبة"
          />
          <button className="voice-btn primary" disabled={loading}>
            <Search size={18} />
            {loading ? "نبحث…" : "بحث"}
          </button>
        </div>
      </form>
      <div className="book-results" aria-live="polite">
        {error && <p className="voice-error">{error}</p>}
        {!loading && searched && !books.length && !error && (
          <p className="muted">لا توجد نتائج. جرّب عنوانًا آخر أو اسم المؤلف.</p>
        )}
        {books.map((book) => (
          <button
            className="book-result"
            key={book.id}
            onClick={() => {
              const base = {
                title: book.title,
                author: book.contributors?.[0]?.name ?? book.authors?.[0]?.name ?? "",
                coverUrl: null,
                lang: language,
              };
              select(
                language === "ar"
                  ? { ...base, source: "abl", id: String(book.id) }
                  : { ...base, source: "gutendex", id: Number(book.id) }
              );
              onClose();
            }}
          >
            <strong>{book.title}</strong>
            <span className="muted">{book.contributors?.[0]?.name ?? book.authors?.[0]?.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function RemoteAudio({
  stream,
  audible,
  version,
  blocked,
}: {
  stream: MediaStream;
  audible: boolean;
  version: number;
  blocked: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    audio.muted = !audible;
    if (audible) void audio.play().catch(blocked);
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [stream, audible, version, blocked]);
  return <audio ref={ref} autoPlay playsInline data-voice-audio />;
}

export function useSpeaking(stream: MediaStream | null, enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !enabled || !stream.getAudioTracks().length) {
      return;
    }
    const context = getSharedAudioContext();
    if (!context) return;

    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    try {
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const values = new Uint8Array(analyser.fftSize);
      timer = setInterval(() => {
        if (!analyser) return;
        analyser.getByteTimeDomainData(values);
        let sum = 0;
        for (let i = 0; i < values.length; i++) {
          const dev = (values[i] - 128) / 128;
          sum += dev * dev;
        }
        const rms = Math.sqrt(sum / values.length);
        setSpeaking(rms > 0.025);
      }, 140);
    } catch {
      // Audio source binding may fail if track is inactive or context suspended
    }

    return () => {
      setSpeaking(false);
      if (timer) clearInterval(timer);
      try {
        source?.disconnect();
        analyser?.disconnect();
      } catch {
        // ignore disconnect
      }
    };
  }, [stream, enabled]);

  return enabled && speaking;
}
