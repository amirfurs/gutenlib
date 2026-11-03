import { LibraryClient } from "@/components/library/LibraryClient";

export const dynamic = "force-static";

export default function LibraryPage() {
  return <LibraryClient scope="english" />;
}
