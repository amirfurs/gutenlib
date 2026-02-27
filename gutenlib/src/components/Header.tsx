"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
  Languages,
  Library,
  BookText,
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
        "inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs ring-1 transition sm:px-3 sm:py-1.5 sm:text-sm " +
        (active
          ? "bg-white/10 text-white ring-white/15"
          : "text-zinc-300 ring-white/10 hover:bg-white/5 hover:text-white")
      }
    >
      <span className="text-zinc-400">{icon}</span>
      <span className="hidden sm:inline font-medium">{label}</span>
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();

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
    (pathname === "/ar/books" ||
      pathname.startsWith("/ar/books/") ||
      pathname.startsWith("/ar/book/") ||
      pathname.startsWith("/ar/read/") ||
      pathname.startsWith("/ar/reading") ||
      pathname.startsWith("/ar/finished") ||
      pathname.startsWith("/ar/library"));

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="group inline-flex items-center gap-2 text-sm font-black tracking-wide">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/15 ring-1 ring-brand-500/25 transition group-hover:bg-brand-500/20">
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

            <NavItem href="/ar/books" label="Arabic" icon={<Languages className="h-4 w-4" />} active={isActive("/ar")} />
            {inArabicSection ? (
              <>
                <NavItem href="/ar/library" label="مكتبتي" icon={<Star className="h-4 w-4" />} active={isActive("/ar/library")} />
                <NavItem href="/ar/reading" label="تتم القراءة" icon={<Bookmark className="h-4 w-4" />} active={isActive("/ar/reading")} />
                <NavItem href="/ar/finished" label="تمّت القراءة" icon={<CheckCircle2 className="h-4 w-4" />} active={isActive("/ar/finished")} />
              </>
            ) : null}
          </nav>
        </div>

        <SearchBar />
      </div>

      {/* Mobile quick links */}
      <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 md:hidden">
        <NavItem href="/books" label="Books" icon={<BookOpen className="h-4 w-4" />} active={isActive("/books")} />
        {inEnglishBooks ? (
          <>
            <NavItem href="/library" label="Library" icon={<Star className="h-4 w-4" />} active={isActive("/library")} />
            <NavItem href="/reading" label="Reading" icon={<Bookmark className="h-4 w-4" />} active={isActive("/reading")} />
            <NavItem href="/finished" label="Finished" icon={<CheckCircle2 className="h-4 w-4" />} active={isActive("/finished")} />
          </>
        ) : null}

        <NavItem href="/ar/books" label="Arabic" icon={<Languages className="h-4 w-4" />} active={isActive("/ar")} />
        {inArabicSection ? (
          <>
            <NavItem href="/ar/library" label="مكتبتي" icon={<Star className="h-4 w-4" />} active={isActive("/ar/library")} />
            <NavItem href="/ar/reading" label="تتم القراءة" icon={<Bookmark className="h-4 w-4" />} active={isActive("/ar/reading")} />
            <NavItem href="/ar/finished" label="تمّت" icon={<CheckCircle2 className="h-4 w-4" />} active={isActive("/ar/finished")} />
          </>
        ) : null}
      </div>
    </header>
  );
}
