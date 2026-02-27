"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { ICE_SERVERS, VOICE_SERVER_URL } from "@/lib/voice/config";
import type { ActiveBook, JoinedPayload, PeerInfo, VoiceRole } from "@/lib/voice/types";
import { RoomReader } from "@/components/RoomReader";
import { RoomArabicReader } from "@/components/RoomArabicReader";
import {
  Copy as CopyIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Hand as HandIcon,
  Crown as CrownIcon,
  Ear as EarIcon,
  UserX as KickIcon,
  BadgeCheck as GrantIcon,
  BadgeMinus as RevokeIcon,
  X as CloseIcon,
  ShieldAlert as EndIcon,
  BookOpen as BookIcon,
  Search as SearchIcon,
  Trash2 as ClearIcon,
  MessageCircle as ChatIcon,
  Send as SendIcon,
} from "lucide-react";

type PeerState = PeerInfo & { audioElId: string };

function avatarLabel(name: string) {
  const t = (name || "").trim();
  if (!t) return "ØŸ";
  // Take first non-space character (works for Arabic/Latin)
  return Array.from(t)[0] ?? "ØŸ";
}

function lsGet(key: string) {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function lsDel(key: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function lsGetBool(key: string, fallback = false) {
  const v = lsGet(key);
  if (v === null) return fallback;
  return v === "1" || v === "true";
}

function lsSetBool(key: string, value: boolean) {
  lsSet(key, value ? "1" : "0");
}

export default function RoomPage() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();

  const token = params.token;
  const isHostView = search.get("host") === "1";

  const socketRef = useRef<Socket | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const [roomName, setRoomName] = useState<string>("");
  const [activeBook, setActiveBook] = useState<ActiveBook>(null);
  const [highlightText, setHighlightText] = useState("");
  const [bookPickerOpen, setBookPickerOpen] = useState(false);
  const [bookSearch, setBookSearch] = useState("");
  const [bookLang, setBookLang] = useState<"ar" | "en" | "all">("ar");
  const [bookResults, setBookResults] = useState<any[]>([]);
  const [bookLoading, setBookLoading] = useState(false);

  const [chunkIndex, setChunkIndex] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [name, setName] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const joinedRef = useRef(false);
  const [micOn, setMicOn] = useState(false);
  const micOnRef = useRef(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState<Record<string, boolean>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<Map<string, AnalyserNode>>(new Map());
  const remoteSourceRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const remoteRafRef = useRef<Map<string, number>>(new Map());
  // Tracks which peer IDs we are currently making an offer to (for perfect negotiation)
  const makingOfferRef = useRef<Set<string>>(new Set());
  // Stable ref for canSpeak (avoids stale closures in socket handlers)
  const canSpeakRef = useRef(false);
  const [handRaised, setHandRaised] = useState(false);

  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);
  const [selfRole, setSelfRole] = useState<VoiceRole | null>(null);
  const [hostPeerId, setHostPeerId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerState>>({});
  const [sheetPeerId, setSheetPeerId] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const [messages, setMessages] = useState<Array<{ id: string; peerId: string; name: string; text: string; ts: number }>>([]);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  // Values loaded after mount (avoid SSR/localStorage issues)
  const [hostSecret, setHostSecret] = useState<string | null>(null);
  const [storedHostName, setStoredHostName] = useState<string | null>(null);
  const [storedRoomName, setStoredRoomName] = useState<string | null>(null);
  const [storedGuestName, setStoredGuestName] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string>("");

  useEffect(() => {
    // load persisted values after mount
    if (!token) return;

    if (isHostView) {
      setHostSecret(lsGet(`gutenlib.voice.hostSecret.${token}`));
      setStoredHostName(lsGet(`gutenlib.voice.hostName.${token}`));
      setStoredRoomName(lsGet(`gutenlib.voice.roomName.${token}`));
    } else {
      setStoredGuestName(lsGet(`gutenlib.voice.guestName.${token}`));
    }

    // generate stable clientId per room for this browser
    const k = `gutenlib.voice.clientId.${token}`;
    let v = lsGet(k);
    if (!v) {
      v = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 32);
      lsSet(k, v);
    }
    setClientId(v);
  }, [token, isHostView]);

  const isHost = selfRole === "host";
  const canSpeak = selfRole === "host" || selfRole === "speaker";

  const micKey = useMemo(() => `gutenlib.voice.micOn.${token}.${clientId}`, [token, clientId]);

  function stopLocalVoiceMeter() {
    if (meterRafRef.current != null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    try { sourceNodeRef.current?.disconnect(); } catch {}
    try { analyserRef.current?.disconnect(); } catch {}
    sourceNodeRef.current = null;
    analyserRef.current = null;
    setLocalSpeaking(false);
  }

  function startLocalVoiceMeter(stream: MediaStream) {
    if (typeof window === "undefined") return;
    if (!audioCtxRef.current) {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      audioCtxRef.current = new Ctx();
    }

    stopLocalVoiceMeter();

    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    sourceNodeRef.current = source;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLocalSpeaking(micOnRef.current && rms > 0.045);
      meterRafRef.current = requestAnimationFrame(tick);
    };
    meterRafRef.current = requestAnimationFrame(tick);
  }

  function stopRemoteVoiceMeter(peerId: string) {
    const rid = remoteRafRef.current.get(peerId);
    if (rid != null) cancelAnimationFrame(rid);
    remoteRafRef.current.delete(peerId);
    try { remoteSourceRef.current.get(peerId)?.disconnect(); } catch {}
    try { remoteAnalyserRef.current.get(peerId)?.disconnect(); } catch {}
    remoteSourceRef.current.delete(peerId);
    remoteAnalyserRef.current.delete(peerId);
    setSpeakingPeers((prev) => ({ ...prev, [peerId]: false }));
  }

  function startRemoteVoiceMeter(peerId: string, stream: MediaStream) {
    if (typeof window === "undefined") return;
    if (!audioCtxRef.current) {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    stopRemoteVoiceMeter(peerId);

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.86;
    source.connect(analyser);
    remoteSourceRef.current.set(peerId, source);
    remoteAnalyserRef.current.set(peerId, analyser);

    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      const a = remoteAnalyserRef.current.get(peerId);
      if (!a) return;
      a.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setSpeakingPeers((prev) => ({ ...prev, [peerId]: rms > 0.035 }));
      const id = requestAnimationFrame(tick);
      remoteRafRef.current.set(peerId, id);
    };
    const id = requestAnimationFrame(tick);
    remoteRafRef.current.set(peerId, id);
  }

  async function ensureLocalAudioStream() {
    if (localStreamRef.current) return localStreamRef.current;

    // Prefer voice-friendly constraints (better quality + fewer echoes on mobile/low-end mics)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      } as any,
    });

    localStreamRef.current = stream;
    startLocalVoiceMeter(stream);
    return stream;
  }

  function getOrCreatePC(peerId: string) {
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      socketRef.current?.emit("webrtc-ice", { toPeerId: peerId, candidate: ev.candidate });
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;
      remoteStreamsRef.current.set(peerId, stream);
      const el = document.getElementById(`audio-${peerId}`) as HTMLAudioElement | null;
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        el.autoplay = true;
        (el as any).playsInline = true;
        el.play?.().catch(() => { });
      }
      startRemoteVoiceMeter(peerId, stream);
    };

    // Perfect negotiation: onnegotiationneeded fires when addTrack/removeTrack changes
    // the session. Guard: only proceed when stable (not mid offer-answer exchange).
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== "stable") return;
      try {
        makingOfferRef.current.add(peerId);
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return; // state changed while awaiting
        const tuned = {
          type: offer.type,
          sdp: offer.sdp ? tuneOpusSdp(offer.sdp) : offer.sdp,
        } as RTCSessionDescriptionInit;
        await pc.setLocalDescription(tuned);
        socketRef.current?.emit("webrtc-offer", { toPeerId: peerId, sdp: tuned });
      } catch (e) {
        console.warn("[webrtc] onnegotiationneeded error for", peerId, e);
      } finally {
        makingOfferRef.current.delete(peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        console.warn("[webrtc] connection failed for peer", peerId, "â€“ closing");
        pc.close();
        pcsRef.current.delete(peerId);
      }
    };

    pcsRef.current.set(peerId, pc);
    return pc;
  }

  function setPeer(p: PeerInfo) {
    setPeers((prev) => {
      const existing = prev[p.peerId];
      return {
        ...prev,
        [p.peerId]: {
          ...p,
          audioElId: existing?.audioElId ?? `audio-${p.peerId}`,
        },
      };
    });
  }

  function removePeer(peerId: string) {
    setPeers((prev) => {
      const n = { ...prev };
      delete n[peerId];
      return n;
    });

    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.close();
      pcsRef.current.delete(peerId);
    }
    remoteStreamsRef.current.delete(peerId);
    stopRemoteVoiceMeter(peerId);
  }

  function tuneOpusSdp(sdp: string) {
    // Try to increase Opus bitrate a bit (helps clarity). Safe no-op if Opus isn't found.
    // Note: exact payload id varies by browser; we detect it from rtpmap.
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
    if (!m) return sdp;
    const pt = m[1];

    const want = "maxaveragebitrate=96000;stereo=0;sprop-stereo=0";

    const fmtpRe = new RegExp(`a=fmtp:${pt} (.*)`, "i");
    if (fmtpRe.test(sdp)) {
      return sdp.replace(fmtpRe, (full, params) => {
        const p = String(params || "");
        if (p.toLowerCase().includes("maxaveragebitrate")) return full;
        return `a=fmtp:${pt} ${p}${p.trim() ? ";" : ""}${want}`;
      });
    }

    // If no fmtp line exists, insert one after rtpmap.
    const rtpmapRe = new RegExp(`a=rtpmap:${pt} opus\\/48000.*\\r?\\n`, "i");
    return sdp.replace(rtpmapRe, (line) => `${line}a=fmtp:${pt} ${want}\r\n`);
  }

  async function renegotiate(peerId: string) {
    const pc = getOrCreatePC(peerId);
    const offer = await pc.createOffer();

    const tuned = {
      type: offer.type,
      sdp: offer.sdp ? tuneOpusSdp(offer.sdp) : offer.sdp,
    } as RTCSessionDescriptionInit;

    await pc.setLocalDescription(tuned);
    socketRef.current?.emit("webrtc-offer", { toPeerId: peerId, sdp: tuned });
  }

  async function attachLocalTrackToAll(enabled: boolean) {
    const stream = await ensureLocalAudioStream();
    const track = stream.getAudioTracks()[0];
    if (track) track.enabled = enabled;
    for (const [peerId, pc] of pcsRef.current.entries()) {
      const hasSender = pc.getSenders().some((s) => s.track?.kind === "audio");
      if (!hasSender && enabled) {
        pc.addTrack(track, stream);
        // More robust on mobile/browsers where onnegotiationneeded can be delayed.
        await renegotiate(peerId).catch(() => {});
      }
    }
  }

  async function detachLocalTrackFromAll() {
    for (const [, pc] of pcsRef.current.entries()) {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind === "audio") pc.removeTrack(sender);
        // onnegotiationneeded fires automatically â†’ renegotiates without audio track
      }
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    stopLocalVoiceMeter();
  }

  // initCallerPeer: called when an existing peer hears about a new peer (peer-joined).
  // This side is the "caller" â€” it creates the initial offer.
  async function initCallerPeer(p: PeerInfo) {
    setPeer(p);
    const pc = getOrCreatePC(p.peerId);
    if (canSpeakRef.current && micOnRef.current) {
      try {
        const stream = await ensureLocalAudioStream();
        const hasSender = pc.getSenders().some((s) => s.track?.kind === "audio");
        if (!hasSender) {
          pc.addTrack(stream.getAudioTracks()[0], stream);
          await renegotiate(p.peerId).catch(() => {});
          return;
        }
      } catch {
        setStatus("ØªØ­ØªØ§Ø¬ Ø¥Ø°Ù† Ø§Ù„Ù…ÙŠÙƒØ±ÙˆÙÙˆÙ†");
      }
    }
    // No track added â†’ send an explicit empty offer so the remote can answer with their track
    await renegotiate(p.peerId).catch((e) => console.warn("[webrtc] initial offer error", e));
  }

  async function joinRoom(dnOverride?: string) {
    setStatus("");

    const dn = (dnOverride ?? name).trim();
    if (!dn) {
      setJoining(false);
      setStatus("Ø§ÙƒØªØ¨ Ø§Ø³Ù…Ùƒ Ù‚Ø¨Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„");
      return;
    }

    if (!clientId) {
      // clientId is generated after mount; retry shortly
      setJoining(false);
      setTimeout(() => joinRoom(dn), 0);
      return;
    }

    // avoid duplicate connects
    if (socketRef.current?.connected) return;

    setJoining(true);

    // Persist name for this room (guest or host) on this device
    lsSet(`gutenlib.voice.guestName.${token}`, dn);

    if (isHostView && !hostSecret) {
      setJoining(false);
      setStatus("Ù‡Ø°Ù‡ Ø§Ù„ØºØ±ÙØ© Ù„ÙŠØ³Øª Ù…Ø¶ÙŠÙÙ‹Ø§ Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø². Ø§Ø±Ø¬Ø¹ Ù„ØµÙØ­Ø© /voice ÙˆØ£Ù†Ø´Ø¦ ØºØ±ÙØ© Ø¬Ø¯ÙŠØ¯Ø©.");
      return;
    }

    const socket = io(VOICE_SERVER_URL, {
      timeout: 12000,
      reconnection: true,
      reconnectionAttempts: Number.MAX_SAFE_INTEGER,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    // safety: if join hangs, surface it
    const joinTimeout = setTimeout(() => {
      setJoining(false);
      setStatus("ØªØ¹Ø°Ø± Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„ØºØ±ÙØ©. ØªØ£ÙƒØ¯ Ø£Ù† voice-server ÙŠØ¹Ù…Ù„ Ø«Ù… Ø£Ø¹Ø¯ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø©.");
      try {
        socket.disconnect();
      } catch {
        // ignore
      }
    }, 8000);

    socket.on("connect", () => {
      clearTimeout(joinTimeout);
      socket.emit("join-room", {
        inviteToken: token,
        displayName: dn,
        hostSecret: isHostView ? hostSecret : undefined,
        clientId,
      });
    });

    socket.on("connect_error", (err) => {
      clearTimeout(joinTimeout);
      setJoining(false);
      setStatus(`ØªØ¹Ø°Ø± Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø³ÙŠØ±ÙØ± Ø§Ù„ØµÙˆØªÙŠ: ${String((err as any)?.message ?? err)}`);
    });

    socket.on("disconnect", (reason) => {
      // if we weren't joined yet, surface it (use ref to avoid stale closure)
      if (!joinedRef.current) {
        setJoining(false);
        setStatus(`Ø§Ù†Ù‚Ø·Ø¹ Ø§Ù„Ø§ØªØµØ§Ù„ Ù‚Ø¨Ù„ Ø§Ù„Ø¯Ø®ÙˆÙ„: ${reason}`);
      }
    });

    socket.on("join-error", ({ error }) => {
      clearTimeout(joinTimeout);
      setJoining(false);
      if (error === "ROOM_NOT_FOUND") {
        // Clear cached guest name because the room is gone
        lsDel(`gutenlib.voice.guestName.${token}`);
        setStatus("Ø§Ù„ØºØ±ÙØ© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø© (Ù‚Ø¯ ØªÙƒÙˆÙ† Ø§Ù†ØªÙ‡Øª). Ø§Ø·Ù„Ø¨ Ø±Ø§Ø¨Ø· Ø¯Ø¹ÙˆØ© Ø¬Ø¯ÙŠØ¯.");
        return;
      }
      setStatus(`Ø®Ø·Ø£: ${error}`);
    });

    socket.on("joined", async (payload: JoinedPayload) => {
      clearTimeout(joinTimeout);
      setJoining(false);
      setJoined(true);
      setName(dn);
      setSelfPeerId(payload.selfPeerId);
      setSelfRole(payload.role);
      setHostPeerId(payload.hostPeerId);
      if (payload.roomName) setRoomName(payload.roomName);
      if (typeof payload.activeBook !== "undefined") setActiveBook(payload.activeBook ?? null);
      if (payload.reading?.kind === "chunk") setChunkIndex(Number(payload.reading.index) || 0);
      if (payload.reading?.kind === "page") setPageNumber(Math.max(1, Number(payload.reading.index) || 1));
      setHighlightText(String((payload as any)?.highlight?.text ?? ""));

      // Hydrate existing peers: just set up PCs, do NOT send offers from new-joiner side.
      // Existing peers will send us offers via their peer-joined handler (initCallerPeer).
      // This avoids glare where both sides simultaneously create offers.
      for (const p of payload.peers) {
        setPeer(p);
        getOrCreatePC(p.peerId); // prepare PC, wait for incoming offer
      }

      // hydrate hand state if present in peers list for self
      const selfFromPeers = payload.peers.find((p) => p.peerId === payload.selfPeerId);
      if (selfFromPeers?.handRaised) setHandRaised(true);

      if (payload.role === "host" || payload.role === "speaker") {
        setMicOn(true);
        micOnRef.current = true;
        lsSetBool(micKey, true);
        try {
          await ensureLocalAudioStream();
          await attachLocalTrackToAll(true);
        } catch {
          setStatus("تحتاج إذن الميكروفون");
        }
      } else {
        setMicOn(false);
        micOnRef.current = false;
      }
    });

    socket.on("peer-joined", async (p: PeerInfo) => {
      // We are an existing peer; new peer joined â†’ we are the caller, create the offer.
      try { await initCallerPeer(p); } catch { setPeer(p); }
    });
    socket.on("peer-reconnected", async (p: PeerInfo) => {
      removePeer(p.peerId);
      try { await initCallerPeer(p); } catch { setPeer(p); }
    });

    socket.on("session-replaced", () => {
      setStatus("ØªÙ… ÙØªØ­ Ø§Ù„ØºØ±ÙØ© ÙÙŠ ØªØ¨ÙˆÙŠØ¨ Ø¢Ø®Ø±. Ù‡Ø°Ø§ Ø§Ù„ØªØ¨ÙˆÙŠØ¨ Ø®Ø±Ø¬ ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§.");
    });
    socket.on("peer-left", ({ peerId }) => removePeer(peerId));
    socket.on("host-updated", ({ hostPeerId }: { hostPeerId: string | null }) => setHostPeerId(hostPeerId));

    socket.on("chat-history", ({ messages }: { messages: any[] }) => {
      const arr = Array.isArray(messages) ? messages : [];
      setMessages(arr.map((m) => ({
        id: String(m.id),
        peerId: String(m.peerId),
        name: String(m.name ?? ""),
        text: String(m.text ?? ""),
        ts: Number(m.ts) || Date.now(),
      })));
    });

    socket.on("chat-message", (m: any) => {
      const msg = {
        id: String(m.id),
        peerId: String(m.peerId),
        name: String(m.name ?? ""),
        text: String(m.text ?? ""),
        ts: Number(m.ts) || Date.now(),
      };
      setMessages((prev) => {
        const next = [...prev, msg];
        return next.length > 300 ? next.slice(next.length - 300) : next;
      });
      if (!chatOpen) setChatUnread((u) => u + 1);
    });

    socket.on("hand-updated", ({ peerId, handRaised }: { peerId: string; handRaised: boolean }) => {
      setPeers((prev) => {
        const cur = prev[peerId];
        if (!cur) return prev;
        return { ...prev, [peerId]: { ...cur, handRaised } };
      });
      if (peerId === payloadSelfIdRef.current) {
        setHandRaised(handRaised);
      }
    });

    socket.on("book-updated", ({ activeBook }: { activeBook: ActiveBook }) => {
      setActiveBook(activeBook ?? null);
      setChunkIndex(0);
    });

    socket.on("reading-updated", ({ reading }: { reading: any }) => {
      if (reading?.kind === "chunk") setChunkIndex(Number(reading.index) || 0);
      if (reading?.kind === "page") setPageNumber(Math.max(1, Number(reading.index) || 1));
    });

    socket.on("highlight-updated", ({ highlight }: { highlight: any }) => {
      setHighlightText(String(highlight?.text ?? ""));
    });

    socket.on("role-updated", async ({ peerId, role }: { peerId: string; role: VoiceRole }) => {
      setPeers((prev) => {
        const cur = prev[peerId];
        if (!cur) return prev;
        return { ...prev, [peerId]: { ...cur, role } };
      });

      if (peerId === payloadSelfIdRef.current) {
        setSelfRole(role);
        // canSpeakRef will update via useEffect, but we need it now â€” set directly
        canSpeakRef.current = role === "speaker" || role === "host";
        if (role === "speaker" || role === "host") {
          try {
            setMicOn(true);
            micOnRef.current = true;
            lsSetBool(micKey, true);
            await ensureLocalAudioStream();
            await attachLocalTrackToAll(true);
          } catch {
            setStatus("لا يمكن تشغيل الميكروفون");
          }
        } else {
          setMicOn(false);
          micOnRef.current = false;
          lsSetBool(micKey, false);
          await detachLocalTrackFromAll();
        }
      }
    });

    socket.on("kicked", () => {
      lsDel(`gutenlib.voice.guestName.${token}`);
      setJoining(false);
      setJoined(false);
      setStatus("ØªÙ… Ø·Ø±Ø¯Ùƒ Ù…Ù† Ø§Ù„ØºØ±ÙØ©");
      socket.disconnect();
    });

    socket.on("room-ended", ({ reason }) => {
      // Room ended => clear cached name
      lsDel(`gutenlib.voice.guestName.${token}`);
      setJoining(false);
      setStatus(`Ø§Ù†ØªÙ‡Øª Ø§Ù„ØºØ±ÙØ©: ${reason}`);
      socket.disconnect();
    });

    // â”€â”€ WebRTC signaling with perfect negotiation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on("webrtc-offer", async ({ fromPeerId, toPeerId, sdp }) => {
      if (toPeerId !== payloadSelfIdRef.current) return;
      const selfId = payloadSelfIdRef.current!;
      const pc = getOrCreatePC(fromPeerId);

      // Perfect negotiation: determine polarity.
      // The peer with the lexicographically larger peerId is "polite" (yields on collision).
      const polite = selfId > fromPeerId;
      const offerCollision =
        sdp.type === "offer" &&
        (makingOfferRef.current.has(fromPeerId) || pc.signalingState !== "stable");

      if (!polite && offerCollision) {
        return; // impolite peer ignores the colliding offer
      }

      try {
        if (offerCollision) {
          // Polite peer: rollback own offer and accept theirs
          await Promise.all([
            pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit),
            pc.setRemoteDescription(sdp as RTCSessionDescriptionInit),
          ]);
        } else {
          await pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
        }

        if (sdp.type === "offer") {
          // KEY FIX: attach local track BEFORE creating the answer so our audio
          // is included in the SDP sent back to the offering peer.
          if (canSpeakRef.current && micOnRef.current) {
            const stream = await ensureLocalAudioStream().catch(() => null);
            if (stream) {
              const hasSender = pc.getSenders().some((s) => s.track?.kind === "audio");
              if (!hasSender) pc.addTrack(stream.getAudioTracks()[0], stream);
            }
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("webrtc-answer", { toPeerId: fromPeerId, sdp: answer });
        }
      } catch (e) {
        console.warn("[webrtc] offer handler error", e);
      }
    });

    socket.on("webrtc-answer", async ({ fromPeerId, toPeerId, sdp }) => {
      if (toPeerId !== payloadSelfIdRef.current) return;
      const pc = getOrCreatePC(fromPeerId);
      try {
        await pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
      } catch (e) {
        console.warn("[webrtc] answer error", e);
      }
    });

    socket.on("webrtc-ice", async ({ fromPeerId, toPeerId, candidate }) => {
      if (toPeerId !== payloadSelfIdRef.current) return;
      const pc = getOrCreatePC(fromPeerId);
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore stale candidates
      }
    });
  }

  // Keep refs in sync with state (avoids stale closures in socket handlers)
  const payloadSelfIdRef = useRef<string | null>(null);
  useEffect(() => { payloadSelfIdRef.current = selfPeerId; }, [selfPeerId]);
  useEffect(() => { joinedRef.current = joined; }, [joined]);
  useEffect(() => { micOnRef.current = micOn; }, [micOn]);
  useEffect(() => { canSpeakRef.current = canSpeak; }, [canSpeak]);

  function toggleMic() {
    if (!canSpeak) return;
    const next = !micOnRef.current;
    micOnRef.current = next;
    setMicOn(next);
    lsSetBool(micKey, next);

    const stream = localStreamRef.current;
    const track = stream?.getAudioTracks?.()[0];
    if (track) track.enabled = next;

    if (next) {
      attachLocalTrackToAll(true).catch(() => setStatus("Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…ÙŠÙƒØ±ÙˆÙÙˆÙ†"));
    }
  }

  function scrollChatToBottom() {
    const el = chatListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  function sendChat() {
    const t = chatText.trim();
    if (!t) return;
    socketRef.current?.emit("chat-send", { text: t });
    setChatText("");
  }

  useEffect(() => {
    if (!chatOpen) return;
    // scroll after panel opens
    setTimeout(scrollChatToBottom, 0);
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    // scroll when new messages arrive
    setTimeout(scrollChatToBottom, 0);
  }, [messages, chatOpen]);

  useEffect(() => {
    for (const [peerId, stream] of remoteStreamsRef.current.entries()) {
      const el = document.getElementById(`audio-${peerId}`) as HTMLAudioElement | null;
      if (!el) continue;
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        el.autoplay = true;
        (el as any).playsInline = true;
        el.play?.().catch(() => {});
      }
    }
  }, [peers]);

  function copyInviteLink() {
    const url = `${window.location.origin}/room/${token}`;
    navigator.clipboard.writeText(url);
    setStatus("ØªÙ… Ù†Ø³Ø® Ø±Ø§Ø¨Ø· Ø§Ù„Ø¯Ø¹ÙˆØ©");
    setTimeout(() => setStatus(""), 1200);
  }

  function roleIcon(role: VoiceRole, isHostPeer: boolean) {
    if (isHostPeer) return <CrownIcon size={14} />;
    if (role === "speaker") return <MicIcon size={14} />;
    return <EarIcon size={14} />;
  }

  async function searchBooks(q: string) {
    const query = q.trim();
    if (!query) {
      setBookResults([]);
      return;
    }
    setBookLoading(true);
    try {
      if (bookLang === "ar") {
        const res = await fetch(`/api/abl/books?lang=ar&languages=ar&perPage=30&query=${encodeURIComponent(query)}`, { cache: "no-store" });
        const j = await res.json();
        const items = Array.isArray(j?.books) ? j.books : [];
        // Add thumbnailUrl for convenience
        const withThumb = items.map((b: any) => ({
          ...b,
          thumbnailUrl: b?.attachments?.find?.((a: any) => a?.context === 2)?.thumbnailUrl ?? null,
        }));
        setBookResults(withThumb);
      } else {
        const langParam = bookLang === "all" ? "" : `languages=${bookLang}&`;
        const res = await fetch(`https://gutendex.com/books?${langParam}search=${encodeURIComponent(query)}`);
        const j = await res.json();
        setBookResults(Array.isArray(j?.results) ? j.results : []);
      }
    } catch {
      setBookResults([]);
    } finally {
      setBookLoading(false);
    }
  }

  function hostSetBookFromGutendex(b: any) {
    if (!hostSecret) return;
    const id = Number(b?.id);
    const title = String(b?.title ?? `Book #${id}`);
    const author = String(b?.authors?.[0]?.name ?? "");
    const coverUrl = b?.formats && typeof b.formats["image/jpeg"] === "string" ? b.formats["image/jpeg"] : null;

    socketRef.current?.emit("host-set-book", {
      hostSecret,
      book: { source: "gutendex", id, title, author, coverUrl, lang: bookLang === "all" ? "" : bookLang },
    });
    setBookPickerOpen(false);
  }

  function hostSetBookFromAbl(b: any) {
    if (!hostSecret) return;
    const id = String(b?.id ?? "");
    const title = String(b?.title ?? "").trim() || `ABL #${id}`;
    const author = String(b?.contributors?.[0]?.name ?? b?.authors?.[0]?.name ?? "");
    const coverUrl = typeof b?.thumbnailUrl === "string" ? b.thumbnailUrl : null;

    socketRef.current?.emit("host-set-book", {
      hostSecret,
      book: { source: "abl", id, title, author, coverUrl, lang: "ar" },
    });
    setBookPickerOpen(false);
  }

  function hostClearBook() {
    if (!hostSecret) return;
    socketRef.current?.emit("host-clear-book", { hostSecret });
  }

  function hostSetChunk(next: number) {
    setChunkIndex(next);
    if (!hostSecret) return;
    socketRef.current?.emit("host-set-chunk", { hostSecret, chunkIndex: next });
  }

  function hostSetPage(next: number) {
    setPageNumber(next);
    if (!hostSecret) return;
    socketRef.current?.emit("host-set-page", { hostSecret, page: next });
  }

  function hostSetHighlightFromSelection() {
    if (!hostSecret) return;
    const raw = (window.getSelection?.()?.toString?.() || "").trim();
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) {
      setStatus("Ø­Ø¯Ø¯ ÙÙ‚Ø±Ø© Ø£ÙˆÙ„Ù‹Ø§");
      return;
    }
    socketRef.current?.emit("host-set-highlight", { hostSecret, text: t.slice(0, 280) });
  }

  function hostClearHighlight() {
    if (!hostSecret) return;
    socketRef.current?.emit("host-clear-highlight", { hostSecret });
  }

  function requestMic() {
    if (selfRole !== "listener") return;
    socketRef.current?.emit("request-mic");
  }

  function cancelRequestMic() {
    socketRef.current?.emit("cancel-request-mic");
  }

  function hostGrantMic(peerId: string) {
    if (!hostSecret) return;
    socketRef.current?.emit("host-grant-mic", { targetPeerId: peerId, hostSecret });
  }

  function hostRevokeMic(peerId: string) {
    if (!hostSecret) return;
    socketRef.current?.emit("host-revoke-mic", { targetPeerId: peerId, hostSecret });
  }

  function hostKick(peerId: string) {
    if (!hostSecret) return;
    socketRef.current?.emit("host-kick", { targetPeerId: peerId, hostSecret });
  }

  function hostEndRoom() {
    if (!hostSecret) return;
    socketRef.current?.emit("host-end-room", { hostSecret });
  }

  const sheetPeer = useMemo(() => {
    if (!sheetPeerId) return null;
    return peers[sheetPeerId] ?? null;
  }, [peers, sheetPeerId]);

  const handCount = useMemo(() => Object.values(peers).filter((p) => !!p.handRaised).length, [peers]);

  const autoJoinOnceRef = useRef(false);

  // Auto-join when we have cached name (and hostSecret for host view)
  useEffect(() => {
    if (joined || joining) return;
    if (autoJoinOnceRef.current) return;

    const n = (isHostView ? storedHostName : storedGuestName) ?? "";
    const okHost = !isHostView || !!hostSecret;

    if (okHost && n.trim()) {
      autoJoinOnceRef.current = true;
      setName(n);
      setJoining(true);
      setTimeout(() => joinRoom(n), 0);
    }
  }, [joined, joining, isHostView, storedHostName, storedGuestName, hostSecret, clientId]);

  useEffect(() => {
    // best-effort load roomName
    (async () => {
      try {
        const res = await fetch(`${VOICE_SERVER_URL}/rooms/${token}`);
        if (res.ok) {
          const j = (await res.json()) as { ok: boolean; roomName?: string };
          if (j?.roomName) setRoomName(j.roomName);
        }
      } catch {
        // ignore
      }
    })();

    // prefill name
    if (isHostView) {
      if (storedHostName && !name) setName(storedHostName);
    } else {
      if (storedGuestName && !name) setName(storedGuestName);
    }

    if (storedRoomName && !roomName) setRoomName(storedRoomName);

    // (auto-join moved to separate effect that reacts to cached values)

    return () => {
      socketRef.current?.disconnect();
      for (const pc of pcsRef.current.values()) pc.close();
      pcsRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      stopLocalVoiceMeter();
      for (const pid of Array.from(remoteRafRef.current.keys())) stopRemoteVoiceMeter(pid);
      remoteStreamsRef.current.clear();
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch {}
        audioCtxRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      className="room-page"
      style={{
        minHeight: "100vh",
        paddingBottom: joined ? 118 : 24,
        background:
          "radial-gradient(1100px 520px at 12% 2%, rgba(88,101,242,0.22), transparent 60%), radial-gradient(900px 420px at 92% 12%, rgba(114,137,218,0.14), transparent 56%), linear-gradient(180deg, #1e1f22 0%, #1e1f22 100%)",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "22px 18px" }}>
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            padding: "14px 14px",
            marginBottom: 14,
            borderRadius: 18,
            border: "1px solid #3f4147",
            background: "linear-gradient(180deg, rgba(49,51,56,0.96), rgba(43,45,49,0.94))",
            backdropFilter: "blur(12px)",
            boxShadow: "0 14px 40px rgba(0,0,0,0.28)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Ø§Ù„ØºØ±ÙØ©</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{roomName || "ØºØ±ÙØ© ØµÙˆØªÙŠØ©"}</div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
              {joined ? (isHost ? "Ø£Ù†Øª Ø§Ù„Ù…Ø¶ÙŠÙ" : canSpeak ? "Ù…ØªÙƒÙ„Ù…" : "Ù…Ø³ØªÙ…Ø¹") : ""}
            </div>
          </div>

          {joined ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
              <button
                onClick={() => {
                  setChatOpen(true);
                  setChatUnread(0);
                }}
                title="Ø§Ù„Ø´Ø§Øª"
                aria-label="Ø§Ù„Ø´Ø§Øª"
                style={{
                  padding: "10px 12px",
                  background: "rgba(16,16,16,0.85)",
                  borderRadius: 14,
                  border: "1px solid #3f4147",
                  position: "relative",
                }}
              >
                <ChatIcon size={18} />
                {chatUnread > 0 ? (
                  <span
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 999,
                      background: "#ef4444",
                      color: "#1e1f22",
                      fontSize: 12,
                      fontWeight: 900,
                      display: "grid",
                      placeItems: "center",
                      padding: "0 6px",
                      border: "1px solid #1e1f22",
                    }}
                  >
                    {chatUnread}
                  </span>
                ) : null}
              </button>

              <button
                onClick={copyInviteLink}
                title="Ù†Ø³Ø® Ø±Ø§Ø¨Ø· Ø§Ù„Ø¯Ø¹ÙˆØ©"
                aria-label="Ù†Ø³Ø® Ø±Ø§Ø¨Ø· Ø§Ù„Ø¯Ø¹ÙˆØ©"
                style={{ padding: "10px 12px", background: "rgba(16,16,16,0.85)", borderRadius: 14, border: "1px solid #3f4147" }}
              >
                <CopyIcon size={18} />
              </button>

              {canSpeak ? (
                <button
                  onClick={toggleMic}
                  title={micOn ? "Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„Ù…ÙŠÙƒØ±ÙˆÙÙˆÙ†" : "ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…ÙŠÙƒØ±ÙˆÙÙˆÙ†"}
                  aria-label={micOn ? "Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„Ù…ÙŠÙƒØ±ÙˆÙÙˆÙ†" : "ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…ÙŠÙƒØ±ÙˆÙÙˆÙ†"}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: micOn ? "rgba(22,163,74,0.18)" : "rgba(16,16,16,0.85)",
                    border: micOn ? "1px solid rgba(22,163,74,0.7)" : "1px solid #3f4147",
                    fontWeight: 900,
                  }}
                >
                  {micOn ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
                </button>
              ) : null}

              {isHost ? (
                <button
                  onClick={hostEndRoom}
                  title="Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„ØºØ±ÙØ©"
                  aria-label="Ø¥Ù†Ù‡Ø§Ø¡ Ø§Ù„ØºØ±ÙØ©"
                  style={{ padding: "10px 12px", background: "rgba(127,29,29,0.18)", borderRadius: 14, border: "1px solid rgba(127,29,29,0.8)" }}
                >
                  <EndIcon size={18} />
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        {!joined ? (
          <section
            style={{
              marginTop: 16,
              padding: 16,
              border: "1px solid #3f4147",
              borderRadius: 20,
              background: "linear-gradient(180deg, rgba(49,51,56,0.96), rgba(43,45,49,0.95))",
              backdropFilter: "blur(10px)",
              boxShadow: "0 16px 50px rgba(0,0,0,0.35)",
            }}
          >
            {joining ? (
              <div style={{ fontSize: 13, opacity: 0.8, lineHeight: 1.7 }}>
                Ø¬Ø§Ø±Ù Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„ØºØ±ÙØ©â€¦
                {status ? <div style={{ marginTop: 10, color: "#fca5a5" }}>{status}</div> : null}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
                  {isHostView ? "Ø³ØªØ¯Ø®Ù„ ÙƒÙ…Ø¶ÙŠÙ Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø²" : "Ø§ÙƒØªØ¨ Ø§Ø³Ù…Ùƒ Ù„Ù„Ø¯Ø®ÙˆÙ„"}
                </div>

                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ø§Ø³Ù…Ùƒ"
                  style={{ width: "100%", padding: 12, borderRadius: 12, background: "#1e1f22", border: "1px solid #3f4147", color: "#f9fafb" }}
                />

                <button
                  onClick={() => joinRoom()}
                  style={{ marginTop: 12, padding: "12px 14px", background: "#5865f2", borderRadius: 12, fontWeight: 800 }}
                >
                  Ø¯Ø®ÙˆÙ„ Ø§Ù„ØºØ±ÙØ©
                </button>

                {status ? <div style={{ marginTop: 10, color: "#fca5a5", fontSize: 13 }}>{status}</div> : null}
              </>
            )}
          </section>
        ) : (
          <>
            <section style={{ marginTop: 14, padding: 14, border: "1px solid #3f4147", borderRadius: 16, background: "linear-gradient(180deg,#2b2d31,#0b0b0b)" }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Ø£Ù†Øª</div>
                    <div style={{ fontWeight: 800 }}>{name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Ø§Ù„Ø¯ÙˆØ±</div>
                    <div style={{ fontWeight: 800 }}>{selfRole}</div>
                  </div>
                </div>

                {canSpeak ? (
                  <button
                    onClick={toggleMic}
                    title={micOn ? "Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„Ù…Ø§ÙŠÙƒ" : "ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…Ø§ÙŠÙƒ"}
                    aria-label={micOn ? "Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„Ù…Ø§ÙŠÙƒ" : "ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…Ø§ÙŠÙƒ"}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: micOn ? "#052e16" : "#1e1f22",
                      border: micOn ? "1px solid #16a34a" : "1px solid #3f4147",
                      boxShadow: micOn && localSpeaking ? "0 0 0 4px rgba(34,197,94,0.20), 0 0 16px rgba(34,197,94,0.45)" : "none",
                      fontWeight: 800,
                    }}
                  >
                    {micOn ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Ø£Ù†Øª Ù…Ø³ØªÙ…Ø¹</div>
                    <button
                      onClick={handRaised ? cancelRequestMic : requestMic}
                      title={handRaised ? "Ø¥Ù„ØºØ§Ø¡ Ø·Ù„Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ" : "Ø·Ù„Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ"}
                      aria-label={handRaised ? "Ø¥Ù„ØºØ§Ø¡ Ø·Ù„Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ" : "Ø·Ù„Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ"}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: handRaised ? "#2a1b06" : "#1e1f22",
                        border: handRaised ? "1px solid #f59e0b" : "1px solid #3f4147",
                        fontWeight: 800,
                      }}
                    >
                      <HandIcon size={18} />
                    </button>
                  </div>
                )}
              </div>
              {status ? <div style={{ marginTop: 8, color: "#fca5a5", fontSize: 13 }}>{status}</div> : null}
            </section>

            {/* Ù…Ø³Ø§Ø­Ø© Ù„Ù„ÙƒØªØ§Ø¨/Ø§Ù„Ù…Ø­ØªÙˆÙ‰ */}
            <section style={{ marginTop: 14, padding: 16, border: "1px solid #3f4147", borderRadius: 16, background: "linear-gradient(180deg,#2b2d31,#0b0b0b)", minHeight: 240, boxShadow: "0 10px 30px rgba(0,0,0,0.22)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Ø§Ù„ÙƒØªØ§Ø¨</div>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>
                    {activeBook ? activeBook.title : "Ù„Ù… ÙŠØªÙ… Ø§Ø®ØªÙŠØ§Ø± ÙƒØªØ§Ø¨"}
                  </div>
                  {activeBook?.author ? <div style={{ fontSize: 12, opacity: 0.7 }}>{activeBook.author}</div> : null}
                </div>

                {isHost ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => setBookPickerOpen(true)}
                      title="Ø§Ø®ØªÙŠØ§Ø± ÙƒØªØ§Ø¨"
                      aria-label="Ø§Ø®ØªÙŠØ§Ø± ÙƒØªØ§Ø¨"
                      style={{ padding: "10px 12px", background: "#1e1f22", borderRadius: 12, border: "1px solid #3f4147" }}
                    >
                      <BookIcon size={18} />
                    </button>
                    {activeBook ? (
                      <button
                        onClick={hostClearBook}
                        title="Ù…Ø³Ø­ Ø§Ù„ÙƒØªØ§Ø¨"
                        aria-label="Ù…Ø³Ø­ Ø§Ù„ÙƒØªØ§Ø¨"
                        style={{ padding: "10px 12px", background: "#1e1f22", borderRadius: 12, border: "1px solid #3f4147" }}
                      >
                        <ClearIcon size={18} />
                      </button>
                    ) : null}
                    <button
                      onClick={hostSetHighlightFromSelection}
                      title="Ù‡Ø§ÙŠÙ„Ø§ÙŠØª"
                      aria-label="Ù‡Ø§ÙŠÙ„Ø§ÙŠØª"
                      style={{ padding: "10px 12px", background: "#1e1f22", borderRadius: 12, border: "1px solid #3f4147", fontSize: 12 }}
                    >
                      Ù‡Ø§ÙŠÙ„Ø§ÙŠØª
                    </button>
                    {highlightText ? (
                      <button
                        onClick={hostClearHighlight}
                        title="Ù…Ø³Ø­ Ø§Ù„Ù‡Ø§ÙŠÙ„Ø§ÙŠØª"
                        aria-label="Ù…Ø³Ø­ Ø§Ù„Ù‡Ø§ÙŠÙ„Ø§ÙŠØª"
                        style={{ padding: "10px 12px", background: "#2a0c0c", borderRadius: 12, border: "1px solid #7f1d1d", fontSize: 12 }}
                      >
                        Ù…Ø³Ø­
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 12, lineHeight: 1.7, fontSize: 13 }}>
                {activeBook ? (
                  activeBook.source === "gutendex" ? (
                    <RoomReader
                      bookId={activeBook.id}
                      chunkIndex={chunkIndex}
                      onChunkChange={(n) => {
                        if (isHost) hostSetChunk(n);
                      }}
                      isHost={isHost}
                      highlightText={highlightText}
                    />
                  ) : (
                    <RoomArabicReader
                      bookId={activeBook.id}
                      page={pageNumber}
                      onPageChange={(n) => {
                        if (isHost) hostSetPage(n);
                      }}
                      isHost={isHost}
                      highlightText={highlightText}
                    />
                  )
                ) : (
                  "Ø§Ù„Ù…Ø¶ÙŠÙ Ù„Ù… ÙŠØ­Ø¯Ø¯ ÙƒØªØ§Ø¨Ù‹Ø§ Ø¨Ø¹Ø¯."
                )}
              </div>
            </section>

            {/* Book picker modal */}
            {bookPickerOpen ? (
              <>
                <div
                  onClick={() => setBookPickerOpen(false)}
                  style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 55 }}
                />
                <div
                  style={{
                    position: "fixed",
                    top: "10vh",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "min(760px, 92vw)",
                    maxHeight: "80vh",
                    overflow: "auto",
                    background: "linear-gradient(180deg,#2b2d31,#0b0b0b)",
                    border: "1px solid #3f4147",
                    borderRadius: 18,
                    zIndex: 70,
                    padding: 14,
                    boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
                  }}
                  role="dialog"
                  aria-modal="true"
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 900 }}>Ø§Ø®ØªÙŠØ§Ø± ÙƒØªØ§Ø¨</div>
                    <button
                      onClick={() => setBookPickerOpen(false)}
                      title="Ø¥ØºÙ„Ø§Ù‚"
                      aria-label="Ø¥ØºÙ„Ø§Ù‚"
                      style={{ padding: "8px 10px", background: "#1e1f22", borderRadius: 12, border: "1px solid #3f4147" }}
                    >
                      <CloseIcon size={18} />
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select
                      value={bookLang}
                      onChange={(e) => setBookLang(e.target.value as any)}
                      style={{ padding: "12px 12px", borderRadius: 12, background: "#1e1f22", border: "1px solid #3f4147" }}
                      title="Ù„ØºØ© Ø§Ù„ÙƒØªØ¨"
                    >
                      <option value="ar">Ø¹Ø±Ø¨ÙŠ</option>
                      <option value="en">English</option>
                      <option value="all">Ø§Ù„ÙƒÙ„</option>
                    </select>

                    <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                      <input
                        value={bookSearch}
                        onChange={(e) => setBookSearch(e.target.value)}
                        placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ø¹Ù†ÙˆØ§Ù† Ø£Ùˆ Ù…Ø¤Ù„Ù..."
                        style={{ width: "100%", padding: "12px 12px 12px 40px", borderRadius: 12, background: "#1e1f22", border: "1px solid #3f4147" }}
                      />
                      <div style={{ position: "absolute", left: 12, top: 12, opacity: 0.7 }}>
                        <SearchIcon size={18} />
                      </div>
                    </div>
                    <button
                      onClick={() => searchBooks(bookSearch)}
                      style={{ padding: "12px 12px", background: "#5865f2", borderRadius: 12, fontWeight: 900 }}
                      title="Ø¨Ø­Ø«"
                      aria-label="Ø¨Ø­Ø«"
                    >
                      Ø¨Ø­Ø«
                    </button>
                  </div>

                  <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
                    {bookLang === "ar" ? "Ø§Ù„Ø¨Ø­Ø« Ø¹Ø¨Ø± ABL / Ø§Ù„Ù…ÙƒØªØ¨Ø© Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©." : "Ø§Ù„Ø¨Ø­Ø« Ø¹Ø¨Ø± Gutendex. Ø§Ø®ØªØ± Ø§Ù„Ù„ØºØ© (English/Ø§Ù„ÙƒÙ„)."}
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {bookLoading ? <div style={{ opacity: 0.7 }}>Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø¨Ø­Ø«...</div> : null}
                    {!bookLoading && bookResults.length === 0 ? <div style={{ opacity: 0.7 }}>Ù„Ø§ ØªÙˆØ¬Ø¯ Ù†ØªØ§Ø¦Ø¬.</div> : null}

                    {bookResults.slice(0, 12).map((b: any) => (
                      <button
                        key={String(b.id)}
                        onClick={() => (bookLang === "ar" ? hostSetBookFromAbl(b) : hostSetBookFromGutendex(b))}
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "center",
                          padding: 12,
                          borderRadius: 14,
                          background: "#101010",
                          border: "1px solid #232323",
                          textAlign: "right",
                        }}
                      >
                        <div style={{ width: 44, height: 60, borderRadius: 8, background: "#000", border: "1px solid #232323", overflow: "hidden", flex: "0 0 auto" }}>
                          {b?.formats?.["image/jpeg"] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.formats["image/jpeg"]} alt={b.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : null}
                        </div>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.title}</div>
                          <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {b?.authors?.[0]?.name ?? ""}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <span>ID: {b.id}</span>
                            {bookLang === "ar" && ((typeof b?.volumeLabel === "string" && b.volumeLabel.trim()) || (typeof b?.volumeNumber === "number" && b.volumeNumber > 0)) ? (
                              <span style={{ opacity: 0.8 }}>
                                Ø¬Ø²Ø¡: {b?.volumeLabel?.trim() || String(b?.volumeNumber)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {/* Ø´Ø±ÙŠØ· Ø§Ù„Ù…Ø´Ø§Ø±ÙƒÙŠÙ† (Bottom dock) */}
            <div
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 40,
                background: "linear-gradient(180deg, rgba(49,51,56,0.95), rgba(43,45,49,0.95))",
                backdropFilter: "blur(12px)",
                borderTop: "1px solid #3f4147",
              }}
            >
              <div style={{ maxWidth: 980, margin: "0 auto", padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Ø§Ù„Ù…Ø´Ø§Ø±ÙƒÙˆÙ†</div>
                    {isHost && handCount > 0 ? (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#f59e0b",
                          color: "#1e1f22",
                        }}
                        title="Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…Ø§ÙŠÙƒ"
                      >
                        âœ‹ {handCount}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>{Object.keys(peers).length} Ù…ØªØµÙ„</div>
                </div>

                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, paddingTop: 2 }}>
                  {Object.values(peers).map((p) => (
                    <button
                      key={p.peerId}
                      onClick={() => setSheetPeerId(p.peerId)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 170,
                        padding: "10px 12px",
                        borderRadius: 14,
                        background: "#101010",
                        border: "1px solid #232323",
                        textAlign: "right",
                      }}
                      title="ØªÙØ§ØµÙŠÙ„"
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 999,
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 900,
                          background: p.peerId === hostPeerId ? "#1d4ed8" : p.role === "speaker" ? "#16a34a" : "#374151",
                          boxShadow: speakingPeers[p.peerId] ? "0 0 0 3px rgba(34,197,94,0.20), 0 0 12px rgba(34,197,94,0.45)" : "none",
                          flex: "0 0 auto",
                          position: "relative",
                        }}
                        aria-hidden
                      >
                        {avatarLabel(p.displayName)}
                        {p.handRaised ? (
                          <span
                            style={{
                              position: "absolute",
                              right: -6,
                              bottom: -6,
                              width: 18,
                              height: 18,
                              borderRadius: 999,
                              background: "#f59e0b",
                              display: "grid",
                              placeItems: "center",
                              border: "1px solid #1e1f22",
                            }}
                            title="Ø·Ø§Ù„Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ"
                          >
                            <HandIcon size={12} color="#1e1f22" />
                          </span>
                        ) : null}
                      </div>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {p.displayName}
                          </div>
                          <span title={p.peerId === hostPeerId ? "Ù…Ø¶ÙŠÙ" : p.role === "speaker" ? "Ù…ØªÙƒÙ„Ù…" : "Ù…Ø³ØªÙ…Ø¹"} style={{ opacity: 0.8 }}>
                            {roleIcon(p.role, p.peerId === hostPeerId)}
                          </span>
                        </div>
                        {p.handRaised ? (
                          <div style={{ fontSize: 12, opacity: 0.7, display: "flex", alignItems: "center", gap: 4 }}>
                            <HandIcon size={12} />
                            <span>Ø·Ø§Ù„Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ</span>
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))}

                  {Object.keys(peers).length === 0 ? (
                    <div style={{ opacity: 0.7, fontSize: 13 }}>Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…Ø´Ø§Ø±ÙƒÙˆÙ†.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}

        <footer style={{ marginTop: 18, fontSize: 12, opacity: 0.5 }}>
          {isHostView ? "ÙˆØ¶Ø¹ Ø§Ù„Ù…Ø¶ÙŠÙ" : "ÙˆØ¶Ø¹ Ø§Ù„Ø¶ÙŠÙ"} â€” room/{token}
        </footer>

        {/* Chat side sheet */}
        {chatOpen ? (
          <>
            <div
              onClick={() => setChatOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 70 }}
            />
            <aside
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                height: "100vh",
                width: "min(420px, 92vw)",
                background: "linear-gradient(180deg,#2b2d31,#0b0b0b)",
                borderLeft: "1px solid #3f4147",
                zIndex: 80,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
              role="dialog"
              aria-modal="true"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Ø§Ù„Ø´Ø§Øª</div>
                <button
                  onClick={() => setChatOpen(false)}
                  title="Ø¥ØºÙ„Ø§Ù‚"
                  aria-label="Ø¥ØºÙ„Ø§Ù‚"
                  style={{ padding: "8px 10px", background: "#1e1f22", borderRadius: 12, border: "1px solid #3f4147" }}
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <div
                ref={chatListRef}
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: 10,
                  borderRadius: 14,
                  background: "#101010",
                  border: "1px solid #232323",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {messages.length === 0 ? <div style={{ opacity: 0.7, fontSize: 13 }}>Ù„Ø§ ØªÙˆØ¬Ø¯ Ø±Ø³Ø§Ø¦Ù„ Ø¨Ø¹Ø¯.</div> : null}
                {messages.map((m) => {
                  const mine = selfPeerId && m.peerId === selfPeerId;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-end",
                        alignSelf: mine ? "flex-end" : "flex-start",
                        maxWidth: "100%",
                      }}
                    >
                      {!mine ? (
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            background: "#374151",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 900,
                            flex: "0 0 auto",
                          }}
                          title={m.name || "Ù…Ø³ØªØ®Ø¯Ù…"}
                        >
                          {avatarLabel(m.name || "Ù…")}
                        </div>
                      ) : null}

                      <div style={{ display: "grid", gap: 4, maxWidth: "80%" }}>
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.75,
                            textAlign: mine ? "right" : "left",
                            display: "flex",
                            justifyContent: mine ? "flex-end" : "flex-start",
                            gap: 6,
                          }}
                        >
                          {!mine ? <span style={{ fontWeight: 800 }}>{m.name || "Ù…Ø³ØªØ®Ø¯Ù…"}</span> : null}
                          <span style={{ opacity: 0.55 }}>{new Date(m.ts).toLocaleTimeString()}</span>
                        </div>

                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: 14,
                            background: mine ? "#1d4ed8" : "#1e1f22",
                            border: mine ? "1px solid #1e40af" : "1px solid #3f4147",
                            color: "#fff",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.6,
                            textAlign: "right",
                            width: "fit-content",
                            maxWidth: "100%",
                          }}
                        >
                          {m.text}
                        </div>
                      </div>

                      {mine ? (
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            background: "#1d4ed8",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 900,
                            flex: "0 0 auto",
                          }}
                          title={m.name || "Ø£Ù†Øª"}
                        >
                          {avatarLabel(m.name || "Ø£")}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Ø§ÙƒØªØ¨ Ø±Ø³Ø§Ù„Ø©..."
                  style={{ flex: 1, padding: 12, borderRadius: 12, background: "#1e1f22", border: "1px solid #3f4147" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button
                  onClick={sendChat}
                  title="Ø¥Ø±Ø³Ø§Ù„"
                  aria-label="Ø¥Ø±Ø³Ø§Ù„"
                  style={{ padding: "12px 12px", borderRadius: 12, background: "#5865f2", fontWeight: 900 }}
                >
                  <SendIcon size={18} />
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.6 }}>Ø§Ù„Ø±Ø³Ø§Ø¦Ù„ Ù…Ø¤Ù‚ØªØ© ÙˆØªÙØ­Ø°Ù Ù…Ø¹ Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„ØºØ±ÙØ©.</div>
            </aside>
          </>
        ) : null}

        {/* Hidden audio elements (one per peer) */}
        <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }} aria-hidden>
          {Object.values(peers).map((p) => (
            <audio key={p.peerId} id={p.audioElId} autoPlay playsInline />
          ))}
        </div>

        {/* Side sheet */}
        {sheetPeer ? (
          <>
            <div
              onClick={() => setSheetPeerId(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                zIndex: 50,
              }}
            />

            <aside
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                height: "100vh",
                width: "min(420px, 92vw)",
                background: "linear-gradient(180deg,#2b2d31,#0b0b0b)",
                borderLeft: "1px solid #3f4147",
                zIndex: 60,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
              role="dialog"
              aria-modal="true"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Ø§Ù„Ù…Ø´Ø§Ø±Ùƒ</div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{sheetPeer.displayName}</div>
                </div>
                <button
                  onClick={() => setSheetPeerId(null)}
                  title="Ø¥ØºÙ„Ø§Ù‚"
                  aria-label="Ø¥ØºÙ„Ø§Ù‚"
                  style={{ padding: "8px 10px", background: "#1e1f22", borderRadius: 12, border: "1px solid #3f4147" }}
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <div style={{ padding: 12, borderRadius: 14, background: "#101010", border: "1px solid #232323" }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Ø§Ù„Ø¯ÙˆØ±</span>
                    <strong>{sheetPeer.role}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Ù‡Ùˆ Ø§Ù„Ù…Ø¶ÙŠÙØŸ</span>
                    <strong>{sheetPeer.peerId === hostPeerId ? "Ù†Ø¹Ù…" : "Ù„Ø§"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Ø·Ø§Ù„Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒØŸ</span>
                    <strong>{sheetPeer.handRaised ? "Ù†Ø¹Ù… âœ‹" : "Ù„Ø§"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Ø§Ù„Ù…Ø¹Ø±Ù‘Ù</span>
                    <code style={{ opacity: 0.85 }}>{sheetPeer.peerId}</code>
                  </div>
                </div>
              </div>

              {isHost && sheetPeer.role !== "host" ? (
                <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
                  {sheetPeer.role === "listener" ? (
                    <button
                      onClick={() => hostGrantMic(sheetPeer.peerId)}
                      title="Ù…Ù†Ø­ Ø§Ù„Ù…Ø§ÙŠÙƒ"
                      aria-label="Ù…Ù†Ø­ Ø§Ù„Ù…Ø§ÙŠÙƒ"
                      style={{ padding: "12px 12px", background: "#052e16", border: "1px solid #16a34a", borderRadius: 14, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <GrantIcon size={18} />
                    </button>
                  ) : (
                    <button
                      onClick={() => hostRevokeMic(sheetPeer.peerId)}
                      title="Ø³Ø­Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ"
                      aria-label="Ø³Ø­Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ"
                      style={{ padding: "12px 12px", background: "#2a1b06", border: "1px solid #f59e0b", borderRadius: 14, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <RevokeIcon size={18} />
                    </button>
                  )}

                  {sheetPeer.handRaised && sheetPeer.role === "listener" ? (
                    <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
                      Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø·Ù„Ø¨ Ø§Ù„Ù…Ø§ÙŠÙƒ. ÙŠÙ…ÙƒÙ†Ùƒ Ù…Ù†Ø­Ù‡ Ø§Ù„Ù…Ø§ÙŠÙƒ Ø¨Ø²Ø± "Ù…Ù†Ø­ Ø§Ù„Ù…Ø§ÙŠÙƒ" Ø£Ø¹Ù„Ø§Ù‡.
                    </div>
                  ) : null}

                  <button
                    onClick={() => hostKick(sheetPeer.peerId)}
                    title="Ø·Ø±Ø¯"
                    aria-label="Ø·Ø±Ø¯"
                    style={{ padding: "12px 12px", background: "#2a0c0c", border: "1px solid #7f1d1d", borderRadius: 14, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    <KickIcon size={18} />
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  {isHost ? "Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ù„Ù‡Ø°Ø§ Ø§Ù„Ù…Ø´Ø§Ø±Ùƒ." : "Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª ØªØ¸Ù‡Ø± Ù„Ù„Ù…Ø¶ÙŠÙ ÙÙ‚Ø·."}
                </div>
              )}

              <div style={{ marginTop: "auto", fontSize: 12, opacity: 0.55, lineHeight: 1.6 }}>
                Ù…Ù„Ø§Ø­Ø¸Ø©: ÙØªØ­ Ø§Ù„ØºØ±ÙØ© ÙÙŠ ØªØ¨ÙˆÙŠØ¨ Ø¢Ø®Ø± Ù„Ù†ÙØ³ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ù‚Ø¯ ÙŠØ³ØªØ¨Ø¯Ù„ Ø§Ù„Ø¬Ù„Ø³Ø©.
              </div>
            </aside>
          </>
        ) : null}
      </div>

      <style jsx>{`
        .room-page {
          -webkit-tap-highlight-color: transparent;
        }

        :global(.room-page input),
        :global(.room-page select),
        :global(.room-page textarea) {
          font-size: 16px;
        }

        :global(.room-page button) {
          touch-action: manipulation;
        }

        @media (max-width: 760px) {
          :global(.room-page > div) {
            padding: 12px 10px !important;
          }

          :global(.room-page header) {
            border-radius: 14px !important;
          }

          :global(.room-page footer) {
            padding-bottom: env(safe-area-inset-bottom, 0px);
          }
        }
      `}</style>
    </main>
  );
}

