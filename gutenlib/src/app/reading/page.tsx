import { ReadingList } from "@/components/ReadingList";

export default function ReadingPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-black tracking-tight text-white">Reading</h1>
      <p className="mt-2 text-sm text-zinc-400">Continue where you left off (saved in your browser).</p>
      <ReadingList mode="reading" />
    </main>
  );
}
