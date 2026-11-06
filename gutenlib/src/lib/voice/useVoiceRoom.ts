"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { VoiceEngine, type PeerHealth } from "./engine";
import { getVoiceServerUrl } from "./config";
import { safeUUID } from "./uuid";
import type { ActiveBook, BookQuotePayload, ChatMessage, JoinedPayload, PeerInfo, ReadingState, SessionPhase, VoiceRole } from "./types";

export const storage = {
  get(key: string) { try { return localStorage.getItem(key) ?? ""; } catch { return ""; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
};

function parseChatMessage(msg: ChatMessage): ChatMessage {
  if (msg && typeof msg.text === "string" && msg.text.startsWith("__quote__:")) {
    try {
      const data = JSON.parse(msg.text.slice(10));
      return { ...msg, isQuote: true, quoteData: data };
    } catch {
      return msg;
    }
  }
  return msg;
}
const errors: Record<string, string> = {
  ROOM_NOT_FOUND: "هذه الغرفة غير متاحة أو انتهت. اطلب رابطًا جديدًا من المضيف.",
  ROOM_EXPIRED: "انتهت مدة الغرفة. يمكنك إنشاء جلسة جديدة.",
  HOST_NOT_CONNECTED: "لم يدخل المضيف بعد. انتظر قليلًا ثم جرّب الدخول.",
  HOST_AUTH_REQUIRED: "تعذر التحقق من صلاحية المضيف. افتح الغرفة من المتصفح الذي أنشأها.",
  ROOM_FULL: "الغرفة مكتملة (٨ مشاركين). جرّب لاحقًا.",
  KICKED: "أزالك المضيف من هذه الغرفة.",
  NOT_AUTHORIZED: "هذا الإجراء متاح للمضيف فقط.",
  RATE_LIMITED: "انتظر لحظة قبل إرسال رسالة أخرى.",
  HOST_LEFT: "انتهت الغرفة لأن المضيف غادر.",
  HOST_ENDED: "أنهى المضيف الجلسة.",
};
const messageFor = (code: string) => errors[code] ?? "تعذر تنفيذ الإجراء. حاول مرة أخرى.";
const initial = { phase: "idle" as SessionPhase, roomName: "", selfId: "", role: "listener" as VoiceRole, hostId: "", hostConnected: true, handRaised: false, peers: {} as Record<string, PeerInfo>, book: null as ActiveBook, reading: { kind: "chunk", index: 0 } as ReadingState, highlight: "", messages: [] as ChatMessage[], error: "" };

export function useVoiceRoom(token: string) {
  const [state, setState] = useState(initial);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [health, setHealth] = useState<Record<string, PeerHealth>>({});
  const [micOn, setMicOn] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const socket = useRef<Socket | null>(null);
  const engine = useRef<VoiceEngine | null>(null);
  const media = useRef<MediaStream | null>(null);
  const role = useRef<VoiceRole>("listener");
  const connected = useRef(false);
  const epoch = useRef(0);
  const micPending = useRef(false);
  const auth = useRef("");
  const joinTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mute = useCallback(() => {
    epoch.current++;
    media.current?.getTracks().forEach(track => { track.enabled = false; track.stop(); });
    media.current = null;
    void engine.current?.setTrack(null).catch(() => {});
    setMicOn(false); setLocalStream(null);
    if (socket.current?.connected) socket.current.emit("mic-state", { micOn: false });
  }, []);

  const dispose = useCallback(() => {
    clearTimeout(joinTimer.current);
    connected.current = false;
    mute();
    engine.current?.close(); engine.current = null;
    socket.current?.removeAllListeners(); socket.current?.disconnect(); socket.current = null;
    setStreams({}); setHealth({});
  }, [mute]);

  useEffect(() => () => dispose(), [token, dispose]);

  const join = useCallback((name: string, hostMode: boolean) => {
    dispose();
    setState({ ...initial, phase: "joining" });
    const hostKey = "gutenlib.voice.hostSecret." + token;
    const storedSecret = storage.get(hostKey);
    // If the URL has ?host=1 but this browser doesn't have the secret (e.g. invite link copied from PC to phone),
    // automatically fall back to guest mode instead of blocking with HOST_AUTH_REQUIRED.
    const effectiveHostMode = hostMode && !!storedSecret;
    auth.current = effectiveHostMode ? storedSecret : "";

    if (!name.trim()) { setState(s => ({ ...s, phase: "error", error: "اكتب اسمك قبل الدخول." })); return; }
    storage.set("gutenlib.voice.name", name.trim());
    // Separate host/guest identities prevent opening a guest invite from replacing the host.
    const identityKey = "gutenlib.voice.identity." + token + (effectiveHostMode ? ".host" : ".guest");
    let clientId = storage.get(identityKey);
    if (!clientId) { clientId = safeUUID(); storage.set(identityKey, clientId); }
    const serverUrl = getVoiceServerUrl();
    const client = io(serverUrl, { autoConnect: false, reconnection: true, reconnectionAttempts: 8, timeout: 10000 });
    socket.current = client;
    let terminal = false;
    let selfId = "";
    const finish = (phase: SessionPhase, error: string) => {
      terminal = true; dispose(); setState(s => ({ ...s, phase, error, peers: {} }));
    };
    const startDeadline = () => {
      clearTimeout(joinTimer.current);
      joinTimer.current = setTimeout(() => finish("error", "لم تستجب الغرفة. تحقق من اتصالك ثم أعد المحاولة."), 20000);
    };
    client.on("connect", () => {
      startDeadline();
      client.emit("join-room", { inviteToken: token, displayName: name.trim(), clientId, ...(auth.current ? { hostSecret: auth.current } : {}) });
    });
    client.on("joined", (payload: JoinedPayload) => {
      selfId = payload.selfPeerId;
      clearTimeout(joinTimer.current); connected.current = true; role.current = payload.role;
      engine.current?.close(); setStreams({}); setHealth({});
      engine.current = new VoiceEngine(client, payload.selfPeerId, {
        stream: (id, stream) => setStreams(s => ({ ...s, [id]: stream })),
        health: (id, status) => setHealth(s => ({ ...s, [id]: status })),
        error: error => setState(s => ({ ...s, error })),
      });
      for (const peer of payload.peers) engine.current.add(peer.peerId);
      setState(s => ({ ...s, phase: "connected", error: "", selfId: payload.selfPeerId, role: payload.role, handRaised: !!payload.handRaised, hostId: payload.hostPeerId ?? "", hostConnected: payload.role === "host" || payload.peers.some(p => p.role === "host"), roomName: payload.roomName ?? "غرفة قراءة", peers: Object.fromEntries(payload.peers.map(p => [p.peerId, p])), book: payload.activeBook ?? null, reading: payload.reading ?? initial.reading, highlight: payload.highlight?.text ?? "" }));
    });
    const peerJoined = (peer: PeerInfo) => {
      engine.current?.remove(peer.peerId);
      setStreams(s => { const next = { ...s }; delete next[peer.peerId]; return next; });
      engine.current?.add(peer.peerId);
      setState(s => ({ ...s, peers: { ...s.peers, [peer.peerId]: peer } }));
    };
    client.on("peer-joined", peerJoined); client.on("peer-reconnected", peerJoined);
    client.on("peer-left", ({ peerId }: { peerId: string }) => {
      engine.current?.remove(peerId);
      setStreams(s => { const next = { ...s }; delete next[peerId]; return next; });
      setHealth(s => { const next = { ...s }; delete next[peerId]; return next; });
      setState(s => { const peers = { ...s.peers }; delete peers[peerId]; return { ...s, peers }; });
    });
    client.on("role-updated", ({ peerId, role: nextRole }: { peerId: string; role: VoiceRole }) => {
      setState(s => {
        if (peerId === s.selfId) return { ...s, role: nextRole, handRaised: false };
        return s.peers[peerId] ? { ...s, peers: { ...s.peers, [peerId]: { ...s.peers[peerId], role: nextRole } } } : s;
      });
      if (peerId === selfId) { role.current = nextRole; if (nextRole === "listener") mute(); }
    });
    client.on("hand-updated", ({ peerId, handRaised }: { peerId: string; handRaised: boolean }) => setState(s => peerId === s.selfId ? { ...s, handRaised } : s.peers[peerId] ? { ...s, peers: { ...s.peers, [peerId]: { ...s.peers[peerId], handRaised } } } : s));
    client.on("mic-updated", ({ peerId, micOn }: { peerId: string; micOn: boolean }) => setState(s => s.peers[peerId] ? { ...s, peers: { ...s.peers, [peerId]: { ...s.peers[peerId], micOn } } } : s));
    client.on("host-updated", ({ hostPeerId, connected: hostConnected }: { hostPeerId: string; connected?: boolean }) => setState(s => ({ ...s, hostId: hostPeerId, hostConnected: hostConnected !== false })));
    client.on("book-updated", ({ activeBook }: { activeBook: ActiveBook }) => setState(s => ({ ...s, book: activeBook, highlight: "" })));
    client.on("reading-updated", ({ reading }: { reading: ReadingState }) => setState(s => ({ ...s, reading })));
    client.on("highlight-updated", ({ highlight }: { highlight: { text: string } | null }) => setState(s => ({ ...s, highlight: highlight?.text ?? "" })));
    client.on("chat-history", ({ messages }: { messages: ChatMessage[] }) => setState(s => ({ ...s, messages: (messages ?? []).map(parseChatMessage) })));
    client.on("chat-message", (message: ChatMessage) => {
      const parsed = parseChatMessage(message);
      setState(s => ({ ...s, messages: s.messages.some(m => m.id === parsed.id) ? s.messages : [...s.messages, parsed].slice(-100) }));
    });
    client.on("control-error", ({ error }: { error: string }) => setState(s => ({ ...s, error: messageFor(error) })));
    client.on("join-error", ({ error }: { error: string }) => {
      if (error === "HOST_NOT_CONNECTED") {
        setState(s => ({ ...s, phase: "idle", error: messageFor(error) }));
        return;
      }
      finish(error === "KICKED" || error === "ROOM_NOT_FOUND" ? "ended" : "error", messageFor(error));
    });
    client.on("room-ended", ({ reason }: { reason: string }) => finish("ended", messageFor(reason)));
    client.on("kicked", () => finish("ended", messageFor("KICKED")));
    client.on("session-replaced", () => finish("left", "فُتحت جلستك في تبويب آخر. يمكنك العودة من هنا."));
    client.on("disconnect", () => {
      if (terminal) return;
      connected.current = false; mute(); engine.current?.close(); engine.current = null;
      setStreams({}); setHealth({});
      setState(s => ({ ...s, phase: "reconnecting", peers: {}, error: "انقطع الاتصال. نحاول العودة تلقائيًا؛ الميكروفون مكتوم." }));
      startDeadline();
    });
    client.io.on("reconnect_failed", () => finish("error", "تعذر استعادة الاتصال. أعد المحاولة."));
    startDeadline(); client.connect();
  }, [dispose, mute, token]);

  const toggleMic = async (preferredDeviceId?: string) => {
    if (media.current) { mute(); return; }
    if (!connected.current || role.current === "listener" || micPending.current) return;
    micPending.current = true; setMicBusy(true);
    const requestEpoch = ++epoch.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("UNSUPPORTED");
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(preferredDeviceId ? { deviceId: { exact: preferredDeviceId } } : {}),
      };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      if (requestEpoch !== epoch.current || !connected.current || (role.current as VoiceRole) === "listener") { stream.getTracks().forEach(t => t.stop()); return; }
      media.current = stream;
      stream.getAudioTracks()[0].onended = mute;
      await engine.current?.setTrack(stream.getAudioTracks()[0]);
      if (requestEpoch !== epoch.current) return;
      setLocalStream(stream); setMicOn(true); setState(s => ({ ...s, error: "" }));
      socket.current?.emit("mic-state", { micOn: true });
    } catch (e) {
      if (requestEpoch === epoch.current) {
        mute();
        const denied = e instanceof DOMException && e.name === "NotAllowedError";
        setState(s => ({ ...s, error: denied ? "الميكروفون محظور. اسمح باستخدامه من إعدادات المتصفح ثم حاول مجددًا." : "تعذر تشغيل الميكروفون. تحقق من الجهاز ومن اتصال HTTPS ثم حاول مجددًا." }));
      }
    } finally { micPending.current = false; setMicBusy(false); }
  };

  const hostAction = (event: string, payload: Record<string, unknown> = {}) => {
    if (connected.current && role.current === "host" && auth.current) socket.current?.emit(event, { ...payload, hostSecret: auth.current });
  };
  const sendMessage = async (text: string): Promise<boolean> => {
    const client = socket.current;
    if (!client?.connected || !connected.current) return false;
    try {
      const reply = await client.timeout(6000).emitWithAck("chat-send", { text }) as { ok: boolean; error?: string };
      if (!reply.ok) setState(s => ({ ...s, error: messageFor(reply.error ?? "") }));
      return reply.ok;
    } catch { setState(s => ({ ...s, error: "لم يتم تأكيد إرسال الرسالة. تحقق من الاتصال قبل المحاولة مجددًا." })); return false; }
  };
  const sendQuote = async (payload: BookQuotePayload): Promise<boolean> => {
    const serialized = JSON.stringify(payload);
    return sendMessage(`__quote__:${serialized}`);
  };
  return { ...state, streams, health, micOn, micBusy, localStream, join, toggleMic, hostAction, sendMessage, sendQuote,
    leave: () => { dispose(); setState(s => ({ ...s, phase: "left", error: "غادرت الجلسة والميكروفون مغلق." })); },
    raiseHand: () => { if (connected.current) socket.current?.emit(state.handRaised ? "cancel-request-mic" : "request-mic"); },
    dismissError: () => setState(s => ({ ...s, error: "" })),
  };
}
