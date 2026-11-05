# 📚 Gutenlib

> **Where Classical Literature Meets Live Collaborative Voices.**  
> A high-performance digital library and real-time social reading platform built with **Next.js 16**, **TypeScript**, **WebRTC**, and **Emil Kowalski's Design Engineering philosophy**.

---

## 🌟 Overview

**Gutenlib** bridges timeless literature with real-time human connection. It provides instant access to over 70,000 public domain English classics and tens of thousands of classical Arabic texts, complemented by low-latency **WebRTC collaborative voice rooms** for synchronized read-aloud sessions, book clubs, and study groups.

Designed with meticulous attention to detail, Gutenlib delivers tactile micro-interactions, responsive typography, and mobile-first ergonomics across phones, tablets, and desktops.

---

## ✨ Key Features

### 📖 Dual-Engine Reading Experience
* **Clean Typography Reader:** Optimized distraction-free reader with smart hierarchical Table of Contents (TOC) parsing, custom font size, line-height scaling, and persistent page memory.
* **Authentic EPUB Reader:** Full-featured EPUB reader powered by `epubjs` supporting bookmarks, reading progress tracking, in-book text search, customizable themes (Dark / Light / System), and local notes.
* **Offline-First Reading State:** Automatically saves reading progress, last-read page, and completed titles to local storage.

### 🌍 Dual Classical Catalogs (English & Arabic)
* **English Catalog (World Classics):**
  * Instant typeahead search with fast debounce across 70,000+ titles and authors.
  * Curated subjects and topics navigation.
  * Direct downloads in EPUB and TXT formats.
* **Arabic Classical Library (ABL):**
  * Direct integration with classical Arabic manuscript and book repositories.
  * Rich volume, page count, and publisher metadata.
  * Direct PDF downloads and Arabic read-in-browser support.

### 🎙️ Collaborative Voice Rooms (WebRTC)
* **Real-Time Audio Sessions:** Crystal-clear peer-to-peer audio reading groups with low latency.
* **Role-Based Controls:** Host, Speaker, and Listener roles with an interactive mic request ("raise hand") and moderation system.
* **Live Reading Synchronization:**
  * **Shared Book Picker:** Host can select any classic or Arabic book for the room.
  * **Progress Sync:** Live chunk-by-chunk synchronized reading across all participants.
  * **Broadcast Highlights:** Host highlights broadcast instantaneously to all listeners in the room.
  * **In-Room Chat:** Persistent real-time text chat alongside voice streaming.
* **Floating Call Bar:** Ergonomic call controls, active-speaker breathing pulse halo, mic toggles, and safe-area aware layout.

### 📚 Personal Library & Bookmarks
* **Favorites & Custom Shelves:** Save favorite books and organize custom reading lists.
* **Reading Tracker:** Dedicated "Reading" and "Finished" dashboards with progress bars.
* **Book Notes:** Inline note-taking tied to specific books.
* **Export & Import:** Full JSON backup and restore for all library data.

