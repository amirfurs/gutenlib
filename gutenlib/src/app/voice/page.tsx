"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Headphones, Link2, LockKeyhole, Mic2, Radio, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getVoiceServerUrl } from "@/lib/voice/config";
import { storage } from "@/lib/voice/useVoiceRoom";

type RoomResponse = { inviteToken: string; hostSecret: string; roomName: string; hostDisplayName: string };

export default function VoicePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const creating = useRef(false);
  useEffect(() => { setName(storage.get("gutenlib.voice.name")); }, []);
  const [room, setRoom] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function createRoom(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (creating.current) return;
    if (!name.trim() || !room.trim()) { setError("أدخل اسمك واسم الغرفة للبدء."); return; }
    creating.current = true; setLoading(true);
    try {
      const serverUrl = getVoiceServerUrl();
      const response = await fetch(`${serverUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostDisplayName: name.trim(), roomName: room.trim() }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json() as RoomResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "CREATE_FAILED");
      if (!storage.set(`gutenlib.voice.hostSecret.${data.inviteToken}`, data.hostSecret)) { setError("اسمح بالتخزين المحلي في المتصفح للاحتفاظ بصلاحية المضيف ثم حاول مجددًا."); return; }
      storage.set(`gutenlib.voice.hostName.${data.inviteToken}`, data.hostDisplayName); storage.set(`gutenlib.voice.roomName.${data.inviteToken}`, data.roomName); storage.set("gutenlib.voice.name", data.hostDisplayName);
      router.push(`/room/${data.inviteToken}?host=1`);
    } catch (err) {
      console.error("[Voice] Room creation failed:", err);
      setError("تعذر إنشاء الغرفة. تحقق من تشغيل خادم الصوت أو من اتصالك ثم حاول مجددًا.");
    } finally { creating.current = false; setLoading(false); }
  }
  return <main className="voice-landing" dir="rtl">
    <div className="voice-landing__nav"><Link href="/" className="pressable voice-wordmark">Guten<span>lib</span></Link><Link href="/" className="pressable quiet-link"><ArrowLeft size={16} /> المكتبة</Link></div>
    <section className="voice-landing__hero"><div className="voice-landing__copy"><div className="eyebrow"><Radio size={14} /> جلسات قراءة حيّة</div><h1>اقرأوا بصوتٍ واحد.</h1><p>غرفة هادئة للقراءة الجماعية، بصوت واضح وتحكم بسيط للمضيف. شارك الرابط وابدأ خلال لحظات.</p><div className="voice-landing__notes"><span><LockKeyhole size={15} /> جلسات خاصة بالرابط</span><span><Headphones size={15} /> صوت مباشر عبر المتصفح</span></div></div>
      <form className="create-card shadow-2xl backdrop-blur-md" onSubmit={createRoom}><div className="create-card__heading"><span className="icon-tile shadow-sm"><Mic2 size={19} /></span><div><span className="card-kicker">ابدأ جلسة</span><h2>أنشئ غرفة صوتية</h2></div></div><label htmlFor="host-name">اسمك</label><input id="host-name" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: أمير" autoComplete="name" /><label htmlFor="room-name">اسم الغرفة</label><input id="room-name" value={room} onChange={e => setRoom(e.target.value)} placeholder="جلسة قراءة المساء" /><button className="primary-action" disabled={loading}>{loading ? "جاري الإنشاء…" : "إنشاء الغرفة"}<ArrowLeft size={17} /></button>{error && <p className="form-error" role="alert">{error}</p>}<p className="create-card__hint">سيظهر لك رابط دعوة بعد الإنشاء. لا نطلب حسابًا.</p></form>
    </section>
    <section className="voice-landing__features"><Feature icon={<Users />} title="مساحة صغيرة" text="حتى ٨ مشاركين حتى يبقى الحوار واضحًا." /><Feature icon={<BookOpen />} title="الكتاب حاضر" text="اختَر كتابًا ودع المضيف يزامن الصفحات للجميع." /><Feature icon={<Link2 />} title="رابط واحد" text="أرسله لمن تريد، والضيف يدخل باسمه فقط." /></section><p className="voice-landing__footer"><Sparkles size={14} /> Gutenlib Voice · للقراءة معًا</p>
  </main>;
}
function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <article className="interactive-card voice-feature rounded-xl p-3"><span className="feature-icon">{icon}</span><div><h3>{title}</h3><p>{text}</p></div></article>; }
