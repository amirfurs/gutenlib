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

## 🚀 Deploy to Render (Recommended - Free Tier)

Deploy the voice signaling server to Render with one click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/amirfurs/gutenlib)

### Option A: One-Click Blueprint
1. Click the **Deploy to Render** button above (or open `https://render.com/deploy?repo=https://github.com/amirfurs/gutenlib`).
2. Render detects `render.yaml` automatically and configures the `gutenlib-voice-server` web service.
3. Click **Apply**.
4. Once deployed, copy your Render URL (e.g., `https://gutenlib-voice-server.onrender.com`).
5. In your Vercel Dashboard (`gutenlib-azure` -> Settings -> Environment Variables):
   - **Key:** `NEXT_PUBLIC_VOICE_SERVER_URL`
   - **Value:** `https://gutenlib-voice-server.onrender.com`
6. Redeploy Vercel.

### Option B: Manual Web Service Setup
1. Log into [Render Dashboard](https://dashboard.render.com/) → Click **New +** → **Web Service**.
2. Connect repository `https://github.com/amirfurs/gutenlib`.
3. Set the configuration:
   - **Name:** `gutenlib-voice-server`
   - **Root Directory:** `gutenlib/voice-server`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
4. Under **Environment Variables**, add:
   - `VOICE_ORIGINS` = `https://gutenlib-azure.vercel.app,http://localhost:3000`
5. Click **Create Web Service**.
6. Copy the assigned URL and set `NEXT_PUBLIC_VOICE_SERVER_URL` in Vercel.

---

## Deploy to Railway (Alternative)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. **Set root directory** to `gutenlib/voice-server`
4. Railway auto-detects `package.json` and runs `npm start`
5. Set environment variables in Railway dashboard:

| Variable | Value |
|----------|-------|
| `VOICE_ORIGINS` | `https://gutenlib-azure.vercel.app,http://localhost:3000` |
| `VOICE_PORT` | `3001` (Railway overrides with `PORT` automatically) |

6. Copy the Railway public URL (e.g. `https://gutenlib-voice.up.railway.app`)
7. Set on Vercel: `NEXT_PUBLIC_VOICE_SERVER_URL=https://gutenlib-voice.up.railway.app`

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
