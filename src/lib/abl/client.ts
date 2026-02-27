import { createClient, type Interceptor } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { BookService } from "@/lib/abl/proto/ablibrary/services/book_service/book_service_pb";

const BASE_URL = "https://grpc.ablibrary.net";

const addLanguageInterceptor = (language: string): Interceptor => (next) => async (req) => {
  req.header.set("x-language-id", language || "ar");
  return await next(req);
};

export function ablBookClient(opts?: { language?: string }) {
  const transport = createGrpcTransport({
    baseUrl: BASE_URL,
    interceptors: [addLanguageInterceptor(opts?.language ?? "ar")],
  });

  return createClient(BookService, transport);
}
