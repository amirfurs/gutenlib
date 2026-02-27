import { NextRequest, NextResponse } from "next/server";
import { getState, isoDay, prune } from "@/lib/analytics/store";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return { ok: false as const, status: 500, msg: "ADMIN_TOKEN not set" };

  const hdr = req.headers.get("x-admin-token") || "";
  const q = req.nextUrl.searchParams.get("token") || "";
  const provided = hdr || q;

  if (provided !== token) return { ok: false as const, status: 401, msg: "Unauthorized" };
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
