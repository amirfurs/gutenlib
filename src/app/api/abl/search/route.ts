import { NextResponse } from "next/server";
import { toJson } from "@bufbuild/protobuf";
import { ablBookClient, ablSearchClient } from "@/lib/abl/client";
import { normalizeArabic, normalizeQuery } from "@/lib/abl/normalizeArabic";
import { BackendLocation, SortDirection } from "@/lib/abl/proto/ablibrary/types/common_pb";
import { Scope, SearchRequest_Sort } from "@/lib/abl/proto/ablibrary/services/search_service/search_service_pb";
import type { SearchResult } from "@/lib/abl/proto/ablibrary/services/search_service/search_service_pb";
import { BookSchema } from "@/lib/abl/proto/ablibrary/types/book_pb";
import type { Page } from "@/lib/abl/proto/ablibrary/types/page_pb";
import type { PageContent } from "@/lib/abl/proto/ablibrary/types/page_content_pb";

let cachedIndexBackend: { remoteId: string; localId: string; updatedAt: number } | null = null;

async function getIndexBackendId(client: ReturnType<typeof ablSearchClient>, loc: BackendLocation): Promise<string> {
  const now = Date.now();
  if (cachedIndexBackend && now - cachedIndexBackend.updatedAt < 60 * 60 * 1000) {
    return loc === BackendLocation.LOCAL ? cachedIndexBackend.localId : cachedIndexBackend.remoteId;
  }

  try {
    const res = await client.listIndexBackends({});
    const pick = (want: BackendLocation) =>
      (res.backends ?? []).find((b) => Array.isArray((b as any).supportedLocations) && (b as any).supportedLocations.includes(want)) ??
      (res.backends ?? [])[0];

    const remote = pick(BackendLocation.REMOTE);
    const local = pick(BackendLocation.LOCAL);

    cachedIndexBackend = {
      remoteId: remote?.id ? String(remote.id) : "",
      localId: local?.id ? String(local.id) : "",
      updatedAt: now,
    };

    return loc === BackendLocation.LOCAL ? cachedIndexBackend.localId : cachedIndexBackend.remoteId;
  } catch {
    return "";
  }
}

function contentToText(node: PageContent): string {
  let out = "";
  const stack: PageContent[] = [node];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.data?.case === "text") {
      const t = cur.data.value.text ?? "";
      if (t) out += (out ? " " : "") + t;
    }
    if (cur.children?.length) {
      for (let i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i]!);
    }
  }
  return out;
}

function pageToText(page?: Page): string {
  const contents = page?.contents ?? [];
  let out = "";
  for (const c of contents) {
    const t = contentToText(c);
    if (!t) continue;
    out += (out ? " " : "") + t;
  }
  return out;
}

function makeExcerpt(text: string, qNorm: string): string {
  const normText = normalizeArabic(text);
  const i = normText.indexOf(qNorm);
  if (i < 0) return normText.slice(0, 200);
  const start = Math.max(0, i - 60);
  const end = Math.min(normText.length, i + qNorm.length + 140);
  return (start > 0 ? "..." : "") + normText.slice(start, end) + (end < normText.length ? "..." : "");
}

