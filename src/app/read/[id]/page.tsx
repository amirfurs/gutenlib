import { EpubReader } from "@/components/EpubReader";

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ cfi?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const initialCfi = sp.cfi ? String(sp.cfi) : undefined;
  return <EpubReader id={id} initialCfi={initialCfi} />;
}
