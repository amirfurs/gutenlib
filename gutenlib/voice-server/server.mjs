import http from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import dotenv from "dotenv";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

// Load env from Next's .env.local so phone-on-LAN works for the signaling server too.
try {
  dotenv.config({ path: new URL("../.env.local", import.meta.url), quiet: true });
} catch {
  // ignore
}

const PORT = Number(process.env.PORT || process.env.VOICE_PORT || 3001);
// Allowed web origins.
// - VOICE_ORIGIN: single origin (back-compat)
// - VOICE_ORIGINS: comma-separated list (preferred)
const ORIGIN = process.env.VOICE_ORIGIN || "http://localhost:3000";
const ORIGINS = (process.env.VOICE_ORIGINS || ORIGIN)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(reqOrigin) {
  if (!reqOrigin) return true;
  if (ORIGINS.includes(reqOrigin) || ORIGINS.includes("*")) return true;

  try {
    const url = new URL(reqOrigin);
    const host = url.hostname;
    // Allow Gutenlib Vercel deployments
    if (
      host === "gutenlib-azure.vercel.app" ||
      host === "gutenlib.vercel.app" ||
      host.startsWith("gutenlib-git-") ||
      (process.env.VERCEL_URL && host === process.env.VERCEL_URL)
    ) {
      return true;
    }
    // Allow local development and LAN access
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.endsWith(".local") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

/**
 * Return the allowed origin for CORS, or the primary ORIGIN as fallback.
 */
function getAllowOrigin(reqOrigin) {
  if (!reqOrigin) return ORIGIN;
  return isAllowedOrigin(reqOrigin) ? reqOrigin : ORIGIN;
}

/**
 * In-memory room state (MVP).
 * For production you likely want Redis.
 */
const rooms = new Map();
const creationLimits = new Map();
const equalSecret = (a, b) => typeof a === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const HOST_GRACE_MS = Number(process.env.VOICE_HOST_GRACE_MS || 60_000);
const ROOM_TTL_MS = Number(process.env.VOICE_ROOM_TTL_MS || 7_200_000);

function endRoom(room, reason) {
  if (!rooms.has(room.inviteToken)) return;
  clearTimeout(room.hostGraceTimer);
  clearTimeout(room.expiryTimer);
  for (const p of room.participants.values()) clearTimeout(p.disconnectTimer);
  rooms.delete(room.inviteToken);
  io.to(room.inviteToken).emit("room-ended", { reason, summary: buildRoomSummary(room) });
  io.in(room.inviteToken).disconnectSockets(true);
}

function now() {
  return Date.now();
}

function makeRoom(customInviteToken, customHostSecret) {
  const inviteToken = (typeof customInviteToken === "string" && customInviteToken.trim()) || nanoid(16);
  const hostSecret = (typeof customHostSecret === "string" && customHostSecret.trim()) || nanoid(24);
  const room = {
    inviteToken,
    hostSecret,
    roomName: "",
    hostDisplayName: "",
    createdAt: now(),
    expiresAt: now() + ROOM_TTL_MS,
    hostPeerId: null,
    hostGraceTimer: null,
    activeBook: null, // { id, title, author, coverUrl }
    reading: { kind: "chunk", index: 0 },
    messages: [], // { id, peerId, name, text, ts }
    participants: new Map(), // peerId -> { peerId, displayName, role }
    maxParticipants: 0,
    highlight: null, // { text, by, ts }
    readingTrail: { kind: "chunk", seen: [0] },
    banned: new Set(),
  };
  rooms.set(inviteToken, room);
  room.expiryTimer = setTimeout(() => endRoom(room, "ROOM_EXPIRED"), ROOM_TTL_MS);
  room.expiryTimer.unref();
  return room;
}

function cleanupRoomIfNeeded(room) {
  if (!room) return;
  // Only count connected participants (socketId != null)
  const connectedCount = Array.from(room.participants.values()).filter((p) => p.socketId).length;
  const expired = now() > room.expiresAt;
  if ((connectedCount === 0 && room.participants.size === 0) || expired) {
    rooms.delete(room.inviteToken);
  }
}

function buildRoomSummary(room) {
  const durationMs = Math.max(0, now() - room.createdAt);
  return {
    durationMin: Math.round(durationMs / 60000),
    participantsPeak: room.maxParticipants || room.participants.size,
    activeBook: room.activeBook,
    reading: {
      kind: room.readingTrail?.kind || room.reading?.kind || "chunk",
      seen: Array.isArray(room.readingTrail?.seen) ? room.readingTrail.seen.slice(0, 500) : [],
      last: room.reading,
    },
    endedAt: now(),
  };
}

const server = http.createServer(async (req, res) => {
  // If request is for Socket.IO polling / handshake, allow Socket.IO listener to handle it
  if (req.url?.startsWith("/socket.io")) {
    return;
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (!isAllowedOrigin(req.headers.origin)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "ORIGIN_NOT_ALLOWED" }));
    return;
  }
  // Minimal REST endpoints for room creation & status
  if (req.method === "POST" && req.url === "/rooms") {
    let raw = "";
    let tooLarge = false;
    req.on("data", (c) => {
      if (tooLarge) return;
      raw += c;
      if (Buffer.byteLength(raw) > 4096) { tooLarge = true; res.writeHead(413); res.end(); }
    });
    req.on("end", () => {
      if (tooLarge) return;
      let payload = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }

      const roomName = typeof payload?.roomName === "string" ? payload.roomName : "";
      const hostDisplayName = typeof payload?.hostDisplayName === "string" ? payload.hostDisplayName : "";
      if (!roomName.trim() || !hostDisplayName.trim() || roomName.length > 60 || hostDisplayName.length > 32) {
        res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin) });
        res.end(JSON.stringify({ ok: false, error: "INVALID_ROOM" }));
        return;
      }
      const ip = req.socket.remoteAddress;
      for (const [key, entry] of creationLimits) if (now() - entry.start > 60_000) creationLimits.delete(key);
      const limit = creationLimits.get(ip) ?? { start: now(), count: 0 };
      if (++limit.count > 20 || rooms.size >= 1000) {
        res.writeHead(429, { "Content-Type": "application/json", "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin) });
        res.end(JSON.stringify({ error: "RATE_LIMITED" })); return;
      }
      creationLimits.set(ip, limit);
      const room = makeRoom();
      room.roomName = roomName.slice(0, 60);
      room.hostDisplayName = hostDisplayName.slice(0, 32);

      const body = JSON.stringify({
        inviteToken: room.inviteToken,
        hostSecret: room.hostSecret,
        roomName: room.roomName,
        hostDisplayName: room.hostDisplayName,
        expiresAt: room.expiresAt,
      });

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin),
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end(body);
    });
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/rooms/")) {
    const token = req.url.split("/")[2];
    const room = rooms.get(token);
    if (!room || now() > room.expiresAt) {
      if (room) endRoom(room, "ROOM_EXPIRED");
      res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin) });
      res.end(JSON.stringify({ ok: false, error: "ROOM_NOT_FOUND" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin) });
    res.end(JSON.stringify({
      ok: true,
      inviteToken: room.inviteToken,
      roomName: room.roomName,
      activeBook: room.activeBook,
      reading: room.reading,
      participants: Array.from(room.participants.values()).filter((p) => p.socketId).length,
      hostPeerId: room.hostPeerId,
      expiresAt: room.expiresAt,
    }));
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin),
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With,Accept,Origin",
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/gutendex/")) {
    const subpath = req.url.slice("/gutendex/".length);
    const targetUrl = new URL(subpath, "https://gutendex.com/");
    try {
      const gRes = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      const data = await gRes.text();
      res.writeHead(gRes.status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin),
        "Cache-Control": "public, max-age=600",
      });
      res.end(data);
      return;
    } catch (e) {
      res.writeHead(502, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin),
      });
      res.end(JSON.stringify({ error: String(e?.message || "Gutendex proxy failed") }));
      return;
    }
  }

  if (req.method === "GET" && (req.url === "/health" || req.url === "/healthz")) {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin),
    });
    res.end(JSON.stringify({ status: "ok", service: "gutenlib-voice-server", rooms: rooms.size }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("voice-server ok");
});