function simplifyResult(r: SearchResult, qNorm: string) {
  const book = r.book ? toJson(BookSchema, r.book as any) : null;

  let pageNumber = 0;
  let excerpt = "";

  const item = (r as any).result;
  if (item?.result?.case === "abx") {
    pageNumber = Number(item.result.value?.page?.number ?? 0) || 0;
    const text = pageToText(item.result.value?.page);
    excerpt = text ? makeExcerpt(text, qNorm) : "";
  } else if (item?.result?.case === "ocr") {
    pageNumber = Number(item.result.value?.page?.number ?? 0) || 0;
    const snippet = (item.result.value?.highlights ?? []).map((t: any) => t?.text).filter(Boolean).join(" ");
    excerpt = snippet ? makeExcerpt(snippet, qNorm) : "";
  }

  return {
    book,
    hitCount: Number((r as any).hitCount ?? 0) || 0,
    pageCount: Number((r as any).pageCount ?? 0) || 0,
    pageNumber,
    excerpt,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const qRaw = (url.searchParams.get("q") ?? "").trim();
  const lang = (url.searchParams.get("lang") ?? "ar").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(50, Math.max(1, Number(url.searchParams.get("perPage") ?? "20") || 20));
  const author = (url.searchParams.get("author") ?? "").trim();
  const publisher = (url.searchParams.get("publisher") ?? "").trim();

  const categories = (url.searchParams.get("categories") ?? "").trim();
  const collections = (url.searchParams.get("collections") ?? "").trim();
  const languages = (url.searchParams.get("languages") ?? "").trim();

  const scopeParam = (url.searchParams.get("scope") ?? "").trim();
  const sortParam = (url.searchParams.get("sort") ?? "relevance").trim();

  const qNorm = normalizeQuery(qRaw);
  if (!qNorm) return NextResponse.json({ q: qRaw, results: [], pagination: { currentPage: page, perPage, totalPages: 0, totalItems: 0 } });

  try {
    const client = ablSearchClient({ language: lang });
    const bookClient = ablBookClient({ language: lang });
    const indexBackendId = await getIndexBackendId(client, BackendLocation.REMOTE);

    const scopeList = (scopeParam ? scopeParam.split(",") : ["text", "remark", "footnote"]).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const scope: Scope[] = [];
    if (scopeList.includes("text")) scope.push(Scope.TEXT);
    if (scopeList.includes("remark")) scope.push(Scope.REMARK);
    if (scopeList.includes("footnote")) scope.push(Scope.FOOTNOTE);
    if (!scope.length) scope.push(Scope.TEXT, Scope.REMARK, Scope.FOOTNOTE);

    const SORT_MAP: Record<string, { sortBy: SearchRequest_Sort; sortDir: SortDirection }> = {
      relevance: { sortBy: SearchRequest_Sort.RELEVANCE, sortDir: SortDirection.DESCENDING },
      title_asc: { sortBy: SearchRequest_Sort.TITLE, sortDir: SortDirection.ASCENDING },
      title_desc: { sortBy: SearchRequest_Sort.TITLE, sortDir: SortDirection.DESCENDING },
      contributor_asc: { sortBy: SearchRequest_Sort.CONTRIBUTOR, sortDir: SortDirection.ASCENDING },
      contributor_desc: { sortBy: SearchRequest_Sort.CONTRIBUTOR, sortDir: SortDirection.DESCENDING },
      died_asc: { sortBy: SearchRequest_Sort.DIED_AT, sortDir: SortDirection.ASCENDING },
      died_desc: { sortBy: SearchRequest_Sort.DIED_AT, sortDir: SortDirection.DESCENDING },
      publisher_asc: { sortBy: SearchRequest_Sort.PUBLISHER, sortDir: SortDirection.ASCENDING },
      publisher_desc: { sortBy: SearchRequest_Sort.PUBLISHER, sortDir: SortDirection.DESCENDING },
      recent_desc: { sortBy: SearchRequest_Sort.RECENT, sortDir: SortDirection.DESCENDING },
      recent_asc: { sortBy: SearchRequest_Sort.RECENT, sortDir: SortDirection.ASCENDING },
    };
    const s = SORT_MAP[sortParam] ?? SORT_MAP.relevance;

    const languageIds = (languages ? languages.split(",") : ["ar"]).map((x) => x.trim()).filter(Boolean);
    const categoryIds = (categories ? categories.split(",") : []).map((x) => x.trim()).filter(Boolean);
    const collectionIds = (collections ? collections.split(",") : []).map((x) => x.trim()).filter(Boolean);

    try {
      const res = await client.search({
        query: qRaw,
        scope,
        books: [],
        contributors: author ? [author] : [],
        diedAt: [],
        publishers: publisher ? [publisher] : [],
        languageIds: languageIds.length ? languageIds : ["ar"],
        categoryIds,
        collectionIds,
        paginate: { page, perPage },
        sortBy: s.sortBy,
        sortDir: s.sortDir,
        backendLocation: BackendLocation.REMOTE,
        indexBackendId,
      });

      const results = (res.results ?? []).map((r) => simplifyResult(r as any, qNorm)).filter((r) => r.book?.id);
      const p: any = res.pagination ?? {};

      const pagination = {
        currentPage: Number(p.currentPage ?? page) || page,
        perPage: Number(p.perPage ?? perPage) || perPage,
        totalPages: Number(p.totalPages ?? 0) || 0,
        totalItems: Number(p.totalItems ?? 0) || 0,
      };

      return NextResponse.json({ q: qRaw, results, pagination }, { headers: { "Cache-Control": "no-store" } });
    } catch (inner: any) {
      if (!String(inner?.message ?? "").toLowerCase().includes("unimplemented")) throw inner;

      const listRes: any = await bookClient.list({
        page,
        perPage,
        query: qRaw,
        title: "",
        contributors: author ? [{ name: author }] : [],
        publishers: publisher ? [{ name: publisher }] : [],
        categories: categoryIds.map((id) => ({ id })),
        collections: collectionIds.map((id) => ({ id })),
        languages: languageIds.map((id) => ({ id })),
        sources: [],
        attachments: [],
        tags: [],
        status: [],
        isDownloaded: false,
        bookIds: [],
        sortBy: 0,
        sortDir: 0,
      });

      const books = Array.isArray(listRes?.books) ? listRes.books : [];
      const authorNorm = author.toLowerCase();
      const filtered = author
        ? books.filter((b: any) => (b?.contributors ?? []).some((c: any) => String(c?.contributor?.name ?? c?.displayName ?? "").toLowerCase().includes(authorNorm)))
        : books;

      return NextResponse.json({
        q: qRaw,
        source: "book.list-fallback",
        results: filtered.map((b: any) => ({ book: b, hitCount: 0, pageCount: 0, pageNumber: 0, excerpt: "" })),
        pagination: {
          currentPage: Number(listRes?.page ?? page) || page,
          perPage: Number(listRes?.perPage ?? perPage) || perPage,
          totalPages: Number(listRes?.totalPages ?? 0) || 0,
          totalItems: Number(listRes?.totalCount ?? filtered.length) || filtered.length,
        },
      }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "search failed", q: qRaw, results: [] }, { status: 502 });
  }
}
