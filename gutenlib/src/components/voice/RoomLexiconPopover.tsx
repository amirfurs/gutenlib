"use client";

import { useEffect, useRef, useState } from "react";
import { BookMarked, Check, CornerDownLeft, Quote, Search, Send, X } from "lucide-react";
import type { DictionarySource, LexiconEntry, LexiconLookupResult } from "@/lib/lexicon/types";
import { formatRootLetters } from "@/lib/lexicon/stemmer";
import { lookupClassicalWord } from "@/lib/lexicon/classicalDictionary";

interface RoomLexiconPopoverProps {
  initialWord: string;
  isOpen: boolean;
  onClose: () => void;
  onSaveToNotes?: (word: string, root: string, definition: string, source: string) => void;
  onShareToRoom?: (text: string) => Promise<boolean>;
}

export function RoomLexiconPopover({
  initialWord,
  isOpen,
  onClose,
  onSaveToNotes,
  onShareToRoom,
}: RoomLexiconPopoverProps) {
  const [searchTerm, setSearchTerm] = useState(initialWord);
  const [result, setResult] = useState<LexiconLookupResult | null>(null);
  const [activeSource, setActiveSource] = useState<DictionarySource>("لسان العرب");
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const [loadingAbl, setLoadingAbl] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const performLookup = async (term: string) => {
    const clean = term.trim();
    if (!clean) return;

    // 1. Instant local lookup
    const local = lookupClassicalWord(clean);
    setResult(local);
    setSaved(false);
    setShared(false);
    if (local.entry?.definitions[0]) {
      setActiveSource(local.entry.definitions[0].source);
    }

    // 2. If not found in local curated corpus, query live ABL heritage search
    if (!local.found) {
      setLoadingAbl(true);
      try {
        const res = await fetch("/api/lexicon?q=" + encodeURIComponent(clean));
        if (res.ok) {
          const remote: LexiconLookupResult = await res.json();
          if (remote.found && remote.entry) {
            setResult(remote);
            if (remote.entry.definitions[0]) {
              setActiveSource(remote.entry.definitions[0].source);
            }
          }
        }
      } catch (err) {
        console.warn("Live ABL lexicon lookup note:", err);
      } finally {
        setLoadingAbl(false);
      }
    }
  };

  // When initialWord changes or popover opens, look up the word
  useEffect(() => {
    if (isOpen && initialWord) {
      setSearchTerm(initialWord);
      void performLookup(initialWord);
    }
  }, [isOpen, initialWord]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void performLookup(searchTerm);
  };

  const handleSaveToNotes = () => {
    if (!result?.entry) return;
    const entry = result.entry;
    const def = entry.definitions.find((d) => d.source === activeSource) || entry.definitions[0];
    if (!def) return;

    const formatted = `[معجم ${def.source}]: ${entry.vocalized} (جذر: ${formatRootLetters(entry.root)}) — ${def.definition}${
      def.citation ? ` | شاهد: "${def.citation}"` : ""
    }`;

    onSaveToNotes?.(entry.word, entry.root, formatted, def.source);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleShareToRoom = async () => {
    if (!result?.entry || !onShareToRoom) return;
    const entry = result.entry;
    const def = entry.definitions.find((d) => d.source === activeSource) || entry.definitions[0];
    if (!def) return;

    const text = `📖 فائدة لغوية من ${def.source}: [${entry.vocalized}] (جذر: ${formatRootLetters(entry.root)}) — ${def.definition}`;
    const ok = await onShareToRoom(text);
    if (ok) {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  if (!isOpen) return null;

  const entry = result?.entry;
  const currentDef = entry?.definitions.find((d) => d.source === activeSource) || entry?.definitions[0];

  return (
    <div className="lexicon-popover-backdrop" onClick={onClose} aria-hidden="true">
      <div
        className="lexicon-popover-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="المعجم التراثي اللحظي"
        dir="rtl"
      >
        {/* Popover Header */}
        <div className="lexicon-popover-header">
          <div className="lexicon-header-title">
            <BookMarked size={14} strokeWidth={1.5} className="lexicon-icon" />
            <span className="lexicon-title-text">المعجم التراثي اللحظي</span>
          </div>
          <button
            type="button"
            className="lexicon-close-btn"
            onClick={onClose}
            aria-label="إغلاق المعجم"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* Quick Search Form */}
        <form className="lexicon-search-form" onSubmit={handleSearch}>
          <Search size={13} strokeWidth={1.5} className="lexicon-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث عن مفردة في لسان العرب ومقاييس اللغة..."
            className="lexicon-search-input"
            maxLength={30}
          />
          <button type="submit" className="lexicon-search-submit" title="بحث">
            <CornerDownLeft size={12} strokeWidth={1.5} />
          </button>
        </form>

        {/* Popover Body */}
        <div className="lexicon-popover-body">
          {entry ? (
            <>
              {/* Word & Root Hero */}
              <div className="lexicon-word-hero">
                <div className="lexicon-word-row">
                  <h3 className="lexicon-vocalized">{entry.vocalized}</h3>
                  <span className="lexicon-root-pill" title="الجذر اللغوي">
                    جذر: {formatRootLetters(entry.root)}
                  </span>
                </div>
                <div className="lexicon-meta-row">
                  <span className="lexicon-pos">{entry.partOfSpeech}</span>
                  {entry.wazn && <span className="lexicon-wazn">وزن: {entry.wazn}</span>}
                </div>
              </div>

              {/* Source Tabs (لسان العرب · مقاييس اللغة) */}
              <div className="lexicon-tabs" role="tablist">
                {entry.definitions.map((d) => (
                  <button
                    key={d.source}
                    type="button"
                    role="tab"
                    aria-selected={activeSource === d.source}
                    className={"lexicon-tab" + (activeSource === d.source ? " is-active" : "")}
                    onClick={() => setActiveSource(d.source)}
                  >
                    <span>{d.source}</span>
                    <span className="tab-century">{d.author}</span>
                  </button>
                ))}
              </div>

              {/* Definition Display */}
              {currentDef && (
                <div className="lexicon-def-card">
                  <p className="lexicon-def-text">{currentDef.definition}</p>

                  {currentDef.citation && (
                    <blockquote className="lexicon-citation">
                      <span className="lexicon-citation-quote">&ldquo;{currentDef.citation}&rdquo;</span>
                      {currentDef.citationAuthor && (
                        <cite className="lexicon-citation-author">— {currentDef.citationAuthor}</cite>
                      )}
                    </blockquote>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="lexicon-empty-state">
              {loadingAbl ? (
                <div className="lexicon-searching-notice">
                  <span className="lexicon-spinner" aria-hidden="true" />
                  <p>جارٍ البحث في أمهات المعاجم وخزانة التراث الشاملة (ABL)...</p>
                </div>
              ) : (
                <>
                  <p>{result?.message || `لم يتم العثور على "${searchTerm}" في المعاجم التراثية المتاحة.`}</p>
                  {result?.root && (
                    <span className="lexicon-fallback-root">
                      الجذر المستنبط المقدر: <strong>{formatRootLetters(result.root)}</strong>
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Popover Actions Footer */}
        {entry && (
          <div className="lexicon-popover-footer">
            <button
              type="button"
              className={"lexicon-action-btn" + (saved ? " is-done" : "")}
              onClick={handleSaveToNotes}
              title="حفظ التعريف والشاهد في كراسة الجلسة وملاحظات المكتبة"
            >
              {saved ? <Check size={13} strokeWidth={1.5} /> : <Quote size={13} strokeWidth={1.5} />}
              <span>{saved ? "تم الحفظ بالكراسة" : "اقتباس للكراسة"}</span>
            </button>

            {onShareToRoom && (
              <button
                type="button"
                className={"lexicon-action-btn primary" + (shared ? " is-done" : "")}
                onClick={handleShareToRoom}
                title="مشاركة الفائدة اللغوية في محادثة الغرفة للحاضرين"
              >
                {shared ? <Check size={13} strokeWidth={1.5} /> : <Send size={13} strokeWidth={1.5} />}
                <span>{shared ? "تمت المشاركة" : "مشاركة بالحلقة"}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