const io = new Server(server, {
  maxHttpBufferSize: 64 * 1024,
  allowRequest: (req, cb) => cb(null, isAllowedOrigin(req.headers.origin)),
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  // Reject malformed payloads before handlers destructure them. Never buffer
  // state changes from a replaced socket or from a deleted room.
  socket.use(([event, payload], next) => {
    const objectEvents = ["join-room", "chat-send", "mic-state", "webrtc-offer", "webrtc-answer", "webrtc-ice"];
    if ((objectEvents.includes(event) || event.startsWith("host-")) && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
      socket.emit(event === "join-room" ? "join-error" : "control-error", { error: "INVALID_PAYLOAD" });
      return;
    }
    if (event !== "join-room") {
      const p = rooms.get(socket.data.inviteToken)?.participants.get(socket.data.peerId);
      if (!p || p.socketId !== socket.id) return;
    }
    next();
  });
  socket.on("join-room", (payload = {}) => {
    const { inviteToken, displayName, hostSecret, clientId } = payload;
    let room = rooms.get(inviteToken);
    if (!room) {
      if (hostSecret && typeof hostSecret === "string" && hostSecret.trim().length >= 16) {
        room = makeRoom(inviteToken, hostSecret.trim());
        room.roomName = (typeof payload.roomName === "string" && payload.roomName ? payload.roomName : "غرفة قراءة").slice(0, 60);
        room.hostDisplayName = typeof displayName === "string" ? displayName.slice(0, 32) : "";
      } else {
        socket.emit("join-error", { error: "ROOM_NOT_FOUND" });
        return;
      }
    }

    // basic expiry
    if (now() > room.expiresAt) {
      endRoom(room, "ROOM_EXPIRED");
      socket.emit("join-error", { error: "ROOM_EXPIRED" });
      return;
    }

    if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 32) {
      socket.emit("join-error", { error: "INVALID_NAME" });
      return;
    }
    const cid = typeof clientId === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(clientId) ? clientId : nanoid(16);
    if (socket.data.inviteToken && socket.data.inviteToken !== inviteToken) {
      socket.emit("join-error", { error: "ALREADY_JOINED" }); return;
    }
    const isHostRejoin = equalSecret(hostSecret, room.hostSecret);
    if (hostSecret && !isHostRejoin) { socket.emit("join-error", { error: "HOST_AUTH_REQUIRED" }); return; }
    if (room.banned.has(cid)) { socket.emit("join-error", { error: "KICKED" }); return; }
    const prior = isHostRejoin && room.hostPeerId ? room.participants.get(room.hostPeerId) : Array.from(room.participants.values()).find((p) => p.clientId === cid);
    const peerId = prior?.peerId ?? nanoid(16);

    if (!room.hostPeerId && !isHostRejoin) {
      socket.emit("join-error", { error: "HOST_NOT_CONNECTED" });
      return;
    }
    const previous = room.participants.get(peerId);
    if (!previous?.socketId && Array.from(room.participants.values()).filter(p => p.socketId).length >= 8 && !isHostRejoin) {
      socket.emit("join-error", { error: "ROOM_FULL" }); return;
    }
    if (previous?.role === "host" && !isHostRejoin) {
      socket.emit("join-error", { error: "HOST_AUTH_REQUIRED" });
      return;
    }

    // if this peerId is already connected from another tab, replace it
    const existingSocketId = room.participants.get(peerId)?.socketId;
    if (existingSocketId && existingSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(existingSocketId);
      oldSocket?.emit("session-replaced", { reason: "NEW_TAB" });
      oldSocket?.disconnect(true);
    }

    const role = isHostRejoin ? "host" : (previous?.role ?? "listener");

    if (role === "host") {
      room.hostPeerId = peerId;
      if (room.hostGraceTimer) {
        clearTimeout(room.hostGraceTimer);
        room.hostGraceTimer = null;
      }
    }

    const participant = {
      peerId,
      clientId: cid,
      socketId: socket.id,
      displayName: String(displayName || (room.participants.get(peerId)?.displayName ?? "Guest")).slice(0, 32),
      role,
      micOn: false,
      handRaised: room.participants.get(peerId)?.handRaised ?? false,
      disconnectTimer: null,
    };

    // cancel pending disconnect removal
    const prev = room.participants.get(peerId);
    if (prev?.disconnectTimer) clearTimeout(prev.disconnectTimer);

    room.participants.set(peerId, participant);
    room.maxParticipants = Math.max(room.maxParticipants || 0, room.participants.size);

    socket.data.inviteToken = inviteToken;
    socket.data.peerId = peerId;
    socket.data.clientId = cid;

    socket.join(inviteToken);

    // Send current peer list to the joiner
    const peers = Array.from(room.participants.values())
      .filter((p) => p.peerId !== peerId && p.socketId)
      .map((p) => ({ peerId: p.peerId, displayName: p.displayName, role: p.role, handRaised: !!p.handRaised, micOn: !!p.micOn }));

    socket.emit("joined", {
      roomId: inviteToken,
      selfPeerId: peerId,
      role,
      hostPeerId: room.hostPeerId,
      handRaised: participant.handRaised,
      roomName: room.roomName,
      activeBook: room.activeBook,
      reading: room.reading,
      highlight: room.highlight,
      peers,
      expiresAt: room.expiresAt,
    });

    // Send chat history to joiner (last 50)
    socket.emit("chat-history", { messages: room.messages.slice(-50) });

    // Notify others: if peer already existed, treat as reconnect
    const existedBefore = prev != null;
    if (existedBefore) {
      socket.to(inviteToken).emit("peer-reconnected", { peerId, displayName: participant.displayName, role });
    } else {
      socket.to(inviteToken).emit("peer-joined", { peerId, displayName: participant.displayName, role });
    }

    if (role === "host") {
      io.to(inviteToken).emit("host-updated", { hostPeerId: room.hostPeerId, connected: true });
    }
  });

  // WebRTC signaling relay
  function relay(event, payload) {
    const inviteToken = socket.data.inviteToken;
    if (!inviteToken) return;
    const room = rooms.get(inviteToken);
    const sender = room?.participants.get(socket.data.peerId);
    const target = room?.participants.get(payload?.toPeerId);
    if (!sender || sender.socketId !== socket.id || !target?.socketId || target.peerId === sender.peerId) return;
    if (event === "webrtc-offer" && (!payload.sdp || payload.sdp.type !== "offer" || typeof payload.sdp.sdp !== "string")) return;
    if (event === "webrtc-answer" && (!payload.sdp || payload.sdp.type !== "answer" || typeof payload.sdp.sdp !== "string")) return;
    if (event === "webrtc-ice" && !payload.candidate?.candidate) return;
    io.to(target.socketId).emit(event, { fromPeerId: sender.peerId, ...(event === "webrtc-ice" ? { candidate: payload.candidate } : { sdp: payload.sdp }) });
  }
  socket.on("webrtc-offer", (payload) => relay("webrtc-offer", payload));
  socket.on("webrtc-answer", (payload) => relay("webrtc-answer", payload));
  socket.on("webrtc-ice", (payload) => relay("webrtc-ice", payload));

  // Chat
  socket.on("chat-send", ({ text }, ack) => {
    const reject = (error) => { if (typeof ack === "function") ack({ ok: false, error }); };
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken || !peerId) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    const p = room.participants.get(peerId);
    if (!p) return;

    const t = String(text ?? "").trim();
    if (!t) return reject("INVALID_MESSAGE");

    // basic limits
    if (t.length > 400 || typeof text !== "string") return reject("INVALID_MESSAGE");

    const nowTs = Date.now();
    const last = socket.data.lastChatAt ?? 0;
    if (nowTs - last < 350) return reject("RATE_LIMITED");
    socket.data.lastChatAt = nowTs;

    const msg = {
      id: nanoid(10),
      peerId,
      name: p.displayName,
      text: t,
      ts: nowTs,
    };

    room.messages.push(msg);
    if (room.messages.length > 300) room.messages.splice(0, room.messages.length - 300);

    io.to(inviteToken).emit("chat-message", msg);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("mic-state", ({ micOn }) => {
    const room = rooms.get(socket.data.inviteToken);
    const p = room?.participants.get(socket.data.peerId);
    if (!p) return;
    p.micOn = p.role !== "listener" && micOn === true;
    io.to(room.inviteToken).emit("mic-updated", { peerId: p.peerId, micOn: p.micOn });
  });

  // Mic request controls
  socket.on("request-mic", () => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken || !peerId) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    const p = room.participants.get(peerId);
    if (!p) return;

    // Only listeners request mic
    if (p.role !== "listener") return;

    p.handRaised = true;
    io.to(inviteToken).emit("hand-updated", { peerId, handRaised: true });
  });

  socket.on("cancel-request-mic", () => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken || !peerId) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    const p = room.participants.get(peerId);
    if (!p) return;

    p.handRaised = false;
    io.to(inviteToken).emit("hand-updated", { peerId, handRaised: false });
  });

  // Book controls
  socket.on("host-set-book", ({ hostSecret, book }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    // sanitize
    const source = book?.source === "abl" ? "abl" : "gutendex";

    const idRaw = book?.id;
    const id = source === "abl" ? String(idRaw ?? "").trim() : Number(idRaw);
    if (source === "abl") {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
        socket.emit("control-error", { error: "BAD_BOOK" });
        return;
      }
    } else {
      if (!Number.isSafeInteger(id) || id <= 0) {
        socket.emit("control-error", { error: "BAD_BOOK" });
        return;
      }
    }

    const title = typeof book?.title === "string" ? book.title.slice(0, 120) : `Book`;
    const author = typeof book?.author === "string" ? book.author.slice(0, 80) : "";
    const coverUrl = typeof book?.coverUrl === "string" ? book.coverUrl.slice(0, 300) : null;
    const lang = typeof book?.lang === "string" ? book.lang.slice(0, 8) : "";

    room.activeBook = { source, id, title, author, coverUrl, lang };
    room.reading = source === "abl" ? { kind: "page", index: 1 } : { kind: "chunk", index: 0 };
    room.readingTrail = { kind: room.reading.kind, seen: [room.reading.index] };
    room.highlight = null;
    io.to(inviteToken).emit("book-updated", { activeBook: room.activeBook });
    io.to(inviteToken).emit("reading-updated", { reading: room.reading });
    io.to(inviteToken).emit("highlight-updated", { highlight: null });
  });

  socket.on("host-clear-book", ({ hostSecret }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    room.activeBook = null;
    room.reading = { kind: "chunk", index: 0 };
    room.readingTrail = { kind: "chunk", seen: [0] };
    room.highlight = null;
    io.to(inviteToken).emit("book-updated", { activeBook: null });
    io.to(inviteToken).emit("reading-updated", { reading: room.reading });
    io.to(inviteToken).emit("highlight-updated", { highlight: null });
  });

  socket.on("host-set-chunk", ({ hostSecret, chunkIndex }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    const idx = Number(chunkIndex);
    if (!room.activeBook || room.activeBook.source !== "gutendex" || !Number.isSafeInteger(idx) || idx < 0 || idx > 100000) {
      socket.emit("control-error", { error: "BAD_CHUNK" });
      return;
    }

    room.reading = { kind: "chunk", index: Math.floor(idx) };
    if (room.readingTrail?.kind !== "chunk") room.readingTrail = { kind: "chunk", seen: [] };
    if (!room.readingTrail.seen.includes(room.reading.index)) room.readingTrail.seen.push(room.reading.index);
    io.to(inviteToken).emit("reading-updated", { reading: room.reading });
  });

  socket.on("host-set-page", ({ hostSecret, page }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    const idx = Number(page);
    if (!room.activeBook || room.activeBook.source !== "abl" || !Number.isSafeInteger(idx) || idx < 1 || idx > 100000) {
      socket.emit("control-error", { error: "BAD_PAGE" });
      return;
    }

    room.reading = { kind: "page", index: Math.floor(idx) };
    if (room.readingTrail?.kind !== "page") room.readingTrail = { kind: "page", seen: [] };
    if (!room.readingTrail.seen.includes(room.reading.index)) room.readingTrail.seen.push(room.reading.index);
    io.to(inviteToken).emit("reading-updated", { reading: room.reading });
  });

  socket.on("host-set-highlight", ({ hostSecret, text }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    const t = String(text ?? "").trim().slice(0, 1200);
    room.highlight = t ? { text: t, by: peerId, ts: now() } : null;
    io.to(inviteToken).emit("highlight-updated", { highlight: room.highlight });
  });

  socket.on("host-clear-highlight", ({ hostSecret }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    room.highlight = null;
    io.to(inviteToken).emit("highlight-updated", { highlight: null });
  });

  // Host controls
  socket.on("host-grant-mic", ({ targetPeerId, hostSecret }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    const p = room.participants.get(targetPeerId);
    if (!p) return;
    p.role = p.role === "host" ? "host" : "speaker";
    p.handRaised = false;

    io.to(inviteToken).emit("role-updated", { peerId: targetPeerId, role: p.role });
    io.to(inviteToken).emit("hand-updated", { peerId: targetPeerId, handRaised: false });
  });

  socket.on("host-revoke-mic", ({ targetPeerId, hostSecret }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    const p = room.participants.get(targetPeerId);
    if (!p) return;
    if (p.role === "host") return;
    p.role = "listener";
    p.micOn = false;
    p.handRaised = false;
    io.to(inviteToken).emit("mic-updated", { peerId: targetPeerId, micOn: false });
    io.to(inviteToken).emit("hand-updated", { peerId: targetPeerId, handRaised: false });

    io.to(inviteToken).emit("role-updated", { peerId: targetPeerId, role: p.role });
  });

  socket.on("host-kick", ({ targetPeerId, hostSecret }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    const p = room.participants.get(targetPeerId);
    if (!p) return;
    if (p.role === "host") return;

    room.banned.add(p.clientId);
    room.participants.delete(targetPeerId);
    clearTimeout(p.disconnectTimer);
    // notify and disconnect target
    if (p.socketId) {
      const targetSocket = io.sockets.sockets.get(p.socketId);
      targetSocket?.emit("kicked", { reason: "KICKED" });
      targetSocket?.disconnect(true);
    }

    room.participants.delete(targetPeerId);
    io.to(inviteToken).emit("peer-left", { peerId: targetPeerId });
    cleanupRoomIfNeeded(room);
  });

  socket.on("host-end-room", ({ hostSecret }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    if (peerId !== room.hostPeerId || hostSecret !== room.hostSecret) {
      socket.emit("control-error", { error: "NOT_AUTHORIZED" });
      return;
    }

    endRoom(room, "HOST_ENDED");
  });

  socket.on("disconnect", () => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken || !peerId) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    const p = room.participants.get(peerId);
    if (!p) return;

    // Mark disconnected but keep participant for a short grace period to allow refresh.
    if (p.socketId !== socket.id) return;
    p.socketId = null;
    io.to(inviteToken).emit("peer-left", { peerId });

    // For host: keep hostPeerId but if host doesn't return, end room (existing logic)
    if (peerId === room.hostPeerId) {
      io.to(inviteToken).emit("host-updated", { hostPeerId: room.hostPeerId, connected: false });

      if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
      room.hostGraceTimer = setTimeout(() => {
        const stillThere = rooms.get(inviteToken);
        if (!stillThere) return;
        const host = stillThere.hostPeerId && stillThere.participants.get(stillThere.hostPeerId);
        if (!host || !host.socketId) {
          endRoom(stillThere, "HOST_LEFT");
        }
      }, HOST_GRACE_MS);
    }

    if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
    p.disconnectTimer = setTimeout(() => {
      const stillThere = rooms.get(inviteToken);
      if (!stillThere) return;
      const cur = stillThere.participants.get(peerId);
      if (!cur) return;
      if (cur.socketId) return; // reconnected

      // Retain identity/role until room expiry so a refresh cannot lose host
      // ownership or a granted microphone. Disconnected peers are not listed.
    }, 10_000);
  });
});

export { server, io };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) server.listen(PORT, "0.0.0.0", () => {
  console.log(`[voice-server] listening on 0.0.0.0:${PORT}`);
  console.log(`[voice-server] primary origin: ${ORIGIN}`);
});
