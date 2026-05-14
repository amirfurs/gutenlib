import Link from "next/link";
import { BookOpen, Globe, Mic, Search, BookMarked, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="relative" data-testid="home-page">
      {/* Hero section */}
      <section className="relative flex min-h-[70vh] flex-col items-center justify-center text-center animate-fade-in-up">
        {/* Floating ambient glows */}
        <div className="pointer-events-none absolute -top-32 left-1/4 h-80 w-80 rounded-full bg-amber-600/10 blur-[120px] animate-float" />
        <div className="pointer-events-none absolute -bottom-20 right-1/4 h-60 w-60 rounded-full bg-emerald-600/8 blur-[100px]" style={{ animationDelay: '3s', animation: 'float 8s ease-in-out infinite' }} />

        <div className="relative z-10 max-w-3xl px-4">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-600/10 px-4 py-1.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/20" data-testid="hero-badge">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Open-source library</span>
          </div>

          <h1 className="font-heading text-5xl font-bold leading-[1.1] tracking-tight text-white md:text-7xl" data-testid="hero-title">
            Your personal <br />
            <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 bg-clip-text text-transparent">
              book library
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-400" data-testid="hero-description">
            Discover thousands of free books, read inside the app, track your progress, and manage your personal library — all in one place.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4" data-testid="hero-actions">
            <Link href="/books" className="btn-primary inline-flex items-center gap-2 text-[15px]" data-testid="browse-books-btn">
              <BookOpen className="h-4 w-4" />
              Browse books
            </Link>
            <Link href="/ar/books" className="btn-glass inline-flex items-center gap-2 text-[15px]" data-testid="arabic-books-btn">
              <Globe className="h-4 w-4" />
              المكتبة العربية
            </Link>
          </div>
        </div>
      </section>

      {/* Features bento grid */}
      <section className="mt-8 mb-16" data-testid="features-section">
        <div className="grid gap-4 md:grid-cols-12 stagger-children">
          {/* Large card - Search */}
          <div className="glass-card rounded-2xl p-6 md:col-span-7" data-testid="feature-search">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/15 ring-1 ring-amber-500/20">
                  <Search className="h-5 w-5 text-amber-400" />
                </div>
                <h3 className="font-heading mt-4 text-xl font-semibold text-white">Instant search</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
                  Search across thousands of books by title, author, or topic. Get instant suggestions as you type.
                </p>
              </div>
              <div className="hidden h-32 w-48 rounded-xl bg-gradient-to-br from-amber-900/20 to-amber-700/5 ring-1 ring-amber-500/10 md:block" />
            </div>
          </div>

          {/* Small card - Read */}
          <div className="glass-card rounded-2xl p-6 md:col-span-5" data-testid="feature-read">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/15 ring-1 ring-emerald-500/20">
              <BookMarked className="h-5 w-5 text-emerald-400" />
            </div>
            <h3 className="font-heading mt-4 text-xl font-semibold text-white">Read in-app</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Read plain text or EPUB books right inside the app. Resume from where you left off anytime.
            </p>
          </div>

          {/* Small card - Library */}
          <div className="glass-card rounded-2xl p-6 md:col-span-5" data-testid="feature-library">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/15 ring-1 ring-purple-500/20">
              <BookOpen className="h-5 w-5 text-purple-400" />
            </div>
            <h3 className="font-heading mt-4 text-xl font-semibold text-white">Your library</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Favorites, custom lists, notes, and reading progress — everything saved locally and ready for sync.
            </p>
          </div>

          {/* Large card - Voice */}
          <div className="glass-card rounded-2xl p-6 md:col-span-7" data-testid="feature-voice">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/15 ring-1 ring-blue-500/20">
                  <Mic className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="font-heading mt-4 text-xl font-semibold text-white">Voice Rooms</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
                  Create voice rooms and discuss books together in real-time with WebRTC-powered audio.
                </p>
                <Link href="/voice" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition" data-testid="voice-rooms-link">
                  Enter Voice Rooms
                  <span aria-hidden>&#8594;</span>
                </Link>
              </div>
              <div className="hidden h-32 w-48 rounded-xl bg-gradient-to-br from-blue-900/20 to-blue-700/5 ring-1 ring-blue-500/10 md:block" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
