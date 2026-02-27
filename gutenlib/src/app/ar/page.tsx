import Link from "next/link";
import { BookOpen, Bookmark, CheckCircle2, Sparkles } from "lucide-react";

function Card({
  href,
  title,
  desc,
  icon,
  primary,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "group relative overflow-hidden rounded-2xl p-5 ring-1 transition " +
        (primary
          ? "bg-brand-500/10 ring-brand-500/25 hover:bg-brand-500/15"
          : "bg-white/5 ring-white/10 hover:bg-white/7 hover:ring-white/15")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-zinc-400">{desc}</div>
        </div>
        <div className={"grid h-10 w-10 place-items-center rounded-xl ring-1 transition " + (primary ? "bg-brand-500/15 ring-brand-500/25" : "bg-white/5 ring-white/10")}>{icon}</div>
      </div>
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5 blur-2xl transition group-hover:bg-white/10" />
    </Link>
  );
}

export default function ArabicHome() {
  return (
    <main dir="rtl" className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-500/15 ring-1 ring-brand-500/25">
          <Sparkles className="h-5 w-5 text-brand-500" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">مكتبتك العربية</h1>
          <p className="mt-1 text-sm text-zinc-400">اقرأ داخل التطبيق، تابع تقدّمك، واحفظ كتبك وملاحظاتك في مكان واحد.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card href="/ar/books" title="تصفّح الكتب" desc="بحث سريع وتنظيم أفضل للكتب." icon={<BookOpen className="h-5 w-5 text-brand-500" />} primary />
        <Card href="/ar/reading" title="أكمل القراءة" desc="تابع من حيث توقفت." icon={<Bookmark className="h-5 w-5 text-zinc-200" />} />
        <Card href="/ar/finished" title="المنتهية" desc="قائمة بالكتب التي أنهيتها." icon={<CheckCircle2 className="h-5 w-5 text-zinc-200" />} />
        <Card href="/ar/library" title="مكتبتي" desc="المفضلة، القوائم، والملاحظات." icon={<BookOpen className="h-5 w-5 text-zinc-200" />} />
      </div>
    </main>
  );
}
