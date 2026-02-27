import { ArabicReadingList } from "@/components/abl/ArabicReadingList";

export default function ArabicFinishedPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10" dir="rtl">
      <h1 className="text-3xl font-black tracking-tight text-white">تمّت القراءة</h1>
      <p className="mt-2 text-sm text-zinc-400">كتب عربية قمت بوضعها كـ "تمت القراءة" (محفوظة في المتصفح).</p>
      <ArabicReadingList mode="finished" />
    </main>
  );
}
