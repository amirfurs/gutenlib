export const VOICE_SERVER_URL =
  (process.env.NEXT_PUBLIC_VOICE_SERVER_URL ?? "http://localhost:3001").trim().replace(/\/+$/, "");

/**
 * ICE servers (STUN/TURN)
 *
 * For production (cross-internet connections), you MUST add a TURN server.
 * Without TURN, peers behind symmetric NAT cannot connect.
 *
 * Set NEXT_PUBLIC_ICE_SERVERS as a JSON array, e.g.:
 * NEXT_PUBLIC_ICE_SERVERS='[
 *   {"urls":"stun:stun.l.google.com:19302"},
 *   {"urls":"turn:YOUR_TURN_HOST:3478","username":"YOUR_USER","credential":"YOUR_PASS"}
 * ]'
 *
 * Free TURN options:
 *  - https://www.metered.ca/tools/openrelay/  (open relay, no account needed for testing)
 *  - Twilio TURN (free tier)
 *  - Self-host coturn (free, open source)
 */
export const ICE_SERVERS: RTCIceServer[] = (() => {
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (raw && raw.trim()) {
    try {
      let text = raw.trim();
      // Normalize accidental CRLF tails and quote-wrapped JSON from dashboard/CLI.
      text = text.replace(/\r?\n/g, "").trim();

      let parsed: unknown = JSON.parse(text);

      // Some setups store JSON as a quoted string, e.g. "[{\"urls\":...}]"
      if (typeof parsed === "string") {
        const nested = parsed.trim();
        if (nested.startsWith("[") || nested.startsWith("{")) {
          parsed = JSON.parse(nested);
        }
      }

      if (Array.isArray(parsed)) return parsed as RTCIceServer[];
    } catch {
      // fall through
    }
  }

  // Safe fallback: include TURN too (not only STUN), so calls still work
  // even if NEXT_PUBLIC_ICE_SERVERS is malformed in env.
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turns:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ];
})();
