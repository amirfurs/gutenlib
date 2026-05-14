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
  const query = decodeURIComponent((url.searchParams.get("query") ?? "").trim());
  const title = (url.searchParams.get("title") ?? "").trim();
  const author = (url.searchParams.get("author") ?? "").trim();
  const publisher = (url.searchParams.get("publisher") ?? "").trim();
  const language = (url.searchParams.get("lang") ?? "ar").trim();

  const sortBy = Number(url.searchParams.get("sortBy") ?? "") || ListRequest_Sort.CONTRIBUTOR_DIED_AT;
  const sortDir = Number(url.searchParams.get("sortDir") ?? "") || SortDirection.ASCENDING;

  const hasPdf = url.searchParams.get("hasPdf") === "true";

  try {
    const client = ablBookClient({ language });

    // Build contributors filter (matching reference project pattern)
    const contributors: any[] = [];
    if (author) {
      contributors.push({ name: author });
    }

    // Build the request matching reference project's pattern exactly
    const requestPayload: any = {
      page,
      perPage,
      sortBy,
      sortDir,
      query,
    };

    // Only add optional fields if they have values (matching reference behavior)
    if (title) requestPayload.title = title;
    if (contributors.length) requestPayload.contributors = contributors;
    if (publisher) requestPayload.publishers = [{ name: publisher }];

    const languages = url.searchParams.get("languages")?.split(",").filter(Boolean) ?? [];
    if (languages.length) requestPayload.languages = languages;

    const categories = url.searchParams.get("categories")?.split(",").filter(Boolean) ?? [];
    if (categories.length) requestPayload.categories = categories;

    const collections = url.searchParams.get("collections")?.split(",").filter(Boolean) ?? [];
    if (collections.length) requestPayload.collections = collections;

    const sources = url.searchParams.get("sources")?.split(",").filter(Boolean) ?? [];
    if (sources.length) requestPayload.sources = sources;

    if (hasPdf) requestPayload.attachments = [{ context: 2 }];

    const res = await client.list(requestPayload);

    const json = toJson(ListResponseSchema, res);

    return NextResponse.json(json, {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e: any) {
    console.error("[ABL] Error:", e?.message, e?.code);
    return NextResponse.json(
      { error: e?.message ?? "ABL request failed", code: e?.code },
      { status: 502 }
    );
  }
}
