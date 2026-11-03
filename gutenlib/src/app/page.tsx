import Link from "next/link";
import { ArrowRight, BookOpen, Headphones, Library, Search, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-3 sm:px-4 py-8 sm:py-16 md:py-24">
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-zinc-950/70 p-5 sm:p-8 md:p-12 ring-1 ring-white/10 shadow-2xl backdrop-blur-xl">
        {/* Subtle decorative glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl"
        />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold tracking-wider text-emerald-400 ring-1 ring-emerald-500/20">
            <Sparkles className="h-3.5 w-3.5" />
            <span>GUTENLIB READERS & AUDIO SESSIONS</span>
          </div>

          <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
            Where classical literature meets live voices.
          </h1>

          <p className="mt-3 sm:mt-4 max-w-2xl text-sm sm:text-base md:text-lg leading-relaxed text-zinc-300">
            Discover thousands of timeless public domain books, read in clean typography or EPUB format, and join collaborative voice rooms to read together in real-time.
          </p>

          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Link
              href="/books"
              className="pressable inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm hover:bg-zinc-100 min-h-[44px]"
            >
              <BookOpen className="h-4 w-4" />
              <span>Browse Catalog</span>
              <ArrowRight className="h-4 w-4 text-zinc-500" />
            </Link>

            <Link
              href="/voice"
              className="pressable inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-sm hover:bg-emerald-400 min-h-[44px]"
            >
              <Headphones className="h-4 w-4" />
              <span>Voice Rooms · جلسات القراءة</span>
            </Link>
          </div>

          {/* Staggered feature cards */}
          <div className="mt-8 sm:mt-12 grid gap-3 sm:gap-4 sm:grid-cols-3">
            <div className="interactive-card stagger-enter stagger-1 rounded-2xl bg-white/[0.03] p-4 sm:p-5 ring-1 ring-white/10">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/25">
                <Search className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-semibold text-white">Instant Discovery</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Search 70,000+ titles and authors with instant typeahead suggestions.
              </p>
            </div>

            <div className="interactive-card stagger-enter stagger-2 rounded-2xl bg-white/[0.03] p-4 sm:p-5 ring-1 ring-white/10">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-semibold text-white">Dual Format Reader</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Switch effortlessly between clean plain text and authentic EPUB rendering.
              </p>
            </div>

            <div className="interactive-card stagger-enter stagger-3 rounded-2xl bg-white/[0.03] p-4 sm:p-5 ring-1 ring-white/10">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/25">
                <Library className="h-5 w-5" />
              </div>
              <div className="mt-3 text-sm font-semibold text-white">Reading Groups</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Synchronized live reading, text highlights, and crystal-clear WebRTC voice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
