import http from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import dotenv from "dotenv";

// Load env from Next's .env.local so phone-on-LAN works for the signaling server too.
try {
  dotenv.config({ path: new URL("../.env.local", import.meta.url) });
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

/**
 * Return the matching allowed origin for CORS, or the primary ORIGIN as fallback.
 * This makes REST endpoints consistent with Socket.IO multi-origin support.
 */
function getAllowOrigin(reqOrigin) {
  if (!reqOrigin) return ORIGIN;
  return ORIGINS.includes(reqOrigin) ? reqOrigin : ORIGIN;
}

/**
 * In-memory room state (MVP).
 * For production you likely want Redis.
 */
const rooms = new Map();

function now() {
  return Date.now();
}

function makeRoom() {
  const inviteToken = nanoid(16);
  const hostSecret = nanoid(24);
  const room = {
    inviteToken,
    hostSecret,
    roomName: "",
    hostDisplayName: "",
    createdAt: now(),
    expiresAt: now() + 2 * 60 * 60 * 1000, // 2h hard expiry
    hostPeerId: null,
    hostGraceTimer: null,
    activeBook: null, // { id, title, author, coverUrl }
    reading: { kind: "chunk", index: 0 },
    messages: [], // { id, peerId, name, text, ts }
    participants: new Map(), // peerId -> { peerId, displayName, role }
  };
  rooms.set(inviteToken, room);
  return room;
}

function cleanupRoomIfNeeded(room) {
  if (!room) return;
  // Only count connected participants (socketId != null)
  const connectedCount = Array.from(room.participants.values()).filter((p) => p.socketId).length;
  const expired = now() > room.expiresAt;
  if (connectedCount === 0 || expired) {
    rooms.delete(room.inviteToken);
  }
}

const server = http.createServer((req, res) => {
  // Minimal REST endpoints for room creation & status
  if (req.method === "POST" && req.url === "/rooms") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let payload = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }

      const room = makeRoom();
      const roomName = typeof payload.roomName === "string" ? payload.roomName : "";
      const hostDisplayName = typeof payload.hostDisplayName === "string" ? payload.hostDisplayName : "";
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
    if (!room) {
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
      participants: room.participants.size,
      hostPeerId: room.hostPeerId,
      expiresAt: room.expiresAt,
    }));
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": getAllowOrigin(req.headers.origin),
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("voice-server ok");
});

