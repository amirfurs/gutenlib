import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getState, isoDay, prune } from "@/lib/analytics/store";

export const runtime = "nodejs";

const failedAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (now > entry.resetAt) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= 5;
}

function recordFailedAttempt(ip: string) {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    failedAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
  } else {
    entry.count += 1;
  }
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function requireAdmin(req: NextRequest) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return { ok: false as const, status: 500, msg: "ADMIN_TOKEN not set" };

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return { ok: false as const, status: 429, msg: "Too many failed attempts. Try again later." };
  }

  const hdr = req.headers.get("x-admin-token") || "";
  const q = req.nextUrl.searchParams.get("token") || "";
  const provided = hdr || q;

  if (!provided || !safeCompare(provided, token)) {
    recordFailedAttempt(ip);
    return { ok: false as const, status: 401, msg: "Unauthorized" };
  }

  failedAttempts.delete(ip);
  return { ok: true as const };
}

function dayKeyOffset(daysAgo: number, now = Date.now()) {
  const ts = now - daysAgo * 24 * 60 * 60 * 1000;
  return isoDay(ts);
}

export async function GET(req: NextRequest) {
  const gate = requireAdmin(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.msg }, { status: gate.status });

  try {
    const now = Date.now();
    prune(now);
    const s = getState();

    const activeNow = Object.keys(s.activeSessions).length;
    const today = isoDay(now);

    const visitorsToday = Object.keys(s.visitorsByDay[today] ?? {}).length;

    const last7Days = Array.from({ length: 7 }, (_, i) => dayKeyOffset(i, now)).reverse();
    const visitors7dSet: Record<string, true> = {};
    let pageviews7d = 0;

    for (const day of last7Days) {
      const vids = s.visitorsByDay[day] ?? {};
      for (const vid of Object.keys(vids)) visitors7dSet[vid] = true;
      pageviews7d += s.pageviewsByDay[day] ?? 0;
    }

    const visitorsLast7Days = Object.keys(visitors7dSet).length;
    const pageviewsToday = s.pageviewsByDay[today] ?? 0;

    return NextResponse.json({
      ok: true,
      now,
      activeNow,
      visitorsToday,
      visitorsLast7Days,
      pageviewsToday,
      pageviewsLast7Days: pageviews7d,
      days: last7Days.map((d) => ({
        day: d,
        visitors: Object.keys(s.visitorsByDay[d] ?? {}).length,
        pageviews: s.pageviewsByDay[d] ?? 0,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stats error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
