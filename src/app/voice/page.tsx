"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MicVocal, Link2, ShieldCheck, Sparkles } from "lucide-react";

type RoomCreateResponse = {
  inviteToken: string;
  hostSecret: string;
  roomName: string;
  hostDisplayName: string;
  expiresAt: number;
};

export default function VoiceHomePage() {
  const router = useRouter();
  const base = process.env.NEXT_PUBLIC_VOICE_SERVER_URL ?? "http://localhost:3001";

  const [hostName, setHostName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function createRoom() {
    setStatus("");

    const hn = hostName.trim();
    const rn = roomName.trim();

    if (!hn) return setStatus("اكتب اسمك قبل إنشاء الغرفة");
    if (!rn) return setStatus("اكتب اسم الغرفة قبل إنشاء الغرفة");

    try {
      setLoading(true);
      const res = await fetch(`${base}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: rn, hostDisplayName: hn }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as RoomCreateResponse;

      try {
        localStorage.setItem(`gutenlib.voice.hostSecret.${data.inviteToken}`, data.hostSecret);
        localStorage.setItem(`gutenlib.voice.hostName.${data.inviteToken}`, data.hostDisplayName);
        localStorage.setItem(`gutenlib.voice.roomName.${data.inviteToken}`, data.roomName);
      } catch {
        // ignore
      }

      router.push(`/room/${data.inviteToken}?host=1`);
    } catch {
      setStatus(`تعذر إنشاء الغرفة. تأكد أن voice-server يعمل (${base})`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="voice-page" dir="rtl">
      <div className="voice-glow glow-1" />
      <div className="voice-glow glow-2" />

      <div className="voice-wrap">
        <header className="hero">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>Gutenlib Voice</span>
          </div>

          <h1>غرف صوتية بتصميم أوضح وتجربة أسرع</h1>
          <p>
            أنشئ غرفة خلال ثوانٍ، وشارك الرابط مباشرة. المضيف يتحكم بطلبات المايك والمشاركين بسهولة.
          </p>
        </header>

        <section className="panel">
          <div className="panel-main">
            <div className="field">
              <label>اسمك</label>
              <input
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="مثال: أمير"
              />
            </div>

            <div className="field">
              <label>اسم الغرفة</label>
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="مثال: جلسة قراءة"
              />
            </div>

            <button onClick={createRoom} disabled={loading} className="cta">
              {loading ? "جاري الإنشاء..." : "إنشاء وبدء الغرفة"}
            </button>

            {status ? <div className="error">{status}</div> : null}
          </div>

          <aside className="panel-side">
            <div className="chip">
              <MicVocal size={16} />
              <div>
                <strong>صوت مباشر</strong>
                <span>WebRTC + Socket.IO</span>
              </div>
            </div>

            <div className="chip">
              <Link2 size={16} />
              <div>
                <strong>دعوة سريعة</strong>
                <span>رابط جاهز للمشاركة</span>
              </div>
            </div>

            <div className="chip">
              <ShieldCheck size={16} />
              <div>
                <strong>تحكم المضيف</strong>
                <span>منح/سحب المايك وطرد المستخدم</span>
              </div>
            </div>

            <div className="server-box" title="عنوان خادم الغرف">
              <span>voice-server</span>
              <code>{base}</code>
            </div>
          </aside>
        </section>
      </div>

      <style jsx>{`
        .voice-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background: radial-gradient(1200px 500px at 15% -5%, rgba(37, 99, 235, 0.2), transparent 60%),
            radial-gradient(900px 420px at 100% 20%, rgba(16, 185, 129, 0.15), transparent 55%),
            #07090f;
          color: #f9fafb;
          -webkit-tap-highlight-color: transparent;
        }

        .voice-glow {
          position: absolute;
          border-radius: 999px;
          filter: blur(80px);
          opacity: 0.25;
          pointer-events: none;
        }

        .glow-1 {
          width: 320px;
          height: 320px;
          background: #2563eb;
          top: 8%;
          right: 8%;
        }

        .glow-2 {
          width: 280px;
          height: 280px;
          background: #10b981;
          bottom: 8%;
          left: 10%;
        }

        .voice-wrap {
          max-width: 1020px;
          margin: 0 auto;
          padding: 40px 18px 30px;
          position: relative;
          z-index: 2;
        }

        .hero {
          text-align: right;
          margin-bottom: 18px;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(148, 163, 184, 0.14);
          border: 1px solid rgba(148, 163, 184, 0.3);
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          margin-bottom: 10px;
        }

        .hero h1 {
          margin: 0;
          font-size: clamp(26px, 5vw, 38px);
          font-weight: 900;
          letter-spacing: 0.2px;
        }

        .hero p {
          margin: 10px 0 0;
          opacity: 0.8;
          line-height: 1.8;
          max-width: 760px;
        }

        .panel {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 14px;
          border: 1px solid #243043;
          background: linear-gradient(180deg, rgba(10, 13, 21, 0.9), rgba(8, 10, 17, 0.85));
          border-radius: 22px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.42);
          padding: 16px;
          backdrop-filter: blur(10px);
        }

        .panel-main {
          border: 1px solid #25324a;
          border-radius: 16px;
          background: rgba(8, 12, 20, 0.65);
          padding: 14px;
          display: grid;
          gap: 12px;
        }

        .field {
          display: grid;
          gap: 7px;
        }

        .field label {
          font-size: 12px;
          opacity: 0.82;
        }

        .field input {
          width: 100%;
          padding: 12px 13px;
          border-radius: 12px;
          border: 1px solid #2b3953;
          background: #0d1321;
          color: #f9fafb;
          outline: none;
          font-size: 16px;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .field input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .cta {
          margin-top: 2px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          padding: 12px 14px;
          color: white;
          font-weight: 900;
          cursor: pointer;
          background: linear-gradient(180deg, #3b82f6, #1d4ed8);
          transition: transform 0.12s ease, filter 0.2s ease;
        }

        .cta:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }

        .cta:disabled {
          cursor: not-allowed;
          opacity: 0.78;
        }

        .error {
          font-size: 13px;
          color: #fecaca;
          border: 1px solid #7f1d1d;
          background: rgba(127, 29, 29, 0.18);
          border-radius: 12px;
          padding: 10px;
        }

        .panel-side {
          display: grid;
          gap: 10px;
          align-content: start;
        }

        .chip {
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 10px;
          align-items: start;
          border: 1px solid #25324a;
          border-radius: 14px;
          background: rgba(12, 17, 29, 0.85);
          padding: 10px;
        }

        .chip strong {
          display: block;
          font-size: 13px;
          margin-bottom: 2px;
        }

        .chip span {
          font-size: 12px;
          opacity: 0.72;
        }

        .server-box {
          margin-top: 4px;
          border: 1px dashed #334155;
          border-radius: 12px;
          padding: 10px;
          display: grid;
          gap: 6px;
          font-size: 12px;
          background: rgba(3, 7, 16, 0.7);
        }

        .server-box span {
          opacity: 0.7;
        }

        .server-box code {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          direction: ltr;
          text-align: left;
        }

        @media (max-width: 900px) {
          .panel {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .voice-wrap {
            padding: 22px 12px 18px;
          }

          .panel {
            border-radius: 16px;
            padding: 12px;
          }

          .panel-main,
          .chip,
          .server-box {
            border-radius: 12px;
          }

          .cta {
            min-height: 48px;
            font-size: 15px;
          }
        }
      `}</style>
    </main>
  );
}
