import { NextResponse } from "next/server";
import { getVoiceServerUrl } from "@/lib/voice/config";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const baseUrl = getVoiceServerUrl();
  const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");

  if (process.env.VOICE_SERVER_URL || isLocal) {
    try {
      const targetUrl = new URL(`/rooms/${encodeURIComponent(token)}`, baseUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch {
      // Fall through
    }
  }

  return NextResponse.json({
    ok: true,
    inviteToken: token,
    roomName: "غرفة قراءة",
    activeBook: null,
    reading: { kind: "chunk", index: 0 },
    participants: 1,
    hostPeerId: null,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  });
}
