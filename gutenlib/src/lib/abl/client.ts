import dns from "node:dns";
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { BookService } from "./proto/ablibrary/services/book_service/book_service_pb.ts";
import { SearchService } from "./proto/ablibrary/services/search_service/search_service_pb.ts";

try {
  dns.setDefaultResultOrder?.("ipv4first");
} catch {
  // best-effort
}

const BASE_URL = "https://grpc.ablibrary.net";

const addLanguageInterceptor = (language: string): Interceptor => (next) => async (req) => {
  req.header.set("x-language-id", language || "ar");
  return await next(req);
};

export function ablBookClient(opts?: { language?: string }) {
  const transport = createGrpcTransport({
    baseUrl: BASE_URL,
    interceptors: [addLanguageInterceptor(opts?.language ?? "ar")],
    nodeOptions: { rejectUnauthorized: false },
  });

  return createClient(BookService, transport);
}

export function ablSearchClient(opts?: { language?: string }) {
  const transport = createGrpcTransport({
    baseUrl: BASE_URL,
    interceptors: [addLanguageInterceptor(opts?.language ?? "ar")],
    nodeOptions: { rejectUnauthorized: false },
  });

  return createClient(SearchService, transport);
}