### 🎨 Design Engineering & Micro-Interactions
* Built following **Emil Kowalski's design engineering philosophy**:
  * Tactile `transform: scale(0.97)` active press feedback on all buttons and cards.
  * Custom cubic-bezier spring and ease curves (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer`).
  * Origin-aware 180ms ease-out dropdowns and centered `scale(0.95)` modal entrances.
  * Gated hover interactions (`@media (hover: hover) and (pointer: fine)`) to eliminate sticky hover bugs on touchscreens.

### 📱 Full Mobile Responsiveness (360px – 430px)
* 100% verified zero horizontal overflow (`scrollWidth === innerWidth`) across all screen sizes.
* Safe-area inset integration (`viewport-fit=cover`, `.pb-safe`, `.pt-safe`) for edge-to-edge iOS and Android screens.
* Mobile quick links momentum carousel (`.no-scrollbar`).
* Collapsible "Aa" typography popover on mobile readers to eliminate header clutter.
* Constrained mobile book covers to keep primary "Read in app" CTAs above the fold.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) |
| **UI & Styling** | React 19, [Tailwind CSS](https://tailwindcss.com/), [Lucide React Icons](https://lucide.dev/) |
| **Voice & Signaling** | Native WebRTC, WebSocket Signaling Server (`ws`), ICE / STUN / TURN fallback |
| **Book Parsers** | [ePub.js](https://github.com/futurepress/epub.js), Custom Plaintext Stream Paginate |
| **Data & APIs** | Catalog APIs, Arabic Book Library (ABL gRPC/REST proxy) |
| **Storage** | IndexedDB, LocalStorage, Local Analytics Engine |
| **Testing** | Node.js Test Runner, Headless Chrome DevTools Protocol Emulation |

---

## 📁 Project Structure

```
gutenlib/
├── src/
│   ├── app/                    # Next.js App Router pages and API routes
│   │   ├── api/                # Backend API routes (books, read, search, voice, abl)
│   │   ├── ar/                 # Arabic catalog, details, reader, and library
│   │   ├── book/[id]/          # Single book detail page
│   │   ├── books/              # English catalog browse & filter
│   │   ├── read/[id]/          # Dual EPUB / Plaintext Reader
│   │   ├── room/[token]/       # Live Voice Room session
│   │   ├── voice/              # Voice Rooms landing and room creation
│   │   ├── layout.tsx          # Root layout with viewport & safe-area config
│   │   └── page.tsx            # Hero landing page
│   ├── components/             # Reusable UI components
│   │   ├── voice/              # Voice room tools, call bar, and CSS
│   │   ├── library/            # LibraryClient, favorites, notes, backup
│   │   ├── Header.tsx          # Responsive sticky header & mobile nav carousel
│   │   ├── SearchBar.tsx       # Origin-aware typeahead search popover
│   │   ├── Reader.tsx          # Plain text typography reader with Aa popover
│   │   └── EpubReader.tsx      # EPUB viewer with bookmarks & search
│   ├── lib/                    # Core utilities & services
│   │   ├── voice/              # WebRTC engine, signaling config, and useVoiceRoom
│   │   ├── abl/                # Arabic library gRPC helpers & page cache
│   │   ├── gutendex.ts         # Gutendex API client with IPv4-first resolution
│   │   └── readingStore.ts     # Local reading progress store
│   └── instrumentation.ts      # Server instrumentation (IPv4 DNS priority)
├── voice-server/               # Dedicated WebSocket WebRTC signaling server
│   ├── server.mjs              # Node.js WebSocket signaling server
│   └── server.test.mjs         # Automated signaling test suite
├── scratch/                    # Test harnesses and automated verification scripts
│   ├── test_mobile_chrome.mjs  # 24-test mobile viewport Chrome emulation
│   └── full_system_test.mjs    # 33-test live API & WebRTC signaling suite
├── tokens.css                  # Design engineering design tokens
└── package.json
```

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js** v18.18+ or v20+ (v22 recommended)
* **npm**, **pnpm**, or **yarn**

### 2. Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/amirfurs/gutenlib.git
cd gutenlib/gutenlib
npm install
```

### 3. Environment Configuration
Create a `.env.local` file in the `gutenlib` folder:

```env
# Port for the Next.js app (default: 3000)
PORT=3000

# Voice signaling server URL (runs on port 3001)
NEXT_PUBLIC_VOICE_SERVER_URL=http://localhost:3001
```

### 4. Running the Development Environment

Start the **Voice Signaling Server**:
```bash
node voice-server/server.mjs
# Signaling server will listen on ws://localhost:3001
```

In a second terminal, start the **Next.js Web Application**:
```bash
npm run dev
# Next.js will be available at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Production Deployment (Vercel + Render)

Gutenlib is architected for production across two services:
1. **Frontend & Book APIs**: Hosted on **Vercel** (`https://gutenlib-azure.vercel.app`)
2. **WebRTC Voice Signaling Server**: Hosted on **Render** (free persistent Node.js web service)

### 1-Click Voice Server Deployment on Render
Deploy the persistent Socket.IO signaling server to Render with one click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/amirfurs/gutenlib)

1. Click **Deploy to Render** above.
2. Render detects `render.yaml` automatically and creates `gutenlib-voice-server`.
3. Click **Apply**.
4. Once deployed, copy your Render URL (e.g., `https://gutenlib-voice-server.onrender.com`).
5. In your Vercel Dashboard (`gutenlib-azure` -> **Settings** -> **Environment Variables**):
   - Add `NEXT_PUBLIC_VOICE_SERVER_URL` = `https://gutenlib-voice-server.onrender.com`
6. Redeploy your Vercel app. Rooms and live voice reading will now work globally on all mobile devices and desktop browsers!

---

## 🧪 Testing & Verification

Gutenlib includes an automated end-to-end verification suite covering APIs, WebRTC signaling, DOM hydration, and multi-device mobile viewport responsiveness:

### 1. Mobile Responsiveness Tests (Headless Chrome)
Verifies that all routes render with **0 horizontal overflow** and proper touch targets across 3 physical device profiles (360px Budget Android, 390px iPhone 14, 430px iPhone Pro Max):
```bash
node scratch/test_mobile_chrome.mjs
# Result: 24/24 passed with 0 horizontal overflow
```

### 2. Full Live System & WebRTC Test Suite
Tests all 10 API endpoints, SSR page rendering, real-time multi-peer voice signaling (host join, guest join, role upgrade, progress sync, highlight broadcast, kick), and headless Chrome hydration:
```bash
node scratch/full_system_test.mjs
# Result: 33/33 passed
```

### 3. Type Checking & Linting
```bash
npx tsc --noEmit
npm run lint
```

### 4. Production Build
```bash
npm run build
npm start
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
Public domain texts provided for free and open educational reading.
