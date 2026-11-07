"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookMarked, BookOpen, Headphones, Link2, LockKeyhole, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getVoiceServerUrl } from "@/lib/voice/config";
import { storage } from "@/lib/voice/useVoiceRoom";
import { RoomLexiconPopover } from "@/components/voice/RoomLexiconPopover";

type RoomResponse = { inviteToken: string; hostSecret: string; roomName: string; hostDisplayName: string };

export default function VoicePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const creating = useRef(false);

  useEffect(() => {
    setName(storage.get("gutenlib.voice.name"));
  }, []);

  const [room, setRoom] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lexiconOpen, setLexiconOpen] = useState(false);

  async function createRoom(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (creating.current) return;
    if (!name.trim() || !room.trim()) {
      setError("أدخل اسمك وعنوان الجلسة للبدء.");
      return;
    }
    creating.current = true;
    setLoading(true);

    try {
      const payload = JSON.stringify({ hostDisplayName: name.trim(), roomName: room.trim() });
      const headers = { "Content-Type": "application/json" };
      let response: Response | null = null;

      // 1. Same-origin Next.js proxy
      try {
        const r = await fetch("/rooms", { method: "POST", headers, body: payload, signal: AbortSignal.timeout(6000) });
        if (r.ok) response = r;
      } catch {}

      // 2. /api/rooms
      if (!response) {
        try {
          const r = await fetch("/api/rooms", { method: "POST", headers, body: payload, signal: AbortSignal.timeout(6000) });
          if (r.ok) response = r;
        } catch {}
      }

      // 3. Direct voice server
      if (!response) {
        const serverUrl = getVoiceServerUrl();
        response = await fetch(`${serverUrl}/rooms`, {
          method: "POST",
          headers,
          body: payload,
          signal: AbortSignal.timeout(10000),
        });
      }

      const data = (await response.json()) as RoomResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "CREATE_FAILED");

      storage.set(`gutenlib.voice.hostSecret.${data.inviteToken}`, data.hostSecret);
      storage.set(`gutenlib.voice.hostName.${data.inviteToken}`, data.hostDisplayName);
      storage.set(`gutenlib.voice.roomName.${data.inviteToken}`, data.roomName);
      storage.set("gutenlib.voice.name", data.hostDisplayName);
      router.push(`/room/${data.inviteToken}?host=1`);
    } catch (err) {
      console.error("[Voice] Room creation failed:", err);
      setError("تعذر إنشاء الجلسة. تحقق من تشغيل خادم الصوت أو من اتصالك ثم حاول مجددًا.");
    } finally {
      creating.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="voice-landing" dir="rtl">
      <div className="voice-landing__nav">
        <Link href="/" className="voice-wordmark">
          Guten<span>lib</span>
        </Link>
        <span className="voice-landing__subnav">غرف القراءة</span>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs hover:bg-amber-500/20 transition cursor-pointer"
          onClick={() => setLexiconOpen(true)}
          title="فتح المعجم التراثي اللحظي"
        >
          <BookMarked size={14} className="text-amber-400" />
          <span>المعجم التراثي</span>
        </button>
        <Link href="/" className="quiet-link">
          <ArrowLeft size={16} strokeWidth={1.5} /> المكتبة
        </Link>
      </div>

      <section className="voice-landing__hero">
        <div className="voice-landing__copy">
          <span className="eyebrow">قراءة مشتركة متزامنة</span>
          <h1>اقرأوا التراث بصوتٍ واحد.</h1>
          <p>
            مساحة هادئة لمجموعات القراءة وحلقات الاستماع. يختار القارئ كتابًا من التراث، وتتحرك الصفحات مع صوته لدى
            جميع المستمعين تلقائيًا وبصوت واضح.
          </p>
          <div className="voice-landing__notes">
            <span>
              <LockKeyhole size={15} strokeWidth={1.5} /> جلسات خاصة بالرابط
            </span>
            <span>
              <Headphones size={15} strokeWidth={1.5} /> صوت مباشر عبر المتصفح
            </span>
          </div>
        </div>

        <form className="create-card" onSubmit={createRoom}>
          <div className="create-card__heading">
            <span className="icon-tile">
              <Mic size={18} strokeWidth={1.5} />
            </span>
            <div>
              <span className="card-kicker">جلسة جديدة</span>
              <h2>إنشاء غرفة قراءة</h2>
            </div>
          </div>

          <label htmlFor="host-name">اسم القارئ</label>
          <input
            id="host-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: يحيى"
            autoComplete="name"
            maxLength={32}
          />

          <label htmlFor="room-name">عنوان الجلسة</label>
          <input
            id="room-name"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="مثال: قراءة في ديوان المتنبي"
            maxLength={60}
          />

          <button className="primary-action" disabled={loading}>
            <span>{loading ? "جاري الإنشاء…" : "بدء الجلسة"}</span>
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="create-card__hint">يظهر رابط الدعوة للمشاركين بعد الإنشاء مباشرة دون اشتراك.</p>
        </form>
      </section>

      <section className="voice-landing__features">
        <Feature
          icon={<BookOpen size={16} strokeWidth={1.5} />}
          title="مزامنة فورية للصفحات"
          text="تتبع المجموعة تقليب الصفحات مع المضيف تلقائيًا دون تشتت."
        />
        <Feature
          icon={<Headphones size={16} strokeWidth={1.5} />}
          title="صوت هادئ ونقي"
          text="قنوات صوتية موجهة للقراءة بهدوء ودون ضجيج، مع ضبط تلقائي للمستويات."
        />
        <Feature
          icon={<Link2 size={16} strokeWidth={1.5} />}
          title="دعوة برابط واحد"
          text="شارك الرابط مع رفاق القراءة، ليدخل كل مستمع باسمه فورًا."
        />
        <article
          className="voice-feature cursor-pointer hover:border-amber-500/40 transition"
          onClick={() => setLexiconOpen(true)}
          role="button"
          tabIndex={0}
        >
          <span className="feature-icon text-amber-400">
            <BookMarked size={16} strokeWidth={1.5} />
          </span>
          <div>
            <h3>المعجم التراثي اللحظي</h3>
            <p>استرجاع نصوص لسان العرب ومقاييس اللغة والصحاح والقاموس المحيط مباشرة.</p>
          </div>
        </article>
      </section>

      <footer className="voice-landing__footer">
        <span>Gutenlib · للقراءة الجماعية المتزامنة</span>
      </footer>

      {/* Instant Classical Lexicon Popover Card */}
      <RoomLexiconPopover
        initialWord="عسجد"
        isOpen={lexiconOpen}
        onClose={() => setLexiconOpen(false)}
      />
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="voice-feature">
      <span className="feature-icon">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}
