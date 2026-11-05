"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Hand,
  Headphones,
  Highlighter,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  Search,
  Send,
  Shield,
  ShieldOff,
  Trash2,
  UserRoundX,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useVoiceRoom, storage } from "@/lib/voice/useVoiceRoom";
import type { PeerInfo } from "@/lib/voice/types";
import { RoomReader } from "@/components/RoomReader";
import { RoomArabicReader } from "@/components/RoomArabicReader";
import { BookPicker, Modal, RemoteAudio, useSpeaking } from "@/components/voice/RoomTools";
import { HAS_TURN, getVoiceServerUrl } from "@/lib/voice/config";

function Avatar({ name, speaking = false }: { name: string; speaking?: boolean }) {
  return <span className={"voice-avatar" + (speaking ? " is-speaking" : "")}>{Array.from(name.trim())[0] ?? "؟"}</span>;
}

function Participant({
  peer,
  stream,
  isHost,
  onManage,
}: {
  peer: PeerInfo;
  stream: MediaStream | null;
  isHost: boolean;
  onManage: () => void;
}) {
  const speaking = useSpeaking(stream, !!peer.micOn);
  return (
    <div className="participant">
      <Avatar name={peer.displayName} speaking={speaking} />
      <div className="participant__name">
        <strong>{peer.displayName}</strong>
        <span>{peer.role === "host" ? "المضيف" : peer.role === "speaker" ? "متحدث" : "مستمع"}</span>
      </div>
      <div className="participant__icons">
        {peer.handRaised && <Hand size={16} className="hand-icon" aria-label="طلب الميكروفون" />}
        {peer.micOn ? <Mic size={16} /> : <MicOff size={16} />}
        {isHost && peer.role !== "host" && (
          <button
            className="icon-only participant__more"
            title={"إدارة " + peer.displayName}
            aria-label={"إدارة " + peer.displayName}
            onClick={onManage}
          >
            <MoreHorizontal size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function RoomPage() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const token = params.token;
  const hostMode = search.get("host") === "1";
  const room = useVoiceRoom(token);

  const [name, setName] = useState("");
  const [previewRoom, setPreviewRoom] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [picker, setPicker] = useState(false);
  const [chat, setChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const [manageId, setManageId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioVersion, setAudioVersion] = useState(0);
  const [inviteFallback, setInviteFallback] = useState("");
  const [sending, setSending] = useState(false);
  const sendPending = useRef(false);
  const lastMessage = useRef("");
  const [diagnostics, setDiagnostics] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);

  const mySpeaking = useSpeaking(room.localStream, room.micOn);
  const onBlocked = useCallback(() => setAudioBlocked(true), []);

  useEffect(() => {
    setName(storage.get("gutenlib.voice.name") || storage.get("gutenlib.voice." + (hostMode ? "hostName" : "guestName") + "." + token));
    setPreviewRoom(storage.get("gutenlib.voice.roomName." + token));
    if (!token) return;
    const request = new AbortController();

    async function loadRoomPreview() {
      // 1. Try same-origin /rooms/:token
      try {
        const res = await fetch("/rooms/" + encodeURIComponent(token), { signal: request.signal });
        if (res.ok) {
          const data = await res.json();
          setPreviewRoom(data.roomName || "غرفة قراءة");
          return;
        }
      } catch {}

      // 2. Try same-origin /api/rooms/:token
      try {
        const res = await fetch("/api/rooms/" + encodeURIComponent(token), { signal: request.signal });
        if (res.ok) {
          const data = await res.json();
          setPreviewRoom(data.roomName || "غرفة قراءة");
          return;
        }
      } catch {}

      // 3. Fallback to direct voice server URL
      try {
        const serverUrl = getVoiceServerUrl();
        const res = await fetch(serverUrl + "/rooms/" + encodeURIComponent(token), { signal: request.signal });
        if (res.ok) {
          const data = await res.json();
          setPreviewRoom(data.roomName || "غرفة قراءة");
          return;
        }
      } catch {}

      if (!request.signal.aborted) {
        setPreviewError("تعذر العثور على الغرفة. تحقق من الرابط أو من اتصالك.");
      }
    }

    void loadRoomPreview();
    return () => request.abort();
  }, [token, hostMode]);

  useEffect(() => {
    const message = room.messages.at(-1);
    if (message && message.id !== lastMessage.current) {
      if (lastMessage.current && !chat && message.peerId !== room.selfId) setUnread((n) => n + 1);
      lastMessage.current = message.id;
    }
  }, [room.messages, chat, room.selfId]);

  useEffect(() => {
    if (chat) {
      setUnread(0);
      listEnd.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat, room.messages.length]);

  const copyInvite = async () => {
    const url = window.location.origin + "/room/" + token;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setInviteFallback(url);
    }
  };

  const unlockAudio = () => {
    setAudioEnabled(true);
    setAudioBlocked(false);
    setAudioVersion((n) => n + 1);
    document.querySelectorAll<HTMLAudioElement>("audio[data-voice-audio]").forEach((audio) => {
      audio.muted = false;
      void audio.play().catch(onBlocked);
    });
  };

  const isHost = room.role === "host";
  const canSpeak = room.role !== "listener";
  const participants = Object.values(room.peers);
  const target = manageId && room.peers[manageId];
  const statusLabel = room.phase === "connected" ? "متصل" : room.phase === "reconnecting" ? "إعادة الاتصال" : "غير متصل";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || sendPending.current) return;
    sendPending.current = true;
    setSending(true);
    try {
      if (await room.sendMessage(value)) setDraft((current) => (current === value ? "" : current));
    } finally {
      sendPending.current = false;
      setSending(false);
    }
  }

  function enter(e: React.FormEvent) {
    e.preventDefault();
    setPreviewError("");
    room.join(name.trim(), hostMode);
  }

  return (
    <main className="voice-room" dir="rtl">
      <div className="voice-room__topline">
        <Link href="/" className="voice-wordmark">
          Guten<span>lib</span>
        </Link>
        <span className="voice-room__product">/ جلسات القراءة</span>
        <Link href="/voice" className="quiet-link">
          <ArrowLeft size={16} /> غرفة جديدة
        </Link>
      </div>

      {room.phase !== "connected" && room.phase !== "reconnecting" ? (
        <section className="join-layout">
          <div className="join-intro">
            <span className="eyebrow">
              <Headphones size={15} /> جلسة صوتية
            </span>
            <h1>{previewRoom || "غرفة قراءة"}</h1>
            <p>الكتاب والصوت والمحادثة في مكان واحد. ستدخل مستمعًا، ويمكنك تشغيل الميكروفون عندما يسمح لك المضيف.</p>
            <div className="join-point">
              <Users size={18} /> ادخل باسمك فقط، دون حساب.
            </div>
            <div className="join-point">
              <MicOff size={18} /> يبدأ الميكروفون مغلقًا دائمًا.
            </div>
          </div>
          <form className="join-form" onSubmit={enter}>
            <span className="card-kicker">{hostMode ? "دخول المضيف" : "الانضمام للجلسة"}</span>
            <h2>{room.phase === "ended" ? "انتهت الجلسة" : room.phase === "left" ? "غادرت الجلسة" : "جاهز للانضمام؟"}</h2>
            <label htmlFor="join-name">اسمك في الغرفة</label>
            <input
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              autoComplete="name"
              placeholder="اكتب اسمك"
              disabled={room.phase === "ended"}
            />
            <button
              className="primary-action"
              disabled={room.phase === "joining" || room.phase === "ended" || !name.trim()}
            >
              {room.phase === "joining" ? "جاري الدخول…" : room.phase === "left" ? "العودة للغرفة" : "دخول الغرفة"}
              <ArrowLeft size={17} />
            </button>
            {(room.error || previewError) && (
              <p className="voice-error" role="alert">
                {room.error || previewError}
              </p>
            )}
            {room.phase === "ended" && (
              <Link className="voice-btn" href="/voice">
                إنشاء غرفة جديدة
              </Link>
            )}
            <p className="join-form__foot">مشاركة الرابط لا تمنح صلاحيات المضيف.</p>
          </form>
        </section>
      ) : (
        <>
          <header className="room-heading">
            <div>
              <span className="room-heading__eyebrow">
                <span className={"status-dot" + (room.phase === "reconnecting" ? " is-waiting" : "")} /> {statusLabel} · {participants.length + 1} مشاركين
              </span>
              <h1>{room.roomName}</h1>
              <p>
                {isHost ? "أنت المضيف" : canSpeak ? "أنت متحدث" : "أنت مستمع"}
                {!room.hostConnected && !isHost ? " · المضيف غير متصل مؤقتًا" : ""}
              </p>
            </div>
            <div className="room-heading__actions">
              <button className="voice-btn" onClick={copyInvite}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? "نُسخ الرابط" : "نسخ الدعوة"}
              </button>
              <button
                className={"voice-btn icon-only" + (chat ? " primary" : "")}
                aria-label={chat ? "إغلاق المحادثة" : "فتح المحادثة"}
                title="المحادثة"
                onClick={() => {
                  setChat((v) => !v);
                  setUnread(0);
                }}
              >
                <MessageCircle size={20} />
                {unread > 0 && <span className="unread-dot" />}
              </button>
            </div>
          </header>

          {room.error && (
            <div className="room-alert" role="alert">
              <span>{room.error}</span>
              <button className="icon-only" aria-label="إخفاء التنبيه" onClick={room.dismissError}>
                <X size={18} />
              </button>
            </div>
          )}
          {inviteFallback && (
            <div className="room-alert">
              <label htmlFor="invite-copy">انسخ رابط الدعوة</label>
              <input id="invite-copy" readOnly dir="ltr" value={inviteFallback} onFocus={(e) => e.target.select()} />
              <button className="icon-only" aria-label="إغلاق" onClick={() => setInviteFallback("")}>
                <X size={18} />
              </button>
            </div>
          )}
          {audioBlocked && (
            <button className="audio-unlock" onClick={unlockAudio}>
              <Volume2 size={18} /> تشغيل صوت المشاركين
            </button>
          )}

          <div className="room-layout">
            <div className="room-grid">
              <section className="reading-area">
                <div className="section-head">
                  <div>
                    <span className="section-label">مساحة القراءة</span>
                    <h2>{room.book?.title || "لا يوجد كتاب بعد"}</h2>
                    {room.book?.author && <p>{room.book.author}</p>}
                  </div>
                  {isHost && (
                    <div className="section-head__actions">
                      <button className="voice-btn" onClick={() => setPicker(true)}>
                        <Search size={17} />
                        {room.book ? "تغيير الكتاب" : "اختيار كتاب"}
                      </button>
                      {room.book && (
                        <button
                          className="voice-btn icon-only"
                          aria-label="إزالة الكتاب"
                          title="إزالة الكتاب"
                          onClick={() => room.hostAction("host-clear-book")}
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {room.book ? (
                  <div className="reader-surface">
                    <div className="reader-content">
                      {room.book.source === "abl" ? (
                        <RoomArabicReader
                          bookId={room.book.id}
                          page={room.reading.kind === "page" ? room.reading.index : 1}
                          onPageChange={(page) => room.hostAction("host-set-page", { page })}
                          isHost={isHost}
                          highlightText={room.highlight}
                          bookTitle={room.book.title}
                          bookAuthor={room.book.author}
                        />
                      ) : (
                        <RoomReader
                          bookId={room.book.id}
                          chunkIndex={room.reading.kind === "chunk" ? room.reading.index : 0}
                          onChunkChange={(chunkIndex) => {
                            if (isHost) room.hostAction("host-set-chunk", { chunkIndex });
                          }}
                          isHost={isHost}
                          highlightText={room.highlight}
                          bookTitle={room.book.title}
                          bookAuthor={room.book.author}
                        />
                      )}
                    </div>
                    {isHost && (
                      <div className="highlight-tools">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="voice-btn"
                            onClick={() => {
                              const text = window.getSelection()?.toString().trim();
                              if (text) room.hostAction("host-set-highlight", { text: text.slice(0, 1200) });
                            }}
                          >
                            <Highlighter size={15} />
                            تمييز النص المحدد
                          </button>
                          {room.highlight && (
                            <button
                              type="button"
                              className="voice-btn"
                              onClick={() => room.hostAction("host-clear-highlight")}
                            >
                              <X size={15} />
                              إزالة التمييز
                            </button>
                          )}
                        </div>
                        {room.highlight && (
                          <span className="text-xs text-stone-400 max-w-xs truncate" title={room.highlight}>
                            النص المميّز: &quot;{room.highlight}&quot;
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-book">
                    <span className="empty-book__icon">
                      <BookOpen size={30} />
                    </span>
                    <h3>الكتاب ينتظر اختيارًا</h3>
                    <p>{isHost ? "اختَر كتابًا من المكتبة لتبدأ القراءة مع المجموعة." : "سيظهر الكتاب هنا عندما يختاره المضيف."}</p>
                    {isHost && (
                      <button className="voice-btn primary" onClick={() => setPicker(true)}>
                        <Search size={17} /> استعراض الكتب
                      </button>
                    )}
                  </div>
                )}
              </section>

              <aside className="people-area">
                <div className="section-head">
                  <div>
                    <span className="section-label">في الغرفة</span>
                    <h2>
                      المشاركون <span className="count">{participants.length + 1}</span>
                    </h2>
                  </div>
                </div>
                <div className="participant-list">
                  <div className="participant">
                    <Avatar name={name || "أنت"} speaking={mySpeaking} />
                    <div className="participant__name">
                      <strong>
                        {name || "أنت"} <span className="self-label">أنت</span>
                      </strong>
                      <span>{isHost ? "المضيف" : canSpeak ? "متحدث" : "مستمع"}</span>
                    </div>
                    <div className="participant__icons">{room.micOn ? <Mic size={16} /> : <MicOff size={16} />}</div>
                  </div>
                  {participants.map((peer) => (
                    <Participant
                      key={peer.peerId}
                      peer={peer}
                      stream={room.streams[peer.peerId] ?? null}
                      isHost={isHost}
                      onManage={() => setManageId(peer.peerId)}
                    />
                  ))}
                </div>
                <div className="people-area__foot">
                  {participants.length === 0 ? "شارك رابط الدعوة ليظهر المشاركون هنا." : "اختر مشاركًا لإدارة صلاحيته."}
                </div>
                <button className="diagnostics-toggle" onClick={() => setDiagnostics((v) => !v)} aria-expanded={diagnostics}>
                  {diagnostics ? "إخفاء حالة الاتصال" : "حالة الاتصال الصوتي"}
                </button>
                {diagnostics && (
                  <div className="diagnostics">
                    {!HAS_TURN && <p>لا يوجد TURN في الإعدادات. قد يفشل الصوت بين شبكات مختلفة.</p>}
                    {participants.map((peer) => (
                      <div key={peer.peerId}>
                        <strong>{peer.displayName}</strong>
                        <span>
                          {room.health[peer.peerId]?.connection ?? "جارٍ الربط"} · ICE {room.health[peer.peerId]?.ice ?? "جديد"}
                          {room.health[peer.peerId]?.candidateType ? ` (${room.health[peer.peerId].candidateType})` : ""} ·{" "}
                          {room.health[peer.peerId]?.receiving ? "صوت وارد" : "بانتظار الصوت"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </div>

            {chat && (
              <>
                <div className="chat-backdrop" onClick={() => setChat(false)} aria-hidden="true" />
                <aside className="chat-drawer" aria-label="المحادثة النصية">
                  <div className="chat-drawer__header">
                    <h3>
                      <MessageCircle size={18} /> المحادثة
                    </h3>
                    <button className="voice-btn icon-only" aria-label="إغلاق المحادثة" onClick={() => setChat(false)}>
                      <X size={18} />
                    </button>
                  </div>
                  <div className="chat-list">
                    {room.messages.length ? (
                      room.messages.map((message) => (
                        <div key={message.id} className={"chat-item" + (message.peerId === room.selfId ? " is-mine" : "")}>
                          <div className="chat-item__meta">
                            <strong>{message.peerId === room.selfId ? "أنت" : message.name}</strong>
                            <time>
                              {new Date(message.ts).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                            </time>
                          </div>
                          <p>{message.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="muted">لا توجد رسائل بعد.</p>
                    )}
                    <div ref={listEnd} />
                  </div>
                  <form className="chat-compose" onSubmit={send}>
                    <input
                      aria-label="رسالتك"
                      value={draft}
                      maxLength={400}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="اكتب رسالة…"
                    />
                    <button
                      className="voice-btn primary"
                      aria-label="إرسال الرسالة"
                      disabled={!draft.trim() || sending || room.phase !== "connected"}
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </aside>
              </>
            )}
          </div>

          <footer className="call-bar">
            <div className="call-bar__identity">
              <Avatar name={name || "أنت"} speaking={mySpeaking} />
              <div>
                <strong>{name || "أنت"}</strong>
                <span>{room.micOn ? "الميكروفون يعمل" : "الميكروفون مغلق"}</span>
              </div>
            </div>
            <div className="call-bar__controls">
              {canSpeak ? (
                <button
                  className={"control-btn" + (room.micOn ? " is-live" : "")}
                  disabled={room.micBusy || room.phase !== "connected"}
                  onClick={() => void room.toggleMic()}
                  aria-pressed={room.micOn}
                  aria-label={room.micOn ? "إغلاق الميكروفون" : "تشغيل الميكروفون"}
                  title={room.micOn ? "إغلاق الميكروفون" : "تشغيل الميكروفون"}
                >
                  {room.micOn ? <Mic size={19} /> : <MicOff size={19} />}
                  <span>{room.micBusy ? "جارٍ التشغيل" : room.micOn ? "إغلاق الميكروفون" : "تشغيل الميكروفون"}</span>
                </button>
              ) : (
                <button
                  className={"control-btn" + (room.handRaised ? " is-raised" : "")}
                  onClick={room.raiseHand}
                  disabled={room.phase !== "connected"}
                  aria-label={room.handRaised ? "إلغاء طلب الميكروفون" : "طلب الميكروفون"}
                  aria-pressed={room.handRaised}
                >
                  <Hand size={19} />
                  <span>{room.handRaised ? "إلغاء الطلب" : "طلب الميكروفون"}</span>
                </button>
              )}
              <button
                className={"control-btn" + (chat ? " is-live" : "")}
                aria-label={chat ? "إغلاق المحادثة" : "فتح المحادثة"}
                onClick={() => {
                  setChat((v) => !v);
                  setUnread(0);
                }}
              >
                <MessageCircle size={19} />
                <span>المحادثة{unread > 0 ? " · " + unread : ""}</span>
              </button>
              <button
                className="control-btn"
                aria-label={audioEnabled ? "كتم صوت المشاركين" : "تشغيل صوت المشاركين"}
                aria-pressed={audioEnabled}
                onClick={() => {
                  if (audioEnabled) setAudioEnabled(false);
                  else unlockAudio();
                }}
              >
                {audioEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
                <span>{audioEnabled ? "كتم الصوت" : "تشغيل الصوت"}</span>
              </button>
            </div>
            <div className="call-bar__end">
              <button className="leave-btn" onClick={room.leave}>
                <LogOut size={18} /> مغادرة
              </button>
              {isHost && (
                <button
                  className="end-link"
                  onClick={() => {
                    if (window.confirm("إنهاء الغرفة للجميع؟")) room.hostAction("host-end-room");
                  }}
                >
                  إنهاء للجميع
                </button>
              )}
            </div>
          </footer>

          <div className="audio-sinks" aria-hidden="true">
            {Object.entries(room.streams).map(([id, stream]) => (
              <RemoteAudio key={id} stream={stream} audible={audioEnabled} version={audioVersion} blocked={onBlocked} />
            ))}
          </div>

          {picker && <BookPicker onClose={() => setPicker(false)} select={(book) => room.hostAction("host-set-book", { book })} />}

          {target && (
            <Modal title={target.displayName} onClose={() => setManageId(null)}>
              <p className="muted manage-role">
                {target.role === "speaker" ? "متحدث" : "مستمع"}
                {target.handRaised ? " · طلب الميكروفون" : ""}
              </p>
              <div className="manage-actions">
                {target.role === "listener" ? (
                  <button
                    className="voice-btn"
                    onClick={() => {
                      room.hostAction("host-grant-mic", { targetPeerId: target.peerId });
                      setManageId(null);
                    }}
                  >
                    <Shield size={18} /> منح الميكروفون
                  </button>
                ) : (
                  <button
                    className="voice-btn"
                    onClick={() => {
                      room.hostAction("host-revoke-mic", { targetPeerId: target.peerId });
                      setManageId(null);
                    }}
                  >
                    <ShieldOff size={18} /> سحب الميكروفون
                  </button>
                )}
                <button
                  className="voice-btn danger"
                  onClick={() => {
                    room.hostAction("host-kick", { targetPeerId: target.peerId });
                    setManageId(null);
                  }}
                >
                  <UserRoundX size={18} /> إزالة من الغرفة
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </main>
  );
}
