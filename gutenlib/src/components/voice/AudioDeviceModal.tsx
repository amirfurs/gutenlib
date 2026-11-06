"use client";

import { useEffect, useState } from "react";
import { CloudRain, Flame, Headphones, Mic, Sparkles, Volume2, X } from "lucide-react";
import { ambientSound, type AmbientPreset } from "@/lib/voice/ambientAudio";

interface AudioDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  localStream: MediaStream | null;
  onSelectDevice: (deviceId: string) => void;
}

export function AudioDeviceModal({
  isOpen,
  onClose,
  localStream,
  onSelectDevice,
}: AudioDeviceModalProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [ambientPreset, setAmbientPreset] = useState<AmbientPreset>(ambientSound.getPreset());
  const [ambientVol, setAmbientVol] = useState(Math.round(ambientSound.getVolume() * 100));
  const [micLevel, setMicLevel] = useState(0);

  // Enumerate input devices
  useEffect(() => {
    if (!isOpen) return;
    async function loadDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const all = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = all.filter((d) => d.kind === "audioinput");
        setDevices(audioInputs);
        if (audioInputs.length && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch {
        // ignore
      }
    }
    void loadDevices();
  }, [isOpen, selectedDeviceId]);

  // Live microphone VU level
  useEffect(() => {
    if (!isOpen || !localStream || !localStream.getAudioTracks().length) {
      setMicLevel(0);
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let animId: number | null = null;

    try {
      ctx = new AudioCtx();
      source = ctx.createMediaStreamSource(localStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.fftSize);
      const update = () => {
        if (!analyser) return;
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const dev = (buffer[i] - 128) / 128;
          sum += dev * dev;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const normalized = Math.min(100, Math.round(rms * 280));
        setMicLevel(normalized);
        animId = requestAnimationFrame(update);
      };
      animId = requestAnimationFrame(update);
    } catch {
      // ignore
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      try {
        source?.disconnect();
        analyser?.disconnect();
        void ctx?.close();
      } catch {
        // ignore
      }
    };
  }, [isOpen, localStream]);

  if (!isOpen) return null;

  return (
    <div className="audio-modal-backdrop" onClick={onClose} dir="rtl">
      <div className="audio-modal" onClick={(e) => e.stopPropagation()}>
        <div className="audio-modal-header">
          <div className="audio-modal-title">
            <Headphones size={16} strokeWidth={1.5} />
            <h2>إعدادات الصوت والبيئة الهادئة</h2>
          </div>
          <button type="button" className="audio-modal-close" onClick={onClose} aria-label="إغلاق">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="audio-modal-content">
          {/* Microphone Device */}
          <section className="audio-section">
            <label htmlFor="mic-select" className="audio-label">
              <Mic size={14} strokeWidth={1.5} /> جهاز الميكروفون
            </label>
            <select
              id="mic-select"
              className="audio-select"
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                onSelectDevice(e.target.value);
              }}
            >
              {devices.length === 0 ? (
                <option value="">الميكروفون الافتراضي للنظام</option>
              ) : (
                devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `ميكروفون ${i + 1}`}
                  </option>
                ))
              )}
            </select>

            {/* Live Mic Level Bar */}
            <div className="audio-meter-wrap">
              <span className="audio-meter-label">مستوى الالتقاط:</span>
              <div className="audio-meter-track" role="meter" aria-valuenow={micLevel} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="audio-meter-fill"
                  style={{ width: `${localStream ? micLevel : 0}%` }}
                />
              </div>
            </div>
            <p className="audio-hint">
              {localStream
                ? "تحدث الآن للتأكد من وصول الصوت بوضوح قبل القراءة."
                : "الميكروفون مكتوم حاليًا. شغل الميكروفون لاختبار الصوت."}
            </p>
          </section>

          {/* Procedural Ambient Soundscapes */}
          <section className="audio-section">
            <span className="audio-label">
              <Volume2 size={14} strokeWidth={1.5} /> المؤثرات الصوتية الهادئة (خلفية القراءة)
            </span>
            <div className="ambient-grid">
              <button
                type="button"
                className={"ambient-preset-btn" + (ambientPreset === "none" ? " is-active" : "")}
                onClick={() => {
                  setAmbientPreset("none");
                  ambientSound.stop();
                }}
              >
                <span>بدون مؤثرات</span>
              </button>

              <button
                type="button"
                className={"ambient-preset-btn" + (ambientPreset === "library" ? " is-active" : "")}
                onClick={() => {
                  setAmbientPreset("library");
                  ambientSound.play("library");
                }}
              >
                <Headphones size={14} strokeWidth={1.5} />
                <span>مكتبة هادئة</span>
              </button>

              <button
                type="button"
                className={"ambient-preset-btn" + (ambientPreset === "rain" ? " is-active" : "")}
                onClick={() => {
                  setAmbientPreset("rain");
                  ambientSound.play("rain");
                }}
              >
                <CloudRain size={14} strokeWidth={1.5} />
                <span>مطر خفيف</span>
              </button>

              <button
                type="button"
                className={"ambient-preset-btn" + (ambientPreset === "fireplace" ? " is-active" : "")}
                onClick={() => {
                  setAmbientPreset("fireplace");
                  ambientSound.play("fireplace");
                }}
              >
                <Flame size={14} strokeWidth={1.5} />
                <span>موقد حطب</span>
              </button>
            </div>

            {ambientPreset !== "none" && (
              <div className="ambient-volume-wrap">
                <span className="audio-meter-label">مستوى صوت الخلفية: {ambientVol}٪</span>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={ambientVol}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setAmbientVol(val);
                    ambientSound.setVolume(val / 100);
                  }}
                  className="ambient-range"
                />
              </div>
            )}

            <p className="audio-hint">
              يولد المتصفح هذه الأصوات اصطناعيًا دون تحميل ملفات خارجية، وتنخفض تلقائيًا بنسبة ٧٥٪ أثناء حديث أي قارئ في الجلسة.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
