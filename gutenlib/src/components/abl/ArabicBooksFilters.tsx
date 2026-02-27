"use client";

import { useEffect, useMemo, useState } from "react";

type CategoryOpt = { id: string; name: string };

export function ArabicBooksFilters({
  initial,
  categories,
}: {
  initial: { q: string; author: string; category: string; page: number; sort: string; diedFrom: string; diedTo: string };
  categories: CategoryOpt[];
}) {
  const [author, setAuthor] = useState(initial.author);
  const [authorSug, setAuthorSug] = useState<string[]>([]);

  const [cat, setCat] = useState(initial.category);
  const [q, setQ] = useState(initial.q);
  const [sort, setSort] = useState(initial.sort);
  const [diedFrom, setDiedFrom] = useState(initial.diedFrom);
  const [diedTo, setDiedTo] = useState(initial.diedTo);

  const authorListId = useMemo(() => "authors-datalist", []);

  useEffect(() => {
    const term = author.trim();
    if (term.length < 2) {
      setAuthorSug([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/abl/suggest?type=author&lang=ar&q=${encodeURIComponent(term)}`);
        const j = await r.json();
        setAuthorSug(Array.isArray(j.suggestions) ? j.suggestions : []);
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(t);
  }, [author]);

  return (
    <form className="mt-6 flex flex-wrap items-end gap-2" action="/ar/books" method="get">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400">بحث</label>
        <input
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث في الكتب…"
          className="h-10 w-[min(360px,80vw)] rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400">المؤلف</label>
        <input
          name="author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          list={authorListId}
          placeholder="مثال: فخر الدين"
          className="h-10 w-[min(240px,70vw)] rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
        />
        <datalist id={authorListId}>
          {authorSug.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400">التصنيف</label>
        <select
          name="category"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-10 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
        >
          <option value="">كل التصنيفات</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400">الترتيب</label>
        <select
          name="sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-10 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
        >
          <option value="died_desc">تاريخ وفاة المؤلف (الأحدث)</option>
          <option value="died_asc">تاريخ وفاة المؤلف (الأقدم)</option>
          <option value="created_desc">الإضافة (الأحدث)</option>
          <option value="created_asc">الإضافة (الأقدم)</option>
          <option value="updated_desc">التحديث (الأحدث)</option>
          <option value="updated_asc">التحديث (الأقدم)</option>
          <option value="title_asc">العنوان (أ-ي)</option>
          <option value="title_desc">العنوان (ي-أ)</option>
          <option value="pages_desc">عدد الصفحات (الأكبر)</option>
          <option value="pages_asc">عدد الصفحات (الأصغر)</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400">وفاة المؤلف (من)</label>
        <input
          name="diedFrom"
          value={diedFrom}
          onChange={(e) => setDiedFrom(e.target.value)}
          placeholder="مثال: 600"
          className="h-10 w-28 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400">إلى</label>
        <input
          name="diedTo"
          value={diedTo}
          onChange={(e) => setDiedTo(e.target.value)}
          placeholder="مثال: 800"
          className="h-10 w-28 rounded-md bg-white/5 px-3 text-sm text-white ring-1 ring-white/10"
        />
      </div>

      <input type="hidden" name="page" value="1" />

      <button type="submit" className="h-10 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
        تطبيق
      </button>
    </form>
  );
}
