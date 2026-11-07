"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Headphones,
  Quote,
  Search,
  X,
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
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const performLookup = async (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setLoading(true);
    setShowFullText(false);
    setCopied(false);

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

  const copyDefinition = async () => {
    if (!currentDef || !entry) return;
    const textToCopy = `« ${entry.vocalized || entry.word} »\nجذر: ${formatRootLetters(entry.root)}\n[${currentDef.source} - ${currentDef.author}]\n\n${currentDef.definition}${
      currentDef.citation ? `\n\nالشاهد: "${currentDef.citation}" (${currentDef.citationAuthor || ""})` : ""
    }`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const entry = result?.entry;
  const currentDef =
    entry?.definitions.find((d) => d.source === activeSource) || entry?.definitions[0];

  return (
    <main className="lexicon-page" dir="rtl">
      <div className="lexicon-page-inner">
        {/* Unslop Archival Header */}
        <header className="lexicon-page-header">
          <div className="lexicon-page-header-left">
            <span className="lexicon-page-badge" aria-hidden="true">
              <BookMarked size={18} strokeWidth={1.5} />
            </span>
            <div className="lexicon-page-titles">
              <div className="lexicon-page-title-row">
                <h1 className="lexicon-page-h1">المعجم التراثي</h1>
                <span className="lexicon-page-pill">نصوص محققة</span>
              </div>
              <p className="lexicon-page-subtitle">
                لسان العرب · مقاييس اللغة · الصحاح · القاموس المحيط · المعجم الوسيط
              </p>
            </div>
          </div>
          <Link href="/voice" className="lexicon-page-nav-link" title="غرف القراءة الصوتية">
            <Headphones size={14} strokeWidth={1.5} />
            <span className="hidden sm:inline">غرف القراءة</span>
          </Link>
        </header>

        {/* Quiet Search Input Form */}
        <form onSubmit={handleSearch} className="lexicon-page-search-wrap">
          <Search size={16} strokeWidth={1.5} className="lexicon-page-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث عن لفظ أو جذر (مثال: وقي، المتقين، عسجد، الصراط)..."
            className="lexicon-page-search-input"
            maxLength={40}
          />
          <div className="lexicon-page-search-actions">
            {searchTerm.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  inputRef.current?.focus();
                }}
                className="lexicon-page-clear-btn"
                title="مسح الحقل"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !searchTerm.trim()}
              className="lexicon-page-search-submit"
            >
              <span>{loading ? "بحث..." : "بحث"}</span>
              <kbd className="keycap">↵</kbd>
            </button>
          </div>
        </form>

        {/* Quiet Curated Examples Row */}
        <div className="lexicon-page-examples">
          <span className="lexicon-page-examples-label">
            <BookOpen size={13} strokeWidth={1.5} /> مفردات وشواهد:
          </span>
          {POPULAR_WORDS.map((w) => {
            const isActive = searchTerm === w;
            return (
              <button
                key={w}
                type="button"
                onClick={() => {
                  setSearchTerm(w);
                  void performLookup(w);
                }}
                className={`lexicon-page-chip ${isActive ? "is-active" : ""}`}
              >
                {w}
              </button>
            );
          })}
        </div>

        {/* Main Scholarly Card */}
        {entry ? (
          <article className="lexicon-page-card">
            {/* Word & Root Hero */}
            <div className="lexicon-page-hero">
              <div className="lexicon-page-hero-top">
                <div className="lexicon-page-word-wrap">
                  <h2 className="lexicon-page-vocalized">
                    {entry.vocalized || entry.word}
                  </h2>
                  <span className="lexicon-page-root-pill" title="الجذر اللغوي الأصيل">
                    جذر: {formatRootLetters(entry.root)}
                  </span>
                </div>
                <div className="lexicon-page-meta-tags">
                  <span className="lexicon-page-tag">{entry.partOfSpeech}</span>
                  {entry.wazn && (
                    <span className="lexicon-page-tag">الوزن: {entry.wazn}</span>
                  )}
                </div>
              </div>

              {/* Sub-roots & Alternative Roots */}
              {result?.suggestedRoots && result.suggestedRoots.length > 0 && (
                <div className="lexicon-page-subroots">
                  <span>أصول بديلة:</span>
                  {result.suggestedRoots.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setSearchTerm(r);
                        void performLookup(r);
                      }}
                      className="lexicon-page-subroot-btn"
                      title={`استعلام جذر ${formatRootLetters(r)}`}
                    >
                      {formatRootLetters(r)}
                    </button>
                  ))}
                </div>
              )}

              {/* Related Derivations */}
              {entry.relatedWords && entry.relatedWords.length > 0 && (
                <div className="lexicon-page-related-words">
                  <span>مشتقات:</span>
                  {entry.relatedWords.map((rw) => (
                    <button
                      key={rw}
                      type="button"
                      onClick={() => {
                        setSearchTerm(rw);
                        void performLookup(rw);
                      }}
                      className="lexicon-page-word-btn"
                    >
                      {rw}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Classical Dictionary Source Tabs */}
            <nav className="lexicon-page-tabs" aria-label="أمهات كتب المعاجم">
              {entry.definitions.map((def) => {
                const isActive = (currentDef?.source === def.source);
                return (
                  <button
                    key={def.source}
                    type="button"
                    onClick={() => setActiveSource(def.source)}
                    className={`lexicon-page-tab ${isActive ? "is-active" : ""}`}
                  >
                    <span className="lexicon-page-tab-name">{def.source}</span>
                    <span className="lexicon-page-tab-author">{def.author}</span>
                  </button>
                );
              })}
            </nav>

            {/* Definition Body */}
            {currentDef && (
              <div className="lexicon-page-body">
                {/* Primary Classical Definition */}
                <p className="lexicon-page-definition">
                  {currentDef.definition}
                </p>

                {/* Classical Verse / Quranic Citation */}
                {currentDef.citation && (
                  <aside className="lexicon-page-citation">
                    <p className="lexicon-page-quote">
                      « {currentDef.citation} »
                    </p>
                    {currentDef.citationAuthor && (
                      <cite className="lexicon-page-quote-author">
                        — {currentDef.citationAuthor}
                      </cite>
                    )}
                  </aside>
                )}

                {/* Expandable Unabridged Classical Text */}
                {currentDef.fullText && currentDef.fullText.length > currentDef.definition.length && (
                  <div className="lexicon-page-fulltext-section">
                    <button
                      type="button"
                      onClick={() => setShowFullText(!showFullText)}
                      className="lexicon-page-fulltext-toggle"
                    >
                      <span className="inline-flex items-center gap-2">
                        <BookOpen size={14} strokeWidth={1.5} />
                        <span>
                          {showFullText
                            ? "طي النص التراثي الكامل"
                            : `قراءة النص التراثي الكامل من الكتاب (${currentDef.source})`}
                        </span>
                      </span>
                      {showFullText ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {showFullText && (
                      <div className="lexicon-page-fulltext-drawer">
                        <p className="lexicon-page-fulltext-text">
                          {currentDef.fullText}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Quiet Action Bar */}
                <div className="lexicon-page-actions">
                  <button
                    type="button"
                    onClick={copyDefinition}
                    className="lexicon-page-btn-quiet"
                    title="نسخ نص التعريف والشاهد"
                  >
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copied ? "تم النسخ" : "نسخ التعريف"}</span>
                  </button>

                  {/* Direct Link to Lisan al-Arab Volume in ABL Reader */}
                  {currentDef.bookId && (
                    <Link
                      href={`/ar/read/${currentDef.bookId}`}
                      className="lexicon-page-btn-quiet"
                      title="فتح المجلد الأصيل في قارئ التراث (ABL)"
                    >
                      <ExternalLink size={13} />
                      <span>فتح المجلد في قارئ التراث (ABL)</span>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </article>
        ) : !loading ? (
          <div className="lexicon-page-empty">
            <BookMarked size={32} strokeWidth={1.2} className="lexicon-page-empty-icon" />
            <p className="text-sm">
              لم يُعثر على مادة تراثية مطابقة لهذا اللفظ. يُرجى التحقق من الرسم الإملائي أو إدخال الجذر الثلاثي.
            </p>
          </div>
        ) : (
          <div className="lexicon-page-empty">
            <div className="lexicon-spinner" />
            <p className="text-xs">جارٍ استرجاع المادة من أمهات المعاجم التراثية...</p>
          </div>
        )}
      </div>
    </main>
  );
}
