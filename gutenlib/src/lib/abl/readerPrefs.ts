export type ReaderTheme = "system" | "light" | "dark";

export type ReaderPrefs = {
  theme: ReaderTheme;
  fontSizePx: number; // 14..26
  lineHeight: number; // 1.4..2.4
};

const KEY = "gutenlib.reader.prefs.v1";

export const DEFAULT_PREFS: ReaderPrefs = {
  theme: "system",
  fontSizePx: 18,
  lineHeight: 2,
};

export function loadPrefs(): ReaderPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const j = JSON.parse(raw);
    const theme = (j?.theme as ReaderTheme) ?? DEFAULT_PREFS.theme;
    const fontSizePx = Number(j?.fontSizePx ?? DEFAULT_PREFS.fontSizePx);
    const lineHeight = Number(j?.lineHeight ?? DEFAULT_PREFS.lineHeight);

    return {
      theme: theme === "light" || theme === "dark" || theme === "system" ? theme : DEFAULT_PREFS.theme,
      fontSizePx: clamp(fontSizePx, 14, 26),
      lineHeight: clamp(lineHeight, 1.4, 2.4),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: ReaderPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

function clamp(n: number, a: number, b: number) {
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}
