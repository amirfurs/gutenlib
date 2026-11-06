"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
  Headphones,
  Languages,
  Library,
  Star,
} from "lucide-react";
import { SearchBar } from "@/components/SearchBar";

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-sm min-h-[38px] shrink-0 " +
        (active
          ? "bg-white/15 text-white ring-white/20 shadow-sm"
          : "text-zinc-300 ring-white/10 hover:bg-white/5 hover:text-white")
      }
    >
      <span className={active ? "text-emerald-400" : "text-zinc-400"}>{icon}</span>
      <span className="font-medium whitespace-nowrap">{label}</span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();

  // Hide the global website header in voice rooms and landing to provide full-bleed immersive workspace
  if (pathname === "/voice" || pathname.startsWith("/room/") || pathname.startsWith("/r/")) {
    return null;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const inArabic = pathname === "/ar" || pathname.startsWith("/ar/");
  const inEnglishBooks =
    !inArabic &&
    (pathname === "/books" ||
      pathname.startsWith("/books/") ||
      pathname === "/book" ||
      pathname.startsWith("/book/") ||
      pathname === "/read" ||
      pathname.startsWith("/read/") ||
      pathname === "/reading" ||
      pathname.startsWith("/reading/") ||
      pathname === "/finished" ||
      pathname.startsWith("/finished/") ||
      pathname === "/library" ||
      pathname.startsWith("/library/"));

  const inArabicSection =
    inArabic &&
    (pathname === "/ar" ||
      pathname === "/ar/books" ||
      pathname.startsWith("/ar/books/") ||
      pathname.startsWith("/ar/book/") ||
      pathname.startsWith("/ar/read/") ||
      pathname.startsWith("/ar/reading") ||
      pathname.startsWith("/ar/finished") ||
      pathname.startsWith("/ar/library"));

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/" className="pressable group inline-flex items-center gap-2 text-sm font-black tracking-wide">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/15 ring-1 ring-brand-500/25 transition group-hover:bg-brand-500/20">
              <Library className="h-4.5 w-4.5 text-brand-500" />
            </span>
            <span className="hidden sm:inline">
              <span className="text-white">GUTEN</span>
              <span className="text-brand-500">LIB</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <NavItem href="/books" label="Books" icon={<BookOpen className="h-4 w-4" />} active={isActive("/books")} />
            {inEnglishBooks ? (
              <>
                <NavItem href="/library" label="Library" icon={<Star className="h-4 w-4" />} active={isActive("/library")} />
                <NavItem href="/reading" label="Reading" icon={<Bookmark className="h-4 w-4" />} active={isActive("/reading")} />
                <NavItem href="/finished" label="Finished" icon={<CheckCircle2 className="h-4 w-4" />} active={isActive("/finished")} />
              </>
            ) : null}

            <NavItem href="/ar" label="Arabic" icon={<Languages className="h-4 w-4" />} active={isActive("/ar")} />
            {inArabicSection ? (
              <>
                <NavItem href="/ar/library" label="مكتبتي" icon={<Star className="h-4 w-4" />} active={isActive("/ar/library")} />
                <NavItem href="/ar/reading" label="تتم القراءة" icon={<Bookmark className="h-4 w-4" />} active={isActive("/ar/reading")} />
                <NavItem href="/ar/finished" label="تمّت القراءة" icon={<CheckCircle2 className="h-4 w-4" />} active={isActive("/ar/finished")} />
              </>
            ) : null}

            <NavItem
              href="/voice"
              label="Voice Rooms"
              icon={<Headphones className="h-4 w-4" />}
              active={isActive("/voice") || isActive("/room")}
            />
          </nav>
        </div>

        <SearchBar />
      </div>

      {/* Mobile quick links */}
      <div className="mx-auto flex max-w-6xl items-center gap-1.5 overflow-x-auto no-scrollbar px-3 pb-2.5 pt-0.5 md:hidden">
        <NavItem href="/books" label="Books" icon={<BookOpen className="h-4 w-4" />} active={isActive("/books")} />
        {inEnglishBooks ? (
          <>
            <NavItem href="/library" label="Library" icon={<Star className="h-4 w-4" />} active={isActive("/library")} />
            <NavItem href="/reading" label="Reading" icon={<Bookmark className="h-4 w-4" />} active={isActive("/reading")} />
            <NavItem href="/finished" label="Finished" icon={<CheckCircle2 className="h-4 w-4" />} active={isActive("/finished")} />
          </>
        ) : null}

        <NavItem href="/ar" label="Arabic" icon={<Languages className="h-4 w-4" />} active={isActive("/ar")} />
        {inArabicSection ? (
          <>
            <NavItem href="/ar/library" label="مكتبتي" icon={<Star className="h-4 w-4" />} active={isActive("/ar/library")} />
            <NavItem href="/ar/reading" label="تتم القراءة" icon={<Bookmark className="h-4 w-4" />} active={isActive("/ar/reading")} />
            <NavItem href="/ar/finished" label="تمّت" icon={<CheckCircle2 className="h-4 w-4" />} active={isActive("/ar/finished")} />
          </>
        ) : null}

        <NavItem
          href="/voice"
          label="Voice"
          icon={<Headphones className="h-4 w-4" />}
          active={isActive("/voice") || isActive("/room")}
        />
      </div>
    </header>
  );
}
