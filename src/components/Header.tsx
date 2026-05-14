"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
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
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200 " +
        (active
          ? "bg-amber-600/15 text-amber-200 ring-1 ring-amber-500/20"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200")
      }
    >
      <span className={active ? "text-amber-400" : "text-zinc-500"}>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
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
    <header className="sticky top-0 z-40 glass-nav" data-testid="main-header">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 md:px-12">
        <div className="flex items-center gap-5">
          <Link href="/" className="group inline-flex items-center gap-2.5" data-testid="nav-logo">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-600/15 ring-1 ring-amber-500/20 transition group-hover:bg-amber-600/25">
              <Library className="h-4 w-4 text-amber-500" />
            </span>
            <span className="hidden text-[15px] font-bold tracking-wide sm:inline">
              <span className="text-white">GUTEN</span>
              <span className="text-amber-500">LIB</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1.5 md:flex">
            <NavItem href="/books" label="Books" icon={<BookOpen className="h-3.5 w-3.5" />} active={isActive("/books")} />
            {inEnglishBooks ? (
              <>
                <NavItem href="/library" label="Library" icon={<Star className="h-3.5 w-3.5" />} active={isActive("/library")} />
                <NavItem href="/reading" label="Reading" icon={<Bookmark className="h-3.5 w-3.5" />} active={isActive("/reading")} />
                <NavItem href="/finished" label="Finished" icon={<CheckCircle2 className="h-3.5 w-3.5" />} active={isActive("/finished")} />
              </>
            ) : null}

            <NavItem href="/ar/books" label="Arabic" icon={<Languages className="h-3.5 w-3.5" />} active={isActive("/ar")} />
            {inArabicSection ? (
              <>
                <NavItem href="/ar/library" label="مكتبتي" icon={<Star className="h-3.5 w-3.5" />} active={isActive("/ar/library")} />
                <NavItem href="/ar/reading" label="تتم القراءة" icon={<Bookmark className="h-3.5 w-3.5" />} active={isActive("/ar/reading")} />
                <NavItem href="/ar/finished" label="تمّت القراءة" icon={<CheckCircle2 className="h-3.5 w-3.5" />} active={isActive("/ar/finished")} />
              </>
            ) : null}
          </nav>
        </div>

        <SearchBar />
      </div>

      {/* Mobile quick links */}
      <div className="mx-auto flex max-w-7xl gap-1.5 overflow-x-auto px-6 pb-3 md:hidden">
        <NavItem href="/books" label="Books" icon={<BookOpen className="h-3.5 w-3.5" />} active={isActive("/books")} />
        {inEnglishBooks ? (
          <>
            <NavItem href="/library" label="Library" icon={<Star className="h-3.5 w-3.5" />} active={isActive("/library")} />
            <NavItem href="/reading" label="Reading" icon={<Bookmark className="h-3.5 w-3.5" />} active={isActive("/reading")} />
            <NavItem href="/finished" label="Finished" icon={<CheckCircle2 className="h-3.5 w-3.5" />} active={isActive("/finished")} />
          </>
        ) : null}

        <NavItem href="/ar/books" label="Arabic" icon={<Languages className="h-3.5 w-3.5" />} active={isActive("/ar")} />
        {inArabicSection ? (
          <>
            <NavItem href="/ar/library" label="مكتبتي" icon={<Star className="h-3.5 w-3.5" />} active={isActive("/ar/library")} />
            <NavItem href="/ar/reading" label="تتم القراءة" icon={<Bookmark className="h-3.5 w-3.5" />} active={isActive("/ar/reading")} />
            <NavItem href="/ar/finished" label="تمّت" icon={<CheckCircle2 className="h-3.5 w-3.5" />} active={isActive("/ar/finished")} />
          </>
        ) : null}
      </div>
    </header>
  );
}
