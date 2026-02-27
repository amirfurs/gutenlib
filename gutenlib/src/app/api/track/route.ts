import { NextRequest, NextResponse } from "next/server";
import { commit, getState, isoDay, prune, type AnalyticsEvent } from "@/lib/analytics/store";

export const runtime = "nodejs";

function getOrSetCookie(res: NextResponse, name: string, value: string, maxAgeSec: number) {
  res.cookies.set({
    name,
    value,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSec,
  });
}

function idFromCookie(req: NextRequest, name: string) {
  const c = req.cookies.get(name);
  return c?.value || null;
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  const bodyUnknown: unknown = await req.json().catch(() => ({}));
  const body = (typeof bodyUnknown === "object" && bodyUnknown !== null ? (bodyUnknown as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  // IDs (client provides, server sets fallback cookies)
  const existingVid = idFromCookie(req, "gl_vid");
  const existingSid = idFromCookie(req, "gl_sid");

  const vid = (typeof body.vid === "string" && body.vid.length > 0 ? body.vid : null) || existingVid || crypto.randomUUID();
  const sid = (typeof body.sid === "string" && body.sid.length > 0 ? body.sid : null) || existingSid || crypto.randomUUID();

  const pathname = typeof body.path === "string" ? body.path : "/";
  const ref = typeof body.ref === "string" ? body.ref : undefined;

  // best-effort metadata
  const ua = req.headers.get("user-agent") || undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;

  prune(now);

  const day = isoDay(now);
  commit((s) => {
    s.activeSessions[sid] = {
      sid,
      vid,
      lastSeen: now,
      firstSeen: s.activeSessions[sid]?.firstSeen ?? now,
    };

    if (!s.visitorsByDay[day]) s.visitorsByDay[day] = {};
    s.visitorsByDay[day][vid] = true;

    s.pageviewsByDay[day] = (s.pageviewsByDay[day] ?? 0) + 1;

    const ev: AnalyticsEvent = { ts: now, vid, sid, path: pathname, ref, ua, ip };
    s.lastEvents.push(ev);
  });

  const res = NextResponse.json({ ok: true, vid, sid, activeNow: Object.keys(getState().activeSessions).length });
  // 180 days visitor id, 2 days session id
  getOrSetCookie(res, "gl_vid", vid, 60 * 60 * 24 * 180);
  getOrSetCookie(res, "gl_sid", sid, 60 * 60 * 24 * 2);
  return res;
}
