import { ArabicReader } from "@/components/abl/ArabicReader";

export default async function ArabicReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const initialPage = sp.page ? Number(sp.page) : undefined;
  return <ArabicReader id={id} initialPage={Number.isFinite(initialPage) ? initialPage : undefined} />;
}
