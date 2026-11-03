/**
 * Resolves the active voice server URL.
 * In a browser environment, if connected to localhost or a private LAN IP,
 * it routes directly to port 3001 on the same host to prevent broken external proxying.
 */
export function getVoiceServerUrl(): string {
  if (typeof window !== "undefined" && window.location) {
    const host = window.location.hostname;
    const isLocalOrLan =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.endsWith(".local") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);

    if (isLocalOrLan) {
      const port = process.env.NEXT_PUBLIC_LOCAL_VOICE_PORT || "3001";
      return `${window.location.protocol}//${host}:${port}`;
    }
  }

  const raw = process.env.NEXT_PUBLIC_VOICE_SERVER_URL;
  if (raw) {
    const clean = raw.replace(/[\r\n]+/g, "").trim().replace(/\/+$/, "");
    if (clean && !clean.includes("gutenlib-production.up.railway.app")) {
      return clean;
    }
  }

  return "http://localhost:3001";
}

export const VOICE_SERVER_URL = typeof window !== "undefined" ? getVoiceServerUrl() : (process.env.NEXT_PUBLIC_VOICE_SERVER_URL?.replace(/[\r\n]+/g, "").trim().replace(/\/+$/, "") || "http://localhost:3001");

/**
 * Standard ICE servers including STUN and free TURN fallback relays.
 * For production with custom TURN, set NEXT_PUBLIC_ICE_SERVERS as a JSON array in environment.
 */
const fallback: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turns:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];

export const ICE_SERVERS: RTCIceServer[] = (() => {
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS;
  if (!raw?.trim()) return fallback;
  try {
    let value: unknown = JSON.parse(raw.trim());
    if (typeof value === "string") value = JSON.parse(value);
    if (!Array.isArray(value)) return fallback;
    const servers = value.filter((item): item is RTCIceServer => {
      if (!item || typeof item !== "object") return false;
      const urls = Array.isArray(item.urls) ? item.urls : [item.urls];
      return urls.length > 0 && urls.every((url: unknown) => typeof url === "string" && /^(stun|stuns|turn|turns):/i.test(url));
    });
    return servers.length ? servers : fallback;
  } catch {
    return fallback;
  }
})();

export const HAS_TURN = ICE_SERVERS.some((server) =>
  (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => /^turns?:/i.test(url))
);
