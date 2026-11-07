"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Headphones,
  Highlighter,
  Quote,
  Search,
  Volume2,
  X,
} from "lucide-react";
import { useVoiceRoom, storage } from "@/lib/voice/useVoiceRoom";
import type { LayoutMode } from "@/lib/voice/types";
import { RoomReader } from "@/components/RoomReader";
import { RoomArabicReader } from "@/components/RoomArabicReader";
import { BookPicker, RemoteAudio, useSpeaking } from "@/components/voice/RoomTools";
import { RoomHeader } from "@/components/voice/RoomHeader";
import { RoomCallRail } from "@/components/voice/RoomCallRail";
import { RoomStage } from "@/components/voice/RoomStage";
import { RoomMarginalia } from "@/components/voice/RoomMarginalia";
import { RoomLexiconPopover } from "@/components/voice/RoomLexiconPopover";
import { AudioDeviceModal } from "@/components/voice/AudioDeviceModal";
import { addNote } from "@/lib/library/db";
import { ambientSound } from "@/lib/voice/ambientAudio";
import { getVoiceServerUrl } from "@/lib/voice/config";

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
  const [marginaliaOpen, setMarginaliaOpen] = useState(false);
  const [lexiconOpen, setLexiconOpen] = useState(false);
  const [lexiconWord, setLexiconWord] = useState("");
  const [mobileStageOpen, setMobileStageOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioVersion, setAudioVersion] = useState(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split");
  const [selectedText, setSelectedText] = useState("");
  const [preferredAudioDevice, setPreferredAudioDevice] = useState("");
  const [spatialAudio, setSpatialAudio] = useState(false);

  const lastMessage = useRef("");
  const mySpeaking = useSpeaking(room.localStream, room.micOn);
  const onBlocked = useCallback(() => setAudioBlocked(true), []);

  // Ambient sound speech auto-ducking
  useEffect(() => {
    ambientSound.setDucked(mySpeaking);
  }, [mySpeaking]);

  useEffect(() => {
    setName(
      storage.get("gutenlib.voice.name") ||
        storage.get("gutenlib.voice." + (hostMode ? "hostName" : "guestName") + "." + token)
    );
    setPreviewRoom(storage.get("gutenlib.voice.roomName." + token));
    setSpatialAudio(storage.get("gutenlib.voice.spatialAudio") === "1");
    if (!token) return;
    const request = new AbortController();

    async function loadRoomPreview() {
      // 1. Same-origin /rooms/:token
      try {
        const res = await fetch("/rooms/" + encodeURIComponent(token), { signal: request.signal });
        if (res.ok) {
          const data = await res.json();
          setPreviewRoom(data.roomName || "غرفة قراءة");
          return;
        }
      } catch {}

      // 2. Same-origin /api/rooms/:token
      try {
        const res = await fetch("/api/rooms/" + encodeURIComponent(token), { signal: request.signal });
        if (res.ok) {
          const data = await res.json();
          setPreviewRoom(data.roomName || "غرفة قراءة");
          return;
        }
      } catch {}

      // 3. Direct voice server
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

  // Unread count
  useEffect(() => {
    const message = room.messages.at(-1);
    if (message && message.id !== lastMessage.current) {
      if (lastMessage.current && !marginaliaOpen && message.peerId !== room.selfId) {
        setUnread((n) => n + 1);
      }
      lastMessage.current = message.id;
    }
  }, [room.messages, marginaliaOpen, room.selfId]);

  useEffect(() => {
    if (marginaliaOpen) {
      setUnread(0);
    }
  }, [marginaliaOpen]);

  // Text selection tracking inside reader for quotations & highlights
  useEffect(() => {
    const handleSelection = () => {
      const text = window.getSelection()?.toString().trim();
      if (text && text.length >= 1 && text.length < 800) {
        setSelectedText(text);
      } else {
        setSelectedText("");
      }
    };
    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

  const isHost = room.role === "host";
  const canSpeak = room.role !== "listener";
  const participants = Object.values(room.peers);

  const activeReaderId = room.activeReaderId || room.hostId;
  const isReader = isHost || (Boolean(room.selfId) && room.selfId === activeReaderId);
  const activeReaderName =
    activeReaderId === room.selfId
      ? "أنت"
      : room.peers[activeReaderId]?.displayName || (activeReaderId === room.hostId ? "المضيف" : undefined);

  // Keyboard shortcuts (M to mute/unmute, H to raise hand, C to toggle notes)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "m" || e.key === "M") {
        if (canSpeak) {
          e.preventDefault();
          void room.toggleMic(preferredAudioDevice);
        }
      } else if (e.key === "h" || e.key === "H") {
        if (!canSpeak) {
          e.preventDefault();
          room.raiseHand();
        }
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        setMarginaliaOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canSpeak, room, preferredAudioDevice]);

  const unlockAudio = () => {
    setAudioEnabled(true);
    setAudioBlocked(false);
    setAudioVersion((n) => n + 1);
    document.querySelectorAll<HTMLAudioElement>("audio[data-voice-audio]").forEach((audio) => {
      audio.muted = false;
      void audio.play().catch(onBlocked);
    });
  };

  const handleToggleSpatialAudio = () => {
    setSpatialAudio((prev) => {
      const next = !prev;
      storage.set("gutenlib.voice.spatialAudio", next ? "1" : "0");
      return next;
    });
  };

  const handleQuoteSelection = () => {
    if (!selectedText) return;
    const pageLabel =
      room.reading.kind === "page"
        ? `الصفحة ${room.reading.index}`
        : `المقطع ${room.reading.index + 1}`;
    const citation = `${room.book?.title ?? "الكتاب"} · ${pageLabel}`;
    void room.sendQuote({ text: selectedText, citation });
    setSelectedText("");
    setMarginaliaOpen(true);
  };

  const handleOpenLexicon = (word?: string) => {
    const clean = (word || selectedText || "").trim();
    if (clean) {
      setLexiconWord(clean);
      setLexiconOpen(true);
    } else {
      setLexiconWord("عسجد");
      setLexiconOpen(true);
    }
  };

  const handleSaveLexiconNote = async (
    word: string,
    root: string,
    definition: string,
    source: string
  ) => {
    // 1. Post to live marginalia as quote
    void room.sendQuote({
      text: definition,
      citation: `${room.book?.title ?? "الكتاب"} · المعجم التراثي (${source})`,
    });
    // 2. Persist to personal library IndexedDB
    if (room.book) {
      try {
        const scope = room.book.source === "abl" ? "arabic" : "english";
        const pageNum = room.reading.kind === "page" ? room.reading.index : 1;
        await addNote(
          scope,
          String(room.book.id),
          pageNum,
          `[فائدة معجمية]: ${definition}`,
          `معجم ${source} — جذر [${root}]`
        );
      } catch (err) {
        console.warn("Failed to persist lexicon note to indexedDB:", err);
      }
    }
  };

  function enter(e: React.FormEvent) {
    e.preventDefault();
    setPreviewError("");
    room.join(name.trim(), hostMode);
  }

  return (
    <main className="voice-room" dir="rtl">
      {room.phase !== "connected" && room.phase !== "reconnecting" ? (
        <div className="room-join-wrap">
          <form className="room-join-card" onSubmit={enter}>
            <span className="card-kicker">{hostMode ? "دخول القارئ المضيف" : "الانضمام لحلقة القراءة"}</span>
            <h1>{previewRoom || "غرفة قراءة"}</h1>
            <p className="room-join-sub">
              حلقة قراءة صوتية متزامنة مع صفحات الكتاب. يبدأ الميكروفون مكتومًا وتستمع للقارئ مباشرة.
            </p>

            <label htmlFor="join-name">اسمك في الجلسة</label>
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
              <span>{room.phase === "joining" ? "جاري الدخول…" : room.phase === "left" ? "العودة للجلسة" : "دخول الجلسة"}</span>
              <ArrowLeft size={16} strokeWidth={1.5} />
            </button>

            {(room.error || previewError) && (
              <p className="form-error" role="alert">
                {room.error || previewError}
              </p>
            )}

            {room.phase === "ended" && (
              <Link className="voice-btn" href="/voice" style={{ marginTop: 12, display: "inline-flex" }}>
                إنشاء جلسة جديدة
              </Link>
            )}

          </form>
        </div>
      ) : (
        <>
          {/* Folio Running Head */}
          <RoomHeader
            roomName={room.roomName}
            book={room.book}
            reading={room.reading}
            token={token}
            isHost={isHost}
            participantCount={participants.length + 1}
            layoutMode={layoutMode}
            onToggleLayout={() => setLayoutMode((m) => (m === "split" ? "focus" : "split"))}
            onOpenStage={() => setMobileStageOpen(true)}
            onOpenBookPicker={() => setPicker(true)}
            activeReaderName={activeReaderName}
          />

          {room.error && (
            <div className="room-alert" role="alert">
              <span>{room.error}</span>
              <button
                type="button"
                className="folio-action-btn"
                onClick={room.dismissError}
                aria-label="إخفاء التنبيه"
              >
                <X size={15} strokeWidth={1.5} />
              </button>
            </div>
          )}

          {audioBlocked && (
            <button type="button" className="audio-unlock" onClick={unlockAudio}>
              <Volume2 size={16} strokeWidth={1.5} /> تشغيل صوت القراءة للحاضرين
            </button>
          )}

          {/* Main Dual-Pane Arena */}
          <div className="room-arena">
            <section className="room-reader-pane">
              {room.book ? (
                <div className="reader-surface">
                  <div className="reader-content">
                    {room.book.source === "abl" ? (
                      <RoomArabicReader
                        bookId={room.book.id}
                        page={room.reading.kind === "page" ? room.reading.index : 1}
                        onPageChange={(page) => room.setReadingPage(page)}
                        isHost={isReader}
                        highlightText={room.highlight}
                        bookTitle={room.book.title}
                        bookAuthor={room.book.author}
                      />
                    ) : (
                      <RoomReader
                        bookId={room.book.id}
                        chunkIndex={room.reading.kind === "chunk" ? room.reading.index : 0}
                        onChunkChange={(chunkIndex) => {
                          if (isReader) room.setReadingChunk(chunkIndex);
                        }}
                        isHost={isReader}
                        highlightText={room.highlight}
                        bookTitle={room.book.title}
                        bookAuthor={room.book.author}
                      />
                    )}
                  </div>

                  {/* Contextual Text Selection Action Bar */}
                  {selectedText && (
                    <div
                      className="reader-selection-bar"
                      role="toolbar"
                      aria-label="أدوات النص المحدد"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div className="selection-actions">
                        {room.book?.source === "abl" && (
                          <button
                            type="button"
                            className="selection-btn"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleOpenLexicon(selectedText)}
                            title="البحث عن المفردة في لسان العرب ومقاييس اللغة"
                          >
                            <BookMarked size={13} strokeWidth={1.5} />
                            المعجم التراثي
                          </button>
                        )}

                        <button
                          type="button"
                          className="selection-btn"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleQuoteSelection}
                          title="إرسال النص المحدد كاقتباس مع رقم الصفحة للملاحظات"
                        >
                          <Quote size={13} strokeWidth={1.5} />
                          اقتباس في الملاحظات
                        </button>

                        {isHost && (
                          <button
                            type="button"
                            className="selection-btn"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              room.hostAction("host-set-highlight", {
                                text: selectedText.slice(0, 1200),
                              });
                              setSelectedText("");
                            }}
                            title="تمييز النص المحدد لجميع المستمعين"
                          >
                            <Highlighter size={13} strokeWidth={1.5} />
                            تمييز للجميع
                          </button>
                        )}
                      </div>

                      <span className="selection-preview" title={selectedText}>
                        &quot;{selectedText}&quot;
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-book-state">
                  <span className="empty-book-icon">
                    <BookOpen size={24} strokeWidth={1.5} />
                  </span>
                  <h3>الكتاب بانتظار الاختيار</h3>
                  <p>
                    {isHost
                      ? "اختَر كتابًا من التراث العربي أو الكلاسيكيات العالمية لتبدأ القراءة الجماعية."
                      : "سيظهر نص الكتاب هنا تلقائيًا فور اختياره من القارئ المضيف."}
                  </p>
                  {isHost && (
                    <button
                      type="button"
                      className="primary-action"
                      style={{ maxWidth: 220, marginTop: 16 }}
                      onClick={() => setPicker(true)}
                    >
                      <Search size={15} strokeWidth={1.5} />
                      <span>اختيار كتاب للجلسة</span>
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Reading Circle Stage Sidebar (Hidden in focus mode) */}
            {layoutMode === "split" && (
              <RoomStage
                selfId={room.selfId}
                selfName={name || "أنت"}
                selfRole={room.role}
                selfMicOn={room.micOn}
                selfStream={room.localStream}
                peers={room.peers}
                streams={room.streams}
                health={room.health}
                isHost={isHost}
                activeReaderId={room.activeReaderId}
                batonQueue={room.batonQueue}
                onGrantMic={(peerId) => room.hostAction("host-grant-mic", { targetPeerId: peerId })}
                onRevokeMic={(peerId) => room.hostAction("host-revoke-mic", { targetPeerId: peerId })}
                onKick={(peerId) => room.hostAction("host-kick", { targetPeerId: peerId })}
                onPassBaton={(peerId) => room.passBaton(peerId)}
                onRequestBaton={() => room.requestBaton()}
                onCancelRequestBaton={() => room.cancelRequestBaton()}
              />
            )}
          </div>

          {/* Grounded Call Rail */}
          <RoomCallRail
            displayName={name || "أنت"}
            isHost={isHost}
            canSpeak={canSpeak}
            micOn={room.micOn}
            micBusy={room.micBusy}
            handRaised={room.handRaised}
            marginaliaOpen={marginaliaOpen}
            stageOpen={mobileStageOpen}
            lexiconOpen={lexiconOpen}
            unreadCount={unread}
            audioAudible={audioEnabled}
            onToggleMic={() => void room.toggleMic(preferredAudioDevice)}
            onRaiseHand={room.raiseHand}
            onToggleMarginalia={() => setMarginaliaOpen((v) => !v)}
            onToggleStage={() => setMobileStageOpen((v) => !v)}
            onOpenLexicon={room.book?.source === "abl" ? () => handleOpenLexicon() : undefined}
            onToggleAudible={() => {
              if (audioEnabled) setAudioEnabled(false);
              else unlockAudio();
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onLeave={room.leave}
            onEndRoom={
              isHost
                ? () => {
                    if (window.confirm("إنهاء الجلسة لجميع الحاضرين؟")) {
                      room.hostAction("host-end-room");
                    }
                  }
                : undefined
            }
          />

          {/* Mobile Reading Circle Stage Sheet (< 900px) */}
          {mobileStageOpen && (
            <RoomStage
              selfId={room.selfId}
              selfName={name || "أنت"}
              selfRole={room.role}
              selfMicOn={room.micOn}
              selfStream={room.localStream}
              peers={room.peers}
              streams={room.streams}
              health={room.health}
              isHost={isHost}
              activeReaderId={room.activeReaderId}
              batonQueue={room.batonQueue}
              onGrantMic={(peerId) => room.hostAction("host-grant-mic", { targetPeerId: peerId })}
              onRevokeMic={(peerId) => room.hostAction("host-revoke-mic", { targetPeerId: peerId })}
              onKick={(peerId) => room.hostAction("host-kick", { targetPeerId: peerId })}
              onPassBaton={(peerId) => room.passBaton(peerId)}
              onRequestBaton={() => room.requestBaton()}
              onCancelRequestBaton={() => room.cancelRequestBaton()}
              isMobileOpen={true}
              onCloseMobile={() => setMobileStageOpen(false)}
            />
          )}

          {/* Synchronous Marginalia Drawer */}
          <RoomMarginalia
            messages={room.messages}
            selfId={room.selfId}
            isOpen={marginaliaOpen}
            onClose={() => setMarginaliaOpen(false)}
            onSendMessage={room.sendMessage}
            roomName={room.roomName}
            book={room.book}
            participantCount={participants.length + 1}
          />

          {/* Audio Device & Procedural Ambience Modal */}
          <AudioDeviceModal
            isOpen={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            localStream={room.localStream}
            onSelectDevice={(id) => setPreferredAudioDevice(id)}
            spatialAudio={spatialAudio}
            onToggleSpatialAudio={handleToggleSpatialAudio}
          />

          {/* Audio Sinks for WebRTC Streams with Spatial Circle Panning */}
          <div className="audio-sinks" aria-hidden="true">
            {(() => {
              const entries = Object.entries(room.streams);
              const total = entries.length;
              return entries.map(([id, stream], idx) => {
                let pan = 0;
                if (total === 2) {
                  pan = idx === 0 ? -0.4 : 0.4;
                } else if (total > 2) {
                  pan = -0.65 + (1.3 * idx) / (total - 1);
                }
                return (
                  <RemoteAudio
                    key={id}
                    stream={stream}
                    audible={audioEnabled}
                    version={audioVersion}
                    blocked={onBlocked}
                    pan={pan}
                    spatial={spatialAudio}
                  />
                );
              });
            })()}
          </div>

          {/* Book Picker Modal */}
          {picker && (
            <BookPicker
              onClose={() => setPicker(false)}
              select={(book) => room.hostAction("host-set-book", { book })}
            />
          )}
        </>
      )}

      {/* Instant Classical Lexicon Popover Card (Accessible only for Arabic books) */}
      {room.book?.source === "abl" && (
        <RoomLexiconPopover
          initialWord={lexiconWord}
          isOpen={lexiconOpen}
          onClose={() => setLexiconOpen(false)}
          onSaveToNotes={handleSaveLexiconNote}
          onShareToRoom={room.sendMessage}
        />
      )}
    </main>
  );
}
