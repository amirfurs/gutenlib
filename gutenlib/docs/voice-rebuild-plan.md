# Voice Rebuild Plan (Hard Reset)

## Goal
Rebuild voice room with deterministic signaling and reliable cross-network audio.

## Scope
- Replace room voice logic in `src/app/room/[token]/page.tsx` (audio/signaling core).
- Keep UI shell Discord-like; isolate voice engine from UI state.
- Keep `voice-server/server.mjs` as pure signaling relay (no media path logic).

## Rebuild Rules
1. Single source of truth per peer connection (map by peerId).
2. Queue ICE until remote description is set.
3. Explicit offer/answer lifecycle with glare-safe handling.
4. Explicit local track attach/detach + renegotiation.
5. Robust remote audio attach even when `<audio>` mounts late.
6. TURN required in runtime ICE config (never STUN-only fallback in production).
7. Built-in debug panel for live connection states.

## Deliverables
- New voice engine sections in room page with clear phases:
  - connect/join
  - peer creation
  - signaling handlers
  - media attach
  - diagnostics
- Debug panel showing:
  - signalingState
  - iceConnectionState
  - connectionState
  - local sender present
  - remote track received
  - selected candidate type if available
- One production deploy after implementation + verification checklist.
