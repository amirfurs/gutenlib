import { NextResponse } from "next/server";
import { gutendex, type GutendexBook } from "@/lib/gutendex";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await gutendex<GutendexBook>(`/books/${id}`);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
