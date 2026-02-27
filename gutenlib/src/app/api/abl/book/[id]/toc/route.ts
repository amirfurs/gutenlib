import { NextResponse } from "next/server";
import { toJson } from "@bufbuild/protobuf";
import { ablBookClient } from "@/lib/abl/client";
import {
  TableOfContentsResponseSchema,
} from "@/lib/abl/proto/ablibrary/services/book_service/book_service_pb";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const language = (url.searchParams.get("lang") ?? "ar").trim();

  try {
    const client = ablBookClient({ language });
    const res = await client.tableOfContents({ bookId: id });
    const json = toJson(TableOfContentsResponseSchema, res);

    return NextResponse.json(json, {
      headers: {
        "Cache-Control": "s-maxage=600, stale-while-revalidate=86400",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "ABL request failed" }, { status: 502 });
  }
}
