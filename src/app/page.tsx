import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16">
      <div className="rounded-2xl bg-white/5 p-8 ring-1 ring-white/10">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">GutenLib</div>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white">Your English book library</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-300">
          A clean, fast personal library for English books: discover titles, keep track of what you’re reading, and continue from where you left off.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/books" className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Browse books
          </Link>
          <Link href="/voice" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
            دخول Voice Rooms
          </Link>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-sm font-semibold">Search</div>
            <div className="mt-1 text-xs text-zinc-400">Title & author search.</div>
          </div>
          <div className="rounded-lg bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-sm font-semibold">Read in app</div>
            <div className="mt-1 text-xs text-zinc-400">Read instantly and resume anytime.</div>
          </div>
          <div className="rounded-lg bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-sm font-semibold">Your library</div>
            <div className="mt-1 text-xs text-zinc-400">Favorites, lists, notes, and reading history.</div>
          </div>
        </div>
      </div>
    </main>
  );
}
