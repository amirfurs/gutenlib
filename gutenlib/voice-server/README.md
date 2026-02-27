# gutenlib Voice Server

Socket.IO signaling server for Gutenlib WebRTC voice rooms.

## Local development

From the project root:

```bash
npm run dev:voice
```

- Next.js → <http://localhost:3000>
- Voice server → <http://localhost:3001>

---

## Deploy to Railway (recommended, free tier)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. **Set root directory** to `voice-server`
4. Railway auto-detects `package.json` and runs `npm start`
5. Set environment variables in Railway dashboard:

| Variable | Value |
|----------|-------|
| `VOICE_ORIGINS` | `https://your-app.vercel.app,http://localhost:3000` |
| `VOICE_PORT` | `3001` (Railway overrides with `PORT` automatically) |

1. Copy the Railway public URL (e.g. `https://gutenlib-voice.up.railway.app`)
2. Set on Vercel: `NEXT_PUBLIC_VOICE_SERVER_URL=https://gutenlib-voice.up.railway.app`

---

## Deploy to Render

1. New Web Service → connect repo → set root to `voice-server`
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment vars same as Railway above

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VOICE_PORT` | `3001` | Port to listen on |
| `VOICE_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `VOICE_ORIGIN` | — | Single origin (back-compat, prefer `VOICE_ORIGINS`) |

---

## TURN servers (required for cross-internet audio)

Without TURN, users behind strict NAT (common on mobile, corporate networks) won't connect.

Set on Vercel:

```
NEXT_PUBLIC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:YOUR_HOST:3478","username":"USER","credential":"PASS"}]
```

Free options:

- [Metered open relay](https://www.metered.ca/tools/openrelay/) — no account needed for testing
- [coturn](https://github.com/coturn/coturn) — self-host on a VPS

---

## Notes

- Rooms are in-memory (lost on server restart). Use Redis for persistence.
- Host uses `hostSecret` to control participants (grant/revoke mic, kick, end room).
- Room expires after 2 hours of hard expiry or when all participants leave.