const io = new Server(server, {
  cors: {
    origin: ORIGINS,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ inviteToken, displayName, hostSecret, clientId }) => {
    const room = rooms.get(inviteToken);
    if (!room) {
      socket.emit("join-error", { error: "ROOM_NOT_FOUND" });
      return;
    }

    // basic expiry
    if (now() > room.expiresAt) {
      rooms.delete(inviteToken);
      socket.emit("join-error", { error: "ROOM_EXPIRED" });
      return;
    }

    const cid = typeof clientId === "string" && clientId.trim() ? clientId.slice(0, 32) : nanoid(10);
    const peerId = cid; // stable id per browser+room

    const isFirst = room.participants.size === 0;
    const isHostRejoin = typeof hostSecret === "string" && hostSecret === room.hostSecret;

    // if this peerId is already connected from another tab, replace it
    const existingSocketId = room.participants.get(peerId)?.socketId;
    if (existingSocketId && existingSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(existingSocketId);
      oldSocket?.emit("session-replaced", { reason: "NEW_TAB" });
      oldSocket?.disconnect(true);
    }

    const role = isHostRejoin ? "host" : isFirst ? "host" : (room.participants.get(peerId)?.role ?? "listener");

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
      handRaised: room.participants.get(peerId)?.handRaised ?? false,
      disconnectTimer: null,
    };

    // cancel pending disconnect removal
    const prev = room.participants.get(peerId);
    if (prev?.disconnectTimer) clearTimeout(prev.disconnectTimer);

    room.participants.set(peerId, participant);

    socket.data.inviteToken = inviteToken;
    socket.data.peerId = peerId;
    socket.data.clientId = cid;

    socket.join(inviteToken);

    // Send current peer list to the joiner
    const peers = Array.from(room.participants.values())
      .filter((p) => p.peerId !== peerId)
      .map((p) => ({ peerId: p.peerId, displayName: p.displayName, role: p.role, handRaised: !!p.handRaised }));

    socket.emit("joined", {
      roomId: inviteToken,
      selfPeerId: peerId,
      role,
      hostPeerId: room.hostPeerId,
      roomName: room.roomName,
      activeBook: room.activeBook,
      reading: room.reading,
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
      io.to(inviteToken).emit("host-updated", { hostPeerId: room.hostPeerId });
    }
  });

  // WebRTC signaling relay
  socket.on("webrtc-offer", ({ toPeerId, sdp }) => {
    const inviteToken = socket.data.inviteToken;
    if (!inviteToken) return;
    io.to(inviteToken).emit("webrtc-offer", { fromPeerId: socket.data.peerId, toPeerId, sdp });
  });

  socket.on("webrtc-answer", ({ toPeerId, sdp }) => {
    const inviteToken = socket.data.inviteToken;
    if (!inviteToken) return;
    io.to(inviteToken).emit("webrtc-answer", { fromPeerId: socket.data.peerId, toPeerId, sdp });
  });

  socket.on("webrtc-ice", ({ toPeerId, candidate }) => {
    const inviteToken = socket.data.inviteToken;
    if (!inviteToken) return;
    io.to(inviteToken).emit("webrtc-ice", { fromPeerId: socket.data.peerId, toPeerId, candidate });
  });

  // Chat
  socket.on("chat-send", ({ text }) => {
    const inviteToken = socket.data.inviteToken;
    const peerId = socket.data.peerId;
    if (!inviteToken || !peerId) return;

    const room = rooms.get(inviteToken);
    if (!room) return;

    const p = room.participants.get(peerId);
    if (!p) return;

    const t = String(text ?? "").trim();
    if (!t) return;

    // basic limits
    if (t.length > 400) return;

    const nowTs = Date.now();
    const last = socket.data.lastChatAt ?? 0;
    if (nowTs - last < 350) return; // rate limit
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
      if (!id) {
        socket.emit("control-error", { error: "BAD_BOOK" });
        return;
      }
    } else {
      if (!Number.isFinite(id) || id <= 0) {
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
    io.to(inviteToken).emit("book-updated", { activeBook: room.activeBook });
    io.to(inviteToken).emit("reading-updated", { reading: room.reading });
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
    io.to(inviteToken).emit("book-updated", { activeBook: null });
    io.to(inviteToken).emit("reading-updated", { reading: room.reading });
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
    if (!Number.isFinite(idx) || idx < 0) {
      socket.emit("control-error", { error: "BAD_CHUNK" });
      return;
    }

    room.reading = { kind: "chunk", index: Math.floor(idx) };
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
    if (!Number.isFinite(idx) || idx < 1) {
      socket.emit("control-error", { error: "BAD_PAGE" });
      return;
    }

    room.reading = { kind: "page", index: Math.floor(idx) };
    io.to(inviteToken).emit("reading-updated", { reading: room.reading });
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

    io.to(inviteToken).emit("room-ended", { reason: "HOST_ENDED" });
    rooms.delete(inviteToken);
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
    p.socketId = null;

    // For host: keep hostPeerId but if host doesn't return, end room (existing logic)
    if (peerId === room.hostPeerId) {
      io.to(inviteToken).emit("host-updated", { hostPeerId: room.hostPeerId });

      if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
      room.hostGraceTimer = setTimeout(() => {
        const stillThere = rooms.get(inviteToken);
        if (!stillThere) return;
        const host = stillThere.hostPeerId && stillThere.participants.get(stillThere.hostPeerId);
        if (!host || !host.socketId) {
          io.to(inviteToken).emit("room-ended", { reason: "HOST_LEFT" });
          rooms.delete(inviteToken);
        }
      }, 60_000);
    }

    if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
    p.disconnectTimer = setTimeout(() => {
      const stillThere = rooms.get(inviteToken);
      if (!stillThere) return;
      const cur = stillThere.participants.get(peerId);
      if (!cur) return;
      if (cur.socketId) return; // reconnected

      stillThere.participants.delete(peerId);
      io.to(inviteToken).emit("peer-left", { peerId });
      cleanupRoomIfNeeded(stillThere);
    }, 10_000);
  });
});

server.listen(PORT, () => {
  console.log(`[voice-server] listening on http://localhost:${PORT}`);
  console.log(`[voice-server] allowing origin: ${ORIGIN}`);
});
