import fs from "fs";
import path from "path";

// NOTE: This is a lightweight analytics store intended for single-instance self-hosted deployments.
// On multi-instance/serverless (e.g. Vercel), file+memory storage will not be reliable.

export type AnalyticsEvent = {
  ts: number;
  vid: string; // visitor id
  sid: string; // session id
  path: string;
  ref?: string;
  ua?: string;
  ip?: string;
};

export type AnalyticsState = {
  version: 1;
  // When we last saw a session heartbeat.
  activeSessions: Record<string, { sid: string; vid: string; lastSeen: number; firstSeen: number }>;
  // Unique visitors by day.
  visitorsByDay: Record<string, Record<string, true>>; // day -> vid -> true
  // Total pageviews by day.
  pageviewsByDay: Record<string, number>;
  // Optional: last N events (debug)
  lastEvents: AnalyticsEvent[];
};

const DEFAULT_STATE: AnalyticsState = {
  version: 1,
  activeSessions: {},
  visitorsByDay: {},
  pageviewsByDay: {},
  lastEvents: [],
};

// Store under OS temp dir (works on self-hosted node). For serverless this is best-effort.
const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(STORE_DIR, "analytics.json");

let mem: AnalyticsState | null = null;

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function ensureDir() {
  try {
    if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
  } catch {
    // serverless or restricted FS: ignore
  }
}

function loadFromDisk(): AnalyticsState {
  try {
    ensureDir();
    if (!fs.existsSync(STORE_PATH)) return { ...DEFAULT_STATE };
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsedUnknown = safeParse(raw);
    if (!parsedUnknown || typeof parsedUnknown !== "object") return { ...DEFAULT_STATE };

    const parsed = parsedUnknown as Partial<AnalyticsState>;
    if (parsed.version !== 1) return { ...DEFAULT_STATE };

    return {
      ...DEFAULT_STATE,
      ...parsed,
      // defensive
      activeSessions: parsed.activeSessions ?? {},
      visitorsByDay: parsed.visitorsByDay ?? {},
      pageviewsByDay: parsed.pageviewsByDay ?? {},
      lastEvents: Array.isArray(parsed.lastEvents) ? parsed.lastEvents : [],
    };
  } catch {
    // If FS is unavailable (common on serverless), fall back to memory-only.
    return { ...DEFAULT_STATE };
  }
}

function saveToDisk(state: AnalyticsState) {
  try {
    ensureDir();
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // ignore on serverless
  }
}

export function getState(): AnalyticsState {
  if (!mem) mem = loadFromDisk();
  return mem;
}

export function commit(mut: (s: AnalyticsState) => void) {
  const s = getState();
  mut(s);
  mem = s;
  saveToDisk(s);
}

export function isoDay(ts: number) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function prune(now = Date.now(), activeWindowMs = 5 * 60 * 1000) {
  commit((s) => {
    for (const [sid, rec] of Object.entries(s.activeSessions)) {
      if (!rec?.lastSeen || now - rec.lastSeen > activeWindowMs) delete s.activeSessions[sid];
    }
    // cap lastEvents
    if (s.lastEvents.length > 500) s.lastEvents = s.lastEvents.slice(-200);
  });
}
