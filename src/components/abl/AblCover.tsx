"use client";

import { useMemo } from "react";

function hash32(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length] as T;
}

const PALETTES: Array<[string, string, string]> = [
  ["#0ea5e9", "#8b5cf6", "#f43f5e"], // sky -> violet -> rose
  ["#22c55e", "#06b6d4", "#3b82f6"], // green -> cyan -> blue
  ["#f59e0b", "#ef4444", "#8b5cf6"], // amber -> red -> violet
  ["#14b8a6", "#6366f1", "#ec4899"], // teal -> indigo -> pink
  ["#fb7185", "#f97316", "#facc15"], // rose -> orange -> yellow
  ["#a78bfa", "#2dd4bf", "#60a5fa"], // purple -> teal -> blue
];

export function AblCover({
  title,
  subtitle,
  seed,
  className,
}: {
  title: string;
  subtitle?: string;
  seed: string;
  className?: string;
}) {
  const style = useMemo(() => {
    const h = hash32(seed);
    const pal = pick(PALETTES, h);
    const a = pal[h % 3];
    const b = pal[(h + 1) % 3];
    const c = pal[(h + 2) % 3];

    // vary angle a bit
    const angle = 120 + (h % 120);

    return {
      backgroundImage: `linear-gradient(${angle}deg, ${a}, ${b}, ${c})`,
    } as React.CSSProperties;
  }, [seed]);

  return (
    <div
      className={
        "relative grid h-full w-full place-items-center overflow-hidden text-center " +
        (className ? className : "")
      }
      style={style}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/25" />
      <div className="relative px-4">
        <div className="line-clamp-3 text-lg font-black leading-snug tracking-tight text-white drop-shadow sm:text-xl">
          {title}
        </div>
        {subtitle ? <div className="mt-2 line-clamp-1 text-xs text-white/85">{subtitle}</div> : null}
      </div>

      {/* subtle noise */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E)",
        }}
      />
    </div>
  );
}
