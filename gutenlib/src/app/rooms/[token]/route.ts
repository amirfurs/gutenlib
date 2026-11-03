import { NextResponse } from "next/server";
import { getVoiceServerUrl } from "@/lib/voice/config";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const baseUrl = getVoiceServerUrl();

    const targetUrl = new URL(`/rooms/${encodeURIComponent(token)}`, baseUrl);
    const response = await fetch(targetUrl);

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[/rooms/:token] Error proxying to voice service:", error);
    return NextResponse.json(
      { ok: false, error: "VOICE_SERVICE_UNAVAILABLE" },
      { status: 502 }
    );
  }
}

