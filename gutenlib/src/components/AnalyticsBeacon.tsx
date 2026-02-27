"use client";

import { useEffect, useRef } from "react";

function getOrCreate(key: string, maxAgeMs: number) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const obj = JSON.parse(raw) as { v: string; ts: number };
      if (obj?.v && obj?.ts && Date.now() - obj.ts < maxAgeMs) return obj.v;
    }
  } catch {}

  const v = (globalThis.crypto && "randomUUID" in globalThis.crypto)
    ? (globalThis.crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    localStorage.setItem(key, JSON.stringify({ v, ts: Date.now() }));
  } catch {}
  return v;
}

export function AnalyticsBeacon() {
  const vidRef = useRef<string | null>(null);
  const sidRef = useRef<string | null>(null);

  useEffect(() => {
    vidRef.current = getOrCreate("gl_vid", 1000 * 60 * 60 * 24 * 180);
    sidRef.current = getOrCreate("gl_sid", 1000 * 60 * 60 * 24 * 2);

    const send = async () => {
      try {
        await fetch("/api/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            vid: vidRef.current,
            sid: sidRef.current,
            path: location.pathname,
            ref: document.referrer || undefined,
          }),
          keepalive: true,
        });
      } catch {}
    };

    // immediate + heartbeat
    send();
    const t = setInterval(send, 30_000);

    return () => clearInterval(t);
  }, []);

  return null;
}
