import Link from "next/link";
import { BookOpen, Bookmark, CheckCircle2, Sparkles, Star } from "lucide-react";

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
      data-testid={`ar-card-${title.replace(/\s+/g, "-")}`}
      className={
        "glass-card group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 " +
        (primary ? "ring-1 ring-amber-500/15 hover:ring-amber-500/25" : "")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-ar-heading text-lg font-semibold text-white">{title}</div>
          <div className="font-ar-body mt-2 text-sm text-zinc-400 leading-relaxed">{desc}</div>
        </div>
        <div className={
          "grid h-11 w-11 place-items-center rounded-xl ring-1 transition " +
          (primary ? "bg-amber-600/15 ring-amber-500/20" : "bg-white/5 ring-white/8")
        }>
          {icon}
        </div>
      </div>
      <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-white/3 blur-2xl transition group-hover:bg-white/5" />
    </Link>
  );
}

export default function ArabicHome() {
  return (
    <main dir="rtl" className="mx-auto max-w-5xl py-10 animate-fade-in-up" data-testid="arabic-home-page">
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-600/15 ring-1 ring-amber-500/20">
          <Sparkles className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="font-ar-heading text-3xl font-bold tracking-tight text-white md:text-4xl" data-testid="ar-home-title">مكتبتك العربية</h1>
          <p className="font-ar-body mt-1 text-sm text-zinc-400 leading-relaxed">اقرأ داخل التطبيق، تابع تقدّمك، واحفظ كتبك وملاحظاتك في مكان واحد.</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 stagger-children">
        <Card href="/ar/books" title="تصفّح الكتب" desc="بحث سريع وتنظيم أفضل للكتب." icon={<BookOpen className="h-5 w-5 text-amber-400" />} primary />
        <Card href="/ar/reading" title="أكمل القراءة" desc="تابع من حيث توقفت." icon={<Bookmark className="h-5 w-5 text-zinc-300" />} />
        <Card href="/ar/finished" title="المنتهية" desc="قائمة بالكتب التي أنهيتها." icon={<CheckCircle2 className="h-5 w-5 text-zinc-300" />} />
        <Card href="/ar/library" title="مكتبتي" desc="المفضلة، القوائم، والملاحظات." icon={<Star className="h-5 w-5 text-zinc-300" />} />
      </div>
    </main>
  );
}
