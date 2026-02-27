# Gutenlib Voice Rooms — Documentation (WebRTC + Socket.IO)

This document explains how the **Voice Rooms** feature in `gutenlib` works, how to run it locally, how to deploy it, and what to configure to make it reliable (“perfect”) in real networks.

> **Architecture summary**
> - Frontend: Next.js (App Router) pages under `src/app/voice` and `src/app/room/[token]`.
> - Signaling + room state: Node server in `voice-server/` using Socket.IO.
> - Media: WebRTC **mesh** (each participant connects to each other participant).

---

## 1) Quick start (local dev)

From the project root:

```bash
npm run dev:voice
```

- Next.js: http://localhost:3000
- Voice signaling server: http://localhost:3001

Open:
- `/voice` to create a room
- You will be redirected to `/room/<token>?host=1`
- Share invite link `/room/<token>` or short link `/r/<token>`

---

## 2) Routes and pages

### `/voice`
Create a room:
- Collects `hostDisplayName` and `roomName`
- Calls `POST {VOICE_SERVER}/rooms`
- Stores host auth material in `localStorage` per room token
- Redirects to host view: `/room/<token>?host=1`

### `/room/[token]`
Main room UI:
- Joins Socket.IO room (`join-room`)
- Maintains peer list, roles, chat, and “hand raise” mic requests
- Creates WebRTC peer connections and attaches audio tracks

### `/r/[token]`
Invite redirect (short link) → `/room/<token>`

---

## 3) Backend: `voice-server` behavior

### REST endpoints
- `POST /rooms`
  - Creates a room
  - Returns `{ inviteToken, hostSecret, roomName, hostDisplayName, expiresAt }`

- `GET /rooms/:token`
  - Returns room status: name, active book, reading position, participants, host peer id, expiry

Rooms are stored **in-memory** (MVP). Restarting the server deletes all rooms.

### Socket events (high level)
**Client → Server**
- `join-room` `{ inviteToken, displayName, hostSecret?, clientId }`
- `webrtc-offer` / `webrtc-answer` / `webrtc-ice`
- chat: `chat-send`
- mic request: `request-mic`, `cancel-request-mic`
- host controls: `host-grant-mic`, `host-revoke-mic`, `host-kick`, `host-end-room`
- book controls: `host-set-book`, `host-clear-book`, `host-set-chunk`, `host-set-page`

**Server → Client**
- `joined`, `join-error`
- `peer-joined`, `peer-left`, `peer-reconnected`
- `host-updated`
- `role-updated`, `hand-updated`
- chat: `chat-history`, `chat-message`
- book/reading: `book-updated`, `reading-updated`
- moderation: `kicked`, `room-ended`

---

## 4) Roles and permissions

Roles are enforced on the server:
- **host**: can grant/revoke mic, kick, end room, set book and reading position
- **speaker**: can transmit audio (mic)
- **listener**: cannot transmit audio; can request mic (“raise hand”)

Implementation detail:
- The frontend only attaches a local audio track to WebRTC connections when the user **canSpeak** and `micOn` is true.

---

## 5) WebRTC media model (mesh)

This is a **mesh** voice room:
- Each participant creates a peer connection to each other participant.
- Cost grows quickly with the number of participants (CPU + bandwidth).

Recommended safe limits:
- 2–6 participants: generally fine
- 7–10: may work on good machines and networks
- 10+: consider switching to an SFU (mediasoup / LiveKit / Janus)

---

## 6) Configuration (env vars)

### Frontend env vars (`.env.local`)

- `NEXT_PUBLIC_VOICE_SERVER_URL`
  - Default: `http://localhost:3001`
  - Example: `https://voice.example.com`

- `NEXT_PUBLIC_ICE_SERVERS` (optional)
  - JSON array of ICE servers (STUN/TURN)
  - Example:

```env
NEXT_PUBLIC_ICE_SERVERS='[
  {"urls":["stun:stun.l.google.com:19302"]},
  {"urls":["turn:turn.example.com:3478"],"username":"user","credential":"pass"}
]'
```

> TURN is important for “perfect” reliability because many users are behind restrictive NATs.

### Voice server env vars

- `VOICE_PORT` (default `3001`)
- `VOICE_ORIGIN` (back-compat) single allowed origin, default `http://localhost:3000`
- `VOICE_ORIGINS` (preferred) comma-separated list of allowed origins
  - Example:

```env
VOICE_ORIGINS=http://localhost:3000,https://gutenlib.example.com
```

---

## 7) Deployment recommendations

### Critical: don’t host the voice-server inside serverless Next
Most serverless platforms do not support a long-lived WebSocket server.

Deploy `voice-server` as a separate Node service:
- VPS (systemd)
- Docker container
- Fly.io / Render / Railway (services with WebSocket support)

### HTTPS
WebRTC audio works best when:
- `https://...` in production
- or `http://localhost` for local dev

Browsers may block mic access or autoplay audio on insecure origins.

### TURN
For real-world usage, add TURN:
- coturn (self-hosted)
- Cloudflare Calls TURN (if applicable)
- Twilio/Nimbuzz/etc.

---

## 8) Known limitations (current MVP)

1) **No TURN configured by default** → some users cannot connect audio.
2) **In-memory rooms** → restart clears everything.
3) **Mesh scaling** → many participants will degrade.
4) **No explicit “Enable audio” UX** for strict mobile autoplay policies (some devices require a user click).

---

## 9) Troubleshooting checklist

### “I can’t join the room / connection error”
- Confirm `voice-server` is running and `NEXT_PUBLIC_VOICE_SERVER_URL` is correct.
- Check browser console network errors.
- Make sure `VOICE_ORIGINS` includes the site origin.

### “Joined but no one can hear me”
- Role must be **host** or **speaker**.
- Mic must be ON.
- Browser must have microphone permission.

### “Some users can’t hear anyone / NAT issues”
- Add TURN servers via `NEXT_PUBLIC_ICE_SERVERS`.

### “Works on desktop but not on mobile”
- Use HTTPS.
- Provide a user-gesture action (button) to start audio playback if needed.

---

## 10) What to improve to make it ‘perfect’

If the goal is a very reliable product, the next steps are:

1) **TURN by default** (most important)
2) **Audio enable flow** (a clear button if autoplay is blocked)
3) **Connection health UI**
   - show mic permission status
   - show connection state per peer
4) **Reconnection UX**
   - if server restarts, show “room ended” and link to create a new room
5) **Room persistence**
   - store room state in Redis (optional)
6) **Scale**
   - move from mesh → SFU if you want many participants
