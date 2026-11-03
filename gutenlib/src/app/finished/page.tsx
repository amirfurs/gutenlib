import { ReadingList } from "@/components/ReadingList";

export default function FinishedPage() {
  return (
    <main className="mx-auto max-w-5xl px-3 sm:px-4 py-6 sm:py-10">
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Finished</h1>
      <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-zinc-400">Books you marked as finished (saved in your browser).</p>
      <ReadingList mode="finished" />
    </main>
  );
}
