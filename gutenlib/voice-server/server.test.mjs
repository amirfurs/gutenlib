import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { randomUUID } from "node:crypto";

process.env.VOICE_HOST_GRACE_MS = "250";
process.env.VOICE_ROOM_TTL_MS = "5000";
const { server, io } = await import("./server.mjs");
let base;
const clients = [];
const once = (socket, event, timeout = 2500) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(event, onEvent); reject(new Error("Timed out: " + event)); }, timeout);
  function onEvent(data) { clearTimeout(timer); resolve(data); }
  socket.once(event, onEvent);
});
async function client() { const socket = connect(base, { transports: ["websocket"], forceNew: true, reconnection: false }); clients.push(socket); await once(socket, "connect"); return socket; }
async function create() { const response = await fetch(base + "/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomName: "جلسة اختبار", hostDisplayName: "المضيف" }) }); assert.equal(response.status, 200); return response.json(); }
async function join(socket, room, host = false, clientId = randomUUID()) { const pending = once(socket, "joined"); socket.emit("join-room", { inviteToken: room.inviteToken, displayName: host ? "المضيف" : "ضيف", clientId, ...(host ? { hostSecret: room.hostSecret } : {}) }); return pending; }
before(async () => { await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); base = "http://127.0.0.1:" + server.address().port; });
after(async () => { for (const socket of clients) socket.disconnect(); await new Promise(resolve => io.close(resolve)); });

test("REST rejects invalid/null/oversized input and unlisted origins", async () => {
  for (const body of ["null", "{}", "not json", JSON.stringify({ roomName: " ", hostDisplayName: "x" })]) {
    const response = await fetch(base + "/rooms", { method: "POST", body }); assert.equal(response.status, 400);
  }
  assert.equal((await fetch(base + "/rooms", { method: "POST", body: "x".repeat(5000) })).status, 413);
  assert.equal((await fetch(base + "/rooms", { method: "POST", headers: { Origin: "https://gutenlib-attacker.vercel.app" }, body: "{}" })).status, 403);
});
test("a guest cannot claim host by joining first or copying a public peer ID", async () => {
  const room = await create(); const guest = await client();
  let rejected = once(guest, "join-error"); guest.emit("join-room", { inviteToken: room.inviteToken, displayName: "Guest", clientId: randomUUID() }); assert.equal((await rejected).error, "HOST_NOT_CONNECTED");
  const host = await client(); const joined = await join(host, room, true);
  const guestJoined = await join(guest, room, false, joined.selfPeerId);
  assert.equal(guestJoined.role, "listener"); assert.notEqual(guestJoined.selfPeerId, joined.selfPeerId);
  rejected = once(guest, "control-error"); guest.emit("host-end-room", { hostSecret: "bad" }); assert.equal((await rejected).error, "NOT_AUTHORIZED");
});
test("signaling is delivered only to the intended participant in the same room", async () => {
  const room = await create(); const host = await client(); await join(host, room, true);
  const a = await client(); const joinedA = await join(a, room);
  const b = await client(); await join(b, room);
  const seen = []; b.on("webrtc-offer", data => seen.push(data));
  const offer = once(a, "webrtc-offer"); host.emit("webrtc-offer", { toPeerId: joinedA.selfPeerId, sdp: { type: "offer", sdp: "test-sdp" } });
  assert.equal((await offer).sdp.sdp, "test-sdp");
  const otherRoom = await create(); const other = await client(); const otherJoined = await join(other, otherRoom, true);
  other.on("webrtc-offer", data => seen.push(data));
  host.emit("webrtc-offer", { toPeerId: otherJoined.selfPeerId, sdp: { type: "offer", sdp: "cross-room" } });
  await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(seen.length, 0);
});
test("host grants/revokes requests, reading state, and chat acknowledgments", async () => {
  const room = await create(); const host = await client(); await join(host, room, true);
  const guest = await client(); const g = await join(guest, room);
  let pending = once(host, "hand-updated"); guest.emit("request-mic"); assert.equal((await pending).handRaised, true);
  pending = once(guest, "role-updated"); host.emit("host-grant-mic", { hostSecret: room.hostSecret, targetPeerId: g.selfPeerId }); assert.equal((await pending).role, "speaker");
  pending = once(guest, "role-updated"); host.emit("host-revoke-mic", { hostSecret: room.hostSecret, targetPeerId: g.selfPeerId }); assert.equal((await pending).role, "listener");
  pending = once(host, "mic-updated"); guest.emit("mic-state", { micOn: true }); assert.equal((await pending).micOn, false);
  pending = once(guest, "book-updated"); host.emit("host-set-book", { hostSecret: room.hostSecret, book: { source: "gutendex", id: 1342, title: "Pride and Prejudice" } }); assert.equal((await pending).activeBook.id, 1342);
  pending = once(guest, "reading-updated"); host.emit("host-set-chunk", { hostSecret: room.hostSecret, chunkIndex: 4 }); assert.equal((await pending).reading.index, 4);
  pending = once(host, "control-error"); host.emit("host-set-page", { hostSecret: room.hostSecret, page: 2 }); assert.equal((await pending).error, "BAD_PAGE");
  assert.equal((await guest.timeout(1000).emitWithAck("chat-send", { text: "مرحبا" })).ok, true);
  assert.equal((await guest.timeout(1000).emitWithAck("chat-send", { text: "مجددا" })).error, "RATE_LIMITED");
});
test("replacement and reconnect retain one host; disconnect grace ends the room", async () => {
  const room = await create(); const host = await client(); const hostId = randomUUID(); const first = await join(host, room, true, hostId);
  const guest = await client(); await join(guest, room);
  const replacement = await client(); const replaced = once(host, "session-replaced"); const second = await join(replacement, room, true, hostId); await replaced;
  assert.equal(second.selfPeerId, first.selfPeerId);
  const live = await (await fetch(base + "/rooms/" + room.inviteToken)).json(); assert.equal(live.participants, 2);
  const ended = once(guest, "room-ended"); replacement.disconnect(); assert.equal((await ended).reason, "HOST_LEFT");
  assert.equal((await fetch(base + "/rooms/" + room.inviteToken)).status, 404);
});
test("kicked identity cannot rejoin; end-room disconnects all remaining clients", async () => {
  const room = await create(); const host = await client(); await join(host, room, true);
  const guest = await client(); const id = randomUUID(); const g = await join(guest, room, false, id);
  const kicked = once(guest, "kicked"); host.emit("host-kick", { hostSecret: room.hostSecret, targetPeerId: g.selfPeerId }); await kicked;
  const retry = await client(); const rejected = once(retry, "join-error"); retry.emit("join-room", { inviteToken: room.inviteToken, displayName: "Guest", clientId: id }); assert.equal((await rejected).error, "KICKED");
  const ended = once(host, "room-ended"); host.emit("host-end-room", { hostSecret: room.hostSecret }); assert.equal((await ended).reason, "HOST_ENDED");
});
test("malformed socket payloads do not crash the server", async () => {
  const socket = await client(); let rejected = once(socket, "join-error"); socket.emit("join-room", null); assert.equal((await rejected).error, "INVALID_PAYLOAD");
  const room = await create(); await join(socket, room, true);
  rejected = once(socket, "control-error"); socket.emit("host-kick", null); assert.equal((await rejected).error, "INVALID_PAYLOAD");
});
