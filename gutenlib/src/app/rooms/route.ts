import { NextResponse } from "next/server";
import { getVoiceServerUrl } from "@/lib/voice/config";

export async function POST(req: Request) {
  try {
    const baseUrl = getVoiceServerUrl();
    const body = await req.json();

    const targetUrl = new URL("/rooms", baseUrl);
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[/rooms] Error proxying to voice service:", error);
    return NextResponse.json(
      { ok: false, error: "VOICE_SERVICE_UNAVAILABLE" },
      { status: 502 }
    );
  }
}

