"use client";

import { Hand, Headphones, LogOut, MessageSquare, Mic, MicOff, Settings, Volume2, VolumeX } from "lucide-react";

interface RoomCallRailProps {
  displayName: string;
  isHost: boolean;
  canSpeak: boolean;
  micOn: boolean;
  micBusy: boolean;
  handRaised: boolean;
  marginaliaOpen: boolean;
  unreadCount: number;
  audioAudible: boolean;
  onToggleMic: () => void;
  onRaiseHand: () => void;
  onToggleMarginalia: () => void;
  onToggleAudible: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
  onEndRoom?: () => void;
}

export function RoomCallRail({
  displayName,
  isHost,
  canSpeak,
  micOn,
  micBusy,
  handRaised,
  marginaliaOpen,
  unreadCount,
  audioAudible,
  onToggleMic,
  onRaiseHand,
  onToggleMarginalia,
  onToggleAudible,
  onOpenSettings,
  onLeave,
  onEndRoom,
}: RoomCallRailProps) {
  const initial = Array.from(displayName.trim())[0] ?? "؟";

  return (
    <nav className="call-rail" aria-label="أدوات الجلسة الصوتية" dir="rtl">
      <div className="call-rail__identity">
        <span className="call-avatar" aria-hidden="true">
          {initial}
        </span>
        <div className="call-rail__user-text">
          <strong className="call-user-name">{displayName || "أنت"}</strong>
          <span className="call-user-role">
            {isHost ? "مضيف الجلسة" : canSpeak ? "متحدث" : "مستمع"}
          </span>
        </div>
      </div>

      <div className="call-rail__controls">
        {canSpeak ? (
          <button
            type="button"
            className={"call-btn" + (micOn ? " is-active" : "")}
            onClick={onToggleMic}
            disabled={micBusy}
            title={micOn ? "كتم الميكروفون (M)" : "تشغيل الميكروفون (M)"}
            aria-pressed={micOn}
          >
            {micOn ? <Mic size={16} strokeWidth={1.5} /> : <MicOff size={16} strokeWidth={1.5} />}
            <span>{micBusy ? "جارٍ التجهيز…" : micOn ? "الميكروفون مسموع" : "كتم الصوت"}</span>
            <kbd className="keycap hidden-mobile">M</kbd>
          </button>
        ) : (
          <button
            type="button"
            className={"call-btn" + (handRaised ? " is-active" : "")}
            onClick={onRaiseHand}
            title={handRaised ? "إلغاء طلب التحدث (H)" : "طلب الميكروفون (H)"}
            aria-pressed={handRaised}
          >
            <Hand size={16} strokeWidth={1.5} />
            <span>{handRaised ? "بانتظار الإذن" : "طلب التحدث"}</span>
            <kbd className="keycap hidden-mobile">H</kbd>
          </button>
        )}

        <button
          type="button"
          className={"call-btn" + (marginaliaOpen ? " is-open" : "")}
          onClick={onToggleMarginalia}
          title="الملاحظات والمحادثة (C)"
          aria-pressed={marginaliaOpen}
        >
          <MessageSquare size={16} strokeWidth={1.5} />
          <span>الملاحظات</span>
          {unreadCount > 0 && <span className="call-badge">{unreadCount}</span>}
          <kbd className="keycap hidden-mobile">C</kbd>
        </button>

        <button
          type="button"
          className="call-btn icon-btn"
          onClick={onToggleAudible}
          title={audioAudible ? "كتم صوت الغرفة" : "تشغيل صوت الغرفة"}
          aria-label={audioAudible ? "كتم صوت الغرفة" : "تشغيل صوت الغرفة"}
        >
          {audioAudible ? <Volume2 size={16} strokeWidth={1.5} /> : <VolumeX size={16} strokeWidth={1.5} />}
        </button>

        <button
          type="button"
          className="call-btn icon-btn"
          onClick={onOpenSettings}
          title="إعدادات الصوت والمؤثرات الهادئة"
          aria-label="إعدادات الصوت"
        >
          <Settings size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="call-rail__actions">
        <button
          type="button"
          className="call-leave-btn"
          onClick={onLeave}
          title="مغادرة الجلسة"
        >
          <LogOut size={15} strokeWidth={1.5} />
          <span>مغادرة</span>
        </button>

        {isHost && onEndRoom && (
          <button
            type="button"
            className="call-end-btn"
            onClick={onEndRoom}
            title="إنهاء الجلسة لجميع الحاضرين"
          >
            إنهاء للجميع
          </button>
        )}
      </div>
    </nav>
  );
}
