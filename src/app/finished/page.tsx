import { ReadingList } from "@/components/ReadingList";
import { CheckCircle2 } from "lucide-react";

export default function FinishedPage() {
  return (
    <main className="mx-auto max-w-5xl py-10 animate-fade-in-up" data-testid="finished-page">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/15 ring-1 ring-emerald-500/20">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-white" data-testid="finished-title">Finished</h1>
          <p className="mt-1 text-sm text-zinc-500">Books you marked as finished — saved in your browser.</p>
        </div>
      </div>
      <ReadingList mode="finished" />
    </main>
  );
}
