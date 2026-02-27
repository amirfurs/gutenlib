export type NormalizeOptions = {
  mapAlefVariants?: boolean;
  mapAlefMaqsuraToYa?: boolean;
  stripTashkeel?: boolean;
  stripTatweel?: boolean;
  collapseWhitespace?: boolean;
};

const DEFAULTS: Required<NormalizeOptions> = {
  mapAlefVariants: true,
  mapAlefMaqsuraToYa: true,
  stripTashkeel: true,
  stripTatweel: true,
  collapseWhitespace: true,
};

/**
 * Arabic-friendly normalization for search.
 * - Removes diacritics (tashkeel)
 * - Optionally normalizes Alef variants and Alef Maqsura
 */
export function normalizeArabic(input: string, opts: NormalizeOptions = {}): string {
  const o = { ...DEFAULTS, ...opts };
  let s = input ?? "";

  if (o.stripTashkeel) {
    // Arabic diacritics ranges
    s = s.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, "");
  }
  if (o.stripTatweel) {
    s = s.replace(/ـ/g, "");
  }
  if (o.mapAlefVariants) {
    s = s.replace(/[إأآ]/g, "ا");
  }
  if (o.mapAlefMaqsuraToYa) {
    s = s.replace(/ى/g, "ي");
  }

  if (o.collapseWhitespace) {
    s = s.replace(/\s+/g, " ").trim();
  }

  return s;
}

export function normalizeQuery(q: string): string {
  return normalizeArabic(q, {
    // keep aggressive defaults for search
    mapAlefVariants: true,
    mapAlefMaqsuraToYa: true,
    stripTashkeel: true,
    stripTatweel: true,
    collapseWhitespace: true,
  });
}
