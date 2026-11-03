/**
 * Safe UUID v4 generator that works reliably in all environments:
 * - Modern secure contexts (HTTPS / localhost)
 * - Insecure mobile contexts (HTTP over LAN IP, older mobile WebKit/Blink)
 * - Node.js SSR & Serverless Functions
 */
export function safeUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through on restricted environments
    }
  }

  // RFC4122 v4 UUID fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

