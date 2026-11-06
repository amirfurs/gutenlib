"use client";

import { Feather, Hand, MoreHorizontal, Shield, ShieldOff, UserRoundX, Users, X } from "lucide-react";
import type { PeerInfo } from "@/lib/voice/types";
import { useSpeaking } from "./RoomTools";
import { useState } from "react";

interface RoomStageProps {
  selfId: string;
  selfName: string;
  selfRole: string;
  selfMicOn: boolean;
  selfStream: MediaStream | null;
  peers: Record<string, PeerInfo>;
  streams: Record<string, MediaStream>;
  health: Record<string, { connection?: string; ice?: string; receiving?: boolean }>;
  isHost: boolean;
  activeReaderId?: string;
  batonQueue?: string[];
  onGrantMic: (peerId: string) => void;
  onRevokeMic: (peerId: string) => void;
  onKick: (peerId: string) => void;
  onPassBaton?: (peerId: string) => void;
  onRequestBaton?: () => void;
  onCancelRequestBaton?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

function HairlineWaveform({ speaking }: { speaking: boolean }) {
  return (
    <span className={"hairline-wave" + (speaking ? " is-live" : "")} aria-hidden="true" title={speaking ? "يتحدث الآن" : undefined}>
      <span className="wave-bar" />
      <span className="wave-bar" />
      <span className="wave-bar" />
    </span>
  );
}

export function RoomStage({
  selfId,
  selfName,
  selfRole,
  selfMicOn,
  selfStream,
  peers,
  streams,
  health,
  isHost,
  activeReaderId,
  batonQueue = [],
  onGrantMic,
  onRevokeMic,
  onKick,
  onPassBaton,
  onRequestBaton,
  onCancelRequestBaton,
  isMobileOpen = false,
  onCloseMobile,
}: RoomStageProps) {
  const [managePeerId, setManagePeerId] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const selfSpeaking = useSpeaking(selfStream, selfMicOn);
  const participantList = Object.values(peers);

  // Group into speakers and listeners
  const speakers = participantList.filter((p) => p.role === "host" || p.role === "speaker");
  const listeners = participantList.filter((p) => p.role === "listener");
  const handRaisers = participantList.filter((p) => p.handRaised && p.role === "listener");

  const selfIsSpeaker = selfRole === "host" || selfRole === "speaker";
  const currentReaderId = activeReaderId || (isHost ? selfId : participantList.find((p) => p.role === "host")?.peerId);
  const selfIsReader = currentReaderId === selfId;
  const selfHasRequestedBaton = batonQueue.includes(selfId);

  const stageContent = (
    <aside
      className={"room-stage" + (isMobileOpen ? " is-mobile-sheet" : "")}
      aria-label="حلقة القراءة والمشاركون"
      dir="rtl"
    >
      <div className="stage-section-head">
        <div className="stage-title-wrap">
          <Users size={15} strokeWidth={1.5} className="stage-icon" />
          <h2 className="stage-title">حلقة القراءة</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="stage-count">{participantList.length + 1}</span>
          {isMobileOpen && onCloseMobile && (
            <button
              type="button"
              className="stage-close-btn md:hidden"
              onClick={onCloseMobile}
              aria-label="إغلاق الحلقة"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Host Baton Queue Banner */}
      {isHost && batonQueue.length > 0 && (
        <div className="stage-baton-queue">
          <span className="stage-queue-kicker">
            <Feather size={13} strokeWidth={1.5} /> طلبات المنبر للقراءة ({batonQueue.length})
          </span>
          {batonQueue.map((requesterId) => {
            const requester = peers[requesterId];
            if (!requester) return null;
            return (
              <div key={requesterId} className="stage-queue-item">
                <span className="queue-name">{requester.displayName}</span>
                <div className="queue-actions">
                  <button
                    type="button"
                    className="queue-btn primary"
                    onClick={() => onPassBaton?.(requesterId)}
                  >
                    تسليم المنبر
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Host Hand-Raise Queue Banner */}
      {isHost && handRaisers.length > 0 && (
        <div className="stage-hand-queue">
          <span className="stage-queue-kicker">
            <Hand size={13} strokeWidth={1.5} /> طلبات التحدث ({handRaisers.length})
          </span>
          {handRaisers.map((raiser) => (
            <div key={raiser.peerId} className="stage-queue-item">
              <span className="queue-name">{raiser.displayName}</span>
              <div className="queue-actions">
                <button
                  type="button"
                  className="queue-btn primary"
                  onClick={() => onGrantMic(raiser.peerId)}
                >
                  سماح
                </button>
                <button
                  type="button"
                  className="queue-btn"
                  onClick={() => onRevokeMic(raiser.peerId)}
                >
                  تجاهل
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Speakers Section */}
      <div className="stage-group">
        <span className="stage-group-label">المتحدثون</span>
        <div className="stage-roster">
          {/* Self Card if speaker */}
          {selfIsSpeaker && (
            <div className="stage-card is-self">
              <span className="stage-avatar">{Array.from(selfName.trim())[0] ?? "؟"}</span>
              <div className="stage-card-info">
                <div className="stage-name-row">
                  <strong className="stage-name">{selfName || "أنت"}</strong>
                  <span className="stage-self-tag">أنت</span>
                  {selfIsReader && (
                    <span className="stage-reader-badge" title="أنت القارئ المتصدر حاليًا">
                      <Feather size={11} strokeWidth={1.5} /> القارئ
                    </span>
                  )}
                </div>
                <div className="stage-role-row">
                  <span className="stage-role-tag">{selfRole === "host" ? "المضيف" : "متحدث"}</span>
                  {isHost && !selfIsReader && (
                    <button
                      type="button"
                      className="stage-reclaim-btn"
                      onClick={() => onPassBaton?.(selfId)}
                      title="استرداد تحكم تقليب الصفحات للمضيف"
                    >
                      استرداد المنبر
                    </button>
                  )}
                  {!isHost && selfRole === "speaker" && !selfIsReader && (
                    selfHasRequestedBaton ? (
                      <button
                        type="button"
                        className="stage-baton-req-btn requested"
                        onClick={onCancelRequestBaton}
                        title="إلغاء طلب القراءة"
                      >
                        إلغاء الطلب
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="stage-baton-req-btn"
                        onClick={onRequestBaton}
                        title="طلب تسلّم المنبر لقراءة الصفحات"
                      >
                        <Feather size={11} strokeWidth={1.5} /> طلب المنبر
                      </button>
                    )
                  )}
                </div>
              </div>
              <HairlineWaveform speaking={selfSpeaking} />
            </div>
          )}

          {speakers.map((peer) => (
            <SpeakerPeerCard
              key={peer.peerId}
              peer={peer}
              stream={streams[peer.peerId] ?? null}
              isHost={isHost}
              isReader={peer.peerId === currentReaderId}
              onManage={() => setManagePeerId(peer.peerId)}
            />
          ))}
        </div>
      </div>

      {/* Listeners Section */}
      <div className="stage-group">
        <span className="stage-group-label">
          المستمعون ({listeners.length + (!selfIsSpeaker ? 1 : 0)})
        </span>
        <div className="stage-listeners-grid">
          {!selfIsSpeaker && (
            <div className="listener-chip is-self">
              <span className="listener-dot" />
              <span className="listener-name">{selfName || "أنت"}</span>
              <span className="listener-tag">أنت</span>
            </div>
          )}
          {listeners.map((peer) => (
            <div
              key={peer.peerId}
              className={"listener-chip" + (peer.handRaised ? " has-hand" : "")}
              onClick={() => isHost && setManagePeerId(peer.peerId)}
              title={isHost ? `إدارة صلاحيات ${peer.displayName}` : peer.displayName}
            >
              {peer.handRaised && <Hand size={12} strokeWidth={1.5} className="chip-hand-icon" />}
              <span className="listener-name">{peer.displayName}</span>
              {isHost && <MoreHorizontal size={12} className="chip-more-icon" />}
            </div>
          ))}
        </div>
      </div>

      {/* Connection Diagnostics Toggle */}
      <div className="stage-footer">
        <button
          type="button"
          className="stage-diag-toggle"
          onClick={() => setShowDiagnostics((v) => !v)}
          aria-expanded={showDiagnostics}
        >
          {showDiagnostics ? "إخفاء جودة الاتصال" : "حالة الاتصال الصوتي"}
        </button>

        {showDiagnostics && (
          <div className="stage-diagnostics">
            {participantList.map((p) => {
              const h = health[p.peerId];
              return (
                <div key={p.peerId} className="diag-row">
                  <span className="diag-peer">{p.displayName}</span>
                  <span className="diag-status">
                    {h?.connection ?? "متصل"} · {h?.receiving ? "صوت وارد" : "مستمع"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Host Management Popover Modal */}
      {managePeerId && peers[managePeerId] && (
        <div className="manage-popover-backdrop" onClick={() => setManagePeerId(null)}>
          <div className="manage-popover" onClick={(e) => e.stopPropagation()}>
            <div className="manage-header">
              <h3>{peers[managePeerId].displayName}</h3>
              <span className="manage-sub">
                {peers[managePeerId].role === "host"
                  ? "مضيف"
                  : peers[managePeerId].role === "speaker"
                  ? "متحدث"
                  : "مستمع"}
              </span>
            </div>
            <div className="manage-body">
              {/* Pass / Reclaim Baton for Speakers */}
              {isHost && peers[managePeerId].role !== "listener" && onPassBaton && (
                managePeerId === currentReaderId ? (
                  <button
                    type="button"
                    className="manage-btn"
                    onClick={() => {
                      onPassBaton(selfId);
                      setManagePeerId(null);
                    }}
                  >
                    <Feather size={15} strokeWidth={1.5} /> استرداد المنبر للمضيف
                  </button>
                ) : (
                  <button
                    type="button"
                    className="manage-btn"
                    onClick={() => {
                      onPassBaton(managePeerId);
                      setManagePeerId(null);
                    }}
                  >
                    <Feather size={15} strokeWidth={1.5} /> تسليم المنبر (عصا القراءة)
                  </button>
                )
              )}

              {peers[managePeerId].role === "listener" ? (
                <button
                  type="button"
                  className="manage-btn"
                  onClick={() => {
                    onGrantMic(managePeerId);
                    setManagePeerId(null);
                  }}
                >
                  <Shield size={15} strokeWidth={1.5} /> منح الميكروفون
                </button>
              ) : (
                <button
                  type="button"
                  className="manage-btn"
                  onClick={() => {
                    onRevokeMic(managePeerId);
                    setManagePeerId(null);
                  }}
                >
                  <ShieldOff size={15} strokeWidth={1.5} /> سحب الميكروفون
                </button>
              )}
              <button
                type="button"
                className="manage-btn danger"
                onClick={() => {
                  onKick(managePeerId);
                  setManagePeerId(null);
                }}
              >
                <UserRoundX size={15} strokeWidth={1.5} /> استبعاد من الجلسة
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );

  if (isMobileOpen) {
    return (
      <>
        <div className="stage-backdrop md:hidden" onClick={onCloseMobile} aria-hidden="true" />
        {stageContent}
      </>
    );
  }

  return stageContent;
}

function SpeakerPeerCard({
  peer,
  stream,
  isHost,
  isReader,
  onManage,
}: {
  peer: PeerInfo;
  stream: MediaStream | null;
  isHost: boolean;
  isReader: boolean;
  onManage: () => void;
}) {
  const speaking = useSpeaking(stream, !!peer.micOn);
  const initial = Array.from(peer.displayName.trim())[0] ?? "؟";

  return (
    <div className="stage-card">
      <span className="stage-avatar">{initial}</span>
      <div className="stage-card-info">
        <div className="stage-name-row">
          <strong className="stage-name">{peer.displayName}</strong>
          {isReader && (
            <span className="stage-reader-badge" title="القارئ المتصدر حاليًا">
              <Feather size={11} strokeWidth={1.5} /> القارئ
            </span>
          )}
        </div>
        <span className="stage-role-tag">{peer.role === "host" ? "المضيف" : "متحدث"}</span>
      </div>
      <div className="stage-card-trailing">
        <HairlineWaveform speaking={speaking} />
        {isHost && peer.role !== "host" && (
          <button
            type="button"
            className="stage-more-btn"
            onClick={onManage}
            title={`إدارة ${peer.displayName}`}
            aria-label={`إدارة ${peer.displayName}`}
          >
            <MoreHorizontal size={15} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
