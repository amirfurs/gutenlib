import { NextResponse } from "next/server";
import { getVoiceServerUrl } from "@/lib/voice/config";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  let body: { hostDisplayName?: string; roomName?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const roomName = String(body.roomName || "").trim().slice(0, 60);
  const hostDisplayName = String(body.hostDisplayName || "").trim().slice(0, 32);

  if (!roomName || !hostDisplayName) {
    return NextResponse.json({ ok: false, error: "INVALID_ROOM" }, { status: 400 });
  }

  const baseUrl = getVoiceServerUrl();
  const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");

  if (process.env.VOICE_SERVER_URL || isLocal) {
    try {
      const targetUrl = new URL("/rooms", baseUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostDisplayName, roomName }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fall through
    }
  }

  const inviteToken = nanoid(16);
  const hostSecret = nanoid(24);
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;

  return NextResponse.json({
    ok: true,
    inviteToken,
    hostSecret,
    roomName,
    hostDisplayName,
    expiresAt,
  });
}
