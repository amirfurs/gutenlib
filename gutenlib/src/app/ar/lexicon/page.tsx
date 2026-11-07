"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Quote,
  Search,
  Sparkles,
} from "lucide-react";
import type { DictionarySource, LexiconLookupResult } from "@/lib/lexicon/types";
import { formatRootLetters } from "@/lib/lexicon/stemmer";

const POPULAR_WORDS = [
  "المتقين",
  "الصراط",
  "عسجد",
  "استعانوا",
  "خَنْدَرِيس",
  "حَلْكُوك",
  "طَوْد",
  "سَدَف",
  "الزكوة",
  "الرَّحْمَٰنِ",
];

export default function ClassicalLexiconPage() {
  const [searchTerm, setSearchTerm] = useState("المتقين");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LexiconLookupResult | null>(null);
  const [activeSource, setActiveSource] = useState<DictionarySource>("لسان العرب");
  const [showFullText, setShowFullText] = useState(false);

  const performLookup = async (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setLoading(true);
    setShowFullText(false);

    try {
      const res = await fetch("/api/lexicon?q=" + encodeURIComponent(clean));
      if (res.ok) {
        const data: LexiconLookupResult = await res.json();
        setResult(data);
        if (data.entry?.definitions[0]) {
          setActiveSource(data.entry.definitions[0].source);
        }
      }
    } catch (err) {
      console.error("Lexicon page lookup error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void performLookup("المتقين");
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void performLookup(searchTerm);
  };

  const entry = result?.entry;
  const currentDef = entry?.definitions.find((d) => d.source === activeSource) || entry?.definitions[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between gap-3 mb-8 pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <BookMarked size={22} />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>المعجم التراثي اللحظي</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium">
                  أمهات المعاجم
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                استرجاع النصوص الأصلية من لسان العرب، ومقاييس اللغة، والصحاح، والقاموس المحيط
              </p>
            </div>
          </div>
          <Link
            href="/voice"
            className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 transition shrink-0"
          >
            غرف القراءة الصوتية ←
          </Link>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative mb-6">
          <div className="relative flex items-center">
            <Search className="absolute right-4 w-5 h-5 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث عن أي لفظ قرآني أو مفردة تراثية (مثال: المتقين، الصراط، خندريس)..."
              className="w-full pl-28 pr-12 py-3.5 bg-zinc-900/90 border border-zinc-700/80 rounded-2xl text-white placeholder-zinc-500 text-sm sm:text-base focus:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition shadow-lg"
            />
            <button
              type="submit"
              disabled={loading || !searchTerm.trim()}
              className="absolute left-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs sm:text-sm font-medium rounded-xl transition cursor-pointer"
            >
              {loading ? "جارٍ البحث..." : "بحث في المعاجم"}
            </button>
          </div>
        </form>

        {/* Popular Suggestion Chips */}
        <div className="flex items-center gap-1.5 flex-wrap mb-8 text-xs">
          <span className="text-zinc-500 flex items-center gap-1 shrink-0">
            <Sparkles size={13} className="text-amber-400/70" /> نماذج تراثية:
          </span>
          {POPULAR_WORDS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                setSearchTerm(w);
                void performLookup(w);
              }}
              className={"px-2.5 py-1 rounded-full border transition cursor-pointer " +
                (searchTerm === w
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
                  : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700")}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Main Result Card */}
        {entry ? (
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden shadow-2xl">
            {/* Entry Hero */}
            <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-2xl sm:text-3xl font-bold font-serif text-amber-100">
                    {entry.vocalized || entry.word}
                  </h2>
                  <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-semibold">
                    جذر: {formatRootLetters(entry.root)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="px-2 py-0.5 rounded bg-zinc-800">{entry.partOfSpeech}</span>
                  {entry.wazn && <span className="px-2 py-0.5 rounded bg-zinc-800">الوزن: {entry.wazn}</span>}
                </div>
              </div>

              {/* Related Derivations */}
              {entry.relatedWords && entry.relatedWords.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5 flex-wrap text-xs text-zinc-400">
                  <span className="text-zinc-500">مشتقات ذات صلة:</span>
                  {entry.relatedWords.map((rw) => (
                    <button
                      key={rw}
                      type="button"
                      onClick={() => {
                        setSearchTerm(rw);
                        void performLookup(rw);
                      }}
                      className="px-2 py-0.5 rounded bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/40 transition cursor-pointer"
                    >
                      {rw}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dictionary Tabs */}
            <div className="flex border-b border-zinc-800 overflow-x-auto bg-zinc-950/40 px-3 pt-2">
              {entry.definitions.map((def) => {
                const isActive = (currentDef?.source === def.source);
                return (
                  <button
                    key={def.source}
                    type="button"
                    onClick={() => setActiveSource(def.source)}
                    className={"flex flex-col items-start px-4 py-2.5 border-b-2 text-xs sm:text-sm font-medium transition cursor-pointer whitespace-nowrap " +
                      (isActive
                        ? "border-amber-400 text-amber-200 bg-amber-500/5"
                        : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700")}
                  >
                    <span>{def.source}</span>
                    <span className="text-[10px] text-zinc-500 font-normal">{def.author}</span>
                  </button>
                );
              })}
            </div>

            {/* Definition Body */}
            {currentDef && (
              <div className="p-6 space-y-5">
                <div className="prose prose-invert max-w-none">
                  <p className="text-zinc-200 font-serif text-base sm:text-lg leading-relaxed text-justify">
                    {currentDef.definition}
                  </p>
                </div>

                {/* Classical Citation */}
                {currentDef.citation && (
                  <blockquote className="my-4 p-4 rounded-xl bg-amber-500/5 border-r-4 border-amber-500/60">
                    <div className="flex items-start gap-2">
                      <Quote className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                      <div>
                        <p className="font-serif text-sm sm:text-base text-amber-100 italic">
                          &ldquo;{currentDef.citation}&rdquo;
                        </p>
                        {currentDef.citationAuthor && (
                          <cite className="block text-xs text-amber-300/70 mt-1 not-italic">
                            — {currentDef.citationAuthor}
                          </cite>
                        )}
                      </div>
                    </div>
                  </blockquote>
                )}

                {/* Expandable Unabridged Classical Text */}
                {currentDef.fullText && currentDef.fullText.length > currentDef.definition.length && (
                  <div className="mt-4 pt-4 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setShowFullText(!showFullText)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-700/50 text-xs sm:text-sm text-amber-200 font-medium transition cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <BookOpen size={15} className="text-amber-400" />
                        <span>
                          {showFullText ? "طي النص التراثي الكامل" : `قراءة النص التراثي الكامل من الكتاب (${currentDef.source})`}
                        </span>
                      </span>
                      {showFullText ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {showFullText && (
                      <div className="mt-3 p-5 rounded-xl bg-zinc-950/80 border border-zinc-800 max-h-96 overflow-y-auto">
                        <p className="font-serif text-sm sm:text-base leading-loose text-zinc-200 text-justify whitespace-pre-wrap">
                          {currentDef.fullText}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Direct Link to Lisan al-Arab Volume in ABL Reader */}
                {currentDef.bookId && (
                  <div className="flex justify-end pt-2">
                    <Link
                      href={`/ar/read/${currentDef.bookId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-xs text-amber-300 hover:text-amber-200 transition"
                    >
                      <ExternalLink size={13} />
                      <span>فتح المجلد في قارئ التراث (ABL)</span>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : !loading ? (
          <div className="text-center py-16 p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-zinc-400">
            <BookMarked className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
            <p className="text-sm">لم يتم العثور على نتائج لهذه الكلمة. جرّب إدخال جذر الكلمة أو اختيار نموذج من الأعلى.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
