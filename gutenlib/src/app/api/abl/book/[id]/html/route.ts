import { NextResponse } from "next/server";
import { toJson } from "@bufbuild/protobuf";
import { ablBookClient } from "@/lib/abl/client";
import {
  HTMLContentsResponseSchema,
} from "@/lib/abl/proto/ablibrary/services/book_service/book_service_pb";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const language = (url.searchParams.get("lang") ?? "ar").trim();

  const page = Number(url.searchParams.get("page") ?? "");
  const pageId = (url.searchParams.get("pageId") ?? "").trim();

  try {
    const client = ablBookClient({ language });
    const res = await client.hTMLContents({
      bookId: id,
      pageNumbers: Number.isFinite(page) ? [page] : [],
      pageIds: pageId ? [pageId] : [],
    });

    const json = toJson(HTMLContentsResponseSchema, res);

    return NextResponse.json(json, {
      headers: {
        // page HTML can be big-ish; keep cache short
        "Cache-Control": "s-maxage=60, stale-while-revalidate=600",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "ABL request failed" }, { status: 502 });
  }
}
