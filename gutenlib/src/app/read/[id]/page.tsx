import { EpubReader } from "@/components/EpubReader";
import { Reader } from "@/components/Reader";

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ cfi?: string; mode?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const initialCfi = sp.cfi ? String(sp.cfi) : undefined;
  const mode = sp.mode === "txt" ? "txt" : "epub";

  if (mode === "txt") {
    return <Reader id={id} />;
  }

  return <EpubReader id={id} initialCfi={initialCfi} />;
}
