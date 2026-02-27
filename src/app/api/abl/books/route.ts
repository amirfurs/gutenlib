import { NextResponse } from "next/server";
import { toJson } from "@bufbuild/protobuf";
import { ablBookClient } from "@/lib/abl/client";
import {
  ListRequest_Sort,
  ListResponseSchema,
} from "@/lib/abl/proto/ablibrary/services/book_service/book_service_pb";
import { SortDirection } from "@/lib/abl/proto/ablibrary/types/common_pb";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(250, Math.max(1, Number(url.searchParams.get("perPage") ?? "40") || 40));
  const query = (url.searchParams.get("query") ?? "").trim();
  const title = (url.searchParams.get("title") ?? "").trim();
  const author = (url.searchParams.get("author") ?? "").trim();
  const publisher = (url.searchParams.get("publisher") ?? "").trim();
  const language = (url.searchParams.get("lang") ?? "ar").trim();

  const sortBy = Number(url.searchParams.get("sortBy") ?? "") || ListRequest_Sort.CONTRIBUTOR_DIED_AT;
  const sortDir = Number(url.searchParams.get("sortDir") ?? "") || SortDirection.DESCENDING;

  const diedFrom = (url.searchParams.get("diedFrom") ?? "").trim();
  const diedTo = (url.searchParams.get("diedTo") ?? "").trim();

  try {
    const client = ablBookClient({ language });

    const contributors: any[] = [];
    if (author) contributors.push({ name: author });
    if ((diedFrom || diedTo) && contributors.length) {
      // best-effort: DateTimeRange can accept local_string; upstream will interpret.
      contributors[0].died = {
        ...(diedFrom ? { from: { localString: diedFrom } } : {}),
        ...(diedTo ? { to: { localString: diedTo } } : {}),
      };
    }

    const res = await client.list({
      page,
      perPage,
      sortBy,
      sortDir,
      query,
      title,
      contributors,
      publishers: publisher ? [{ name: publisher }] : [],
      categories: url.searchParams.get("categories")?.split(",").filter(Boolean) ?? [],
      collections: url.searchParams.get("collections")?.split(",").filter(Boolean) ?? [],
      languages: url.searchParams.get("languages")?.split(",").filter(Boolean) ?? [],
      sources: url.searchParams.get("sources")?.split(",").filter(Boolean) as any,
      attachments: url.searchParams.get("hasPdf") === "true" ? [{ context: 2 }] : [],
      tags: [],
      status: [],
      isDownloaded: false,
      bookIds: [],
    });

    // Best compatibility: return fully-typed JSON from schema
    const json = toJson(ListResponseSchema, res);

    return NextResponse.json(json, {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "ABL request failed" },
      { status: 502 }
    );
  }
}
