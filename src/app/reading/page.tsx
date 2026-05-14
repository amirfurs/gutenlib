import { ReadingList } from "@/components/ReadingList";
import { Bookmark } from "lucide-react";

export default function ReadingPage() {
  return (
    <main className="mx-auto max-w-5xl py-10 animate-fade-in-up" data-testid="reading-page">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/15 ring-1 ring-amber-500/20">
          <Bookmark className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-white" data-testid="reading-title">Reading</h1>
          <p className="mt-1 text-sm text-zinc-500">Continue where you left off — saved in your browser.</p>
        </div>
      </div>
      <ReadingList mode="reading" />
    </main>
  );
}
