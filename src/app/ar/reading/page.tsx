import { ArabicReadingList } from "@/components/abl/ArabicReadingList";

export default function ArabicReadingPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10" dir="rtl">
      <h1 className="text-3xl font-black tracking-tight text-white">تتم القراءة</h1>
      <p className="mt-2 text-sm text-zinc-400">متابعة الكتب العربية من حيث توقفت (محفوظة في المتصفح).</p>
      <ArabicReadingList mode="reading" />
    </main>
  );
}
