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
    });

    // Best compatibility: return fully-typed JSON from schema
    const json = toJson(ListResponseSchema, res) as any;

    const isArabicBook = (b: any) => {
      const langs = Array.isArray(b?.languages) ? b.languages : [];
      if (langs.length === 0) return false;
      return langs.some((l: any) => {
        const id = String(l?.id ?? "").toLowerCase();
        const name = String(l?.name ?? "").toLowerCase();
        return id === "ar" || name.includes("arab") || name.includes("عرب");
      });
    };

    if (language === "ar" && Array.isArray(json?.books)) {
      json.books = json.books.filter(isArabicBook);
      if (json?.pagination) {
        json.pagination.currentPageItems = json.books.length;
      }
    }

    // Safety net: if protobuf-to-json returns no books while raw response has books,
    // emit a minimal mapped shape so UI still gets ABL results.
    const rawBooksUnfiltered = Array.isArray((res as any)?.books) ? (res as any).books : [];
    const rawBooks = language === "ar" ? rawBooksUnfiltered.filter(isArabicBook) : rawBooksUnfiltered;
    if ((!json?.books || json.books.length === 0) && rawBooks.length > 0) {
      const mapped = rawBooks.map((b: any) => ({
        id: String(b?.id ?? ""),
        title: String(b?.title ?? ""),
        contributors: Array.isArray(b?.contributors)
          ? b.contributors.map((c: any) => ({ name: String(c?.name ?? "") }))
          : [],
        pagesCount: b?.pagesCount ?? null,
        categories: Array.isArray(b?.categories)
          ? b.categories.map((c: any) => ({ id: String(c?.id ?? ""), name: String(c?.name ?? "") }))
          : [],
        languages: Array.isArray(b?.languages)
          ? b.languages.map((l: any) => ({ id: String(l?.id ?? ""), name: String(l?.name ?? "") }))
          : [],
        volumeNumber: b?.volumeNumber ?? null,
        volumeLabel: b?.volumeLabel ?? null,
        attachments: Array.isArray(b?.attachments)
          ? b.attachments.map((a: any) => ({ context: a?.context ?? null, thumbnailUrl: a?.thumbnailUrl ?? null }))
          : [],
      }));

      return NextResponse.json(
        {
          books: mapped,
          pagination: json?.pagination ?? {
            currentPage: page,
            perPage,
            totalPages: null,
            totalItems: null,
            currentPageItems: mapped.length,
          },
          _fromRaw: true,
        },
        {
          headers: {
            "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

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
