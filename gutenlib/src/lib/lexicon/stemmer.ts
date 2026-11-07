import { normalizeArabic } from "../abl/normalizeArabic.ts";

/**
 * Common prefixes in Classical Arabic (ordered longest to shortest).
 */
const COMMON_PREFIXES = [
  "كال", "بال", "فال", "وال", "لل",
  "ال", "فل", "ول",
  "است", "مست", "مت", "ان",
  "و", "ف", "ب", "ك", "ل", "س", "ي", "ت", "ن", "أ", "ا", "م"
];

/**
 * Common suffixes and enclitic pronouns in Classical Arabic (ordered longest to shortest).
 */
const COMMON_SUFFIXES = [
  "تموهما", "تموها",
  "هما", "كما", "تموا",
  "هم", "هن", "كم", "نا", "ها", "ات", "ون", "ين", "ان",
  "وا", "تم", "تن", "تا", "ني", "تي",
  "ه", "ك", "ي", "ة", "ت", "ا"
];

/**
 * Extract clean single word tokens from input.
 */
export function cleanLexiconQuery(raw: string): string {
  if (!raw) return "";
  // Strip punctuation, quotes (including curly/Arabic brackets), symbols, and leading/trailing whitespace
  const stripped = raw
    .replace(/[«»“”‘’"\'،؛.ـ:؟?!\(\)\[\]\{\}\/\\—–\-﴾﴿\<\>]/g, " ")
    .trim()
    .split(/\s+/)[0] ?? "";
  return stripped;
}

/**
 * Generates candidate roots for classical Arabic words.
 * Returns array of normalized candidate forms and candidate roots.
 */
export function extractCandidateRoots(word: string): {
  normalized: string;
  candidateRoots: string[];
} {
  const clean = cleanLexiconQuery(word);
  const normalized = normalizeArabic(clean, {
    stripTashkeel: true,
    stripTatweel: true,
    mapAlefVariants: true,
    mapAlefMaqsuraToYa: true,
  });

  if (!normalized || normalized.length < 2) {
    return { normalized, candidateRoots: [] };
  }

  const candidates = new Set<string>();
  candidates.add(normalized);

  // If already 3 or 4 letters, add directly as root candidate
  if (normalized.length === 3 || normalized.length === 4) {
    candidates.add(normalized);
  }

  // Apply morphological template patterns to a candidate string
  function applyPatterns(target: string) {
    if (!target || target.length < 3) return;
    const len = target.length;

    if (len === 3 || len === 4) {
      candidates.add(target);
    }

    // 7 letters: استفعال -> فعل (استغفار -> غفر)
    if (len === 7 && target.startsWith("است") && target[5] === "ا") {
      candidates.add(target[3] + target[4] + target[6]);
    }

    // 6 letters: استفعل / مستفعل -> فعل (استغفر / مستغفر -> غفر)
    if (len === 6 && (target.startsWith("است") || target.startsWith("مست"))) {
      candidates.add(target[3] + target[4] + target[5]);
    }

    // 6 letters: افتعال -> فعل (اجتهاد -> جهد, انتصار -> نصر)
    if (len === 6 && target.startsWith("ا") && target[2] === "ت" && target[4] === "ا") {
      candidates.add(target[1] + target[3] + target[5]);
    }

    // 6 letters: انفعال -> فعل (انطلاق -> طلق)
    if (len === 6 && target.startsWith("ان") && target[4] === "ا") {
      candidates.add(target[2] + target[3] + target[5]);
    }

    // 6 letters: مفاعيل -> فعل (مصابيح -> صبح)
    if (len === 6 && target.startsWith("م") && target[2] === "ا" && target[4] === "ي") {
      candidates.add(target[1] + target[3] + target[5]);
    }

    // 5 letters: افتعل / مفتعل -> فعل (اقترب / مقترب -> قرب)
    if (len === 5 && (target.startsWith("ا") || target.startsWith("م")) && target[2] === "ت") {
      candidates.add(target[1] + target[3] + target[4]);
    }

    // Weak / Assimilated roots: متق / متقين -> وقي
    if (target.startsWith("متق") || target.startsWith("اتق")) {
      candidates.add("وقي");
    }

    // Weak verbs: استعان / نستعين -> عون
    if (target.includes("تعين") || target.includes("ستعين")) {
      candidates.add("عون");
    }

    // Weak verbs: استقام / مستقيم -> قوم
    if (target.includes("تقيم") || target.includes("ستقيم")) {
      candidates.add("قوم");
    }

    // 5 letters: فواعل -> فعل (مواخر -> مخر, شواهد -> شهد, قواعد -> قعد)
    if (len === 5 && target[1] === "و" && target[2] === "ا") {
      candidates.add(target[0] + target[3] + target[4]);
    }

    // 5 letters: فياعل -> فيعل / فعل (غياهب -> غيهب, بيادق -> بيدق)
    if (len === 5 && target[1] === "ي" && target[2] === "ا") {
      candidates.add(target[0] + "ي" + target[3] + target[4]);
      candidates.add(target[0] + target[3] + target[4]);
    }

    // 5 letters: تفاعل / متفاعل -> فعل (تنازع / متنازع -> نزع)
    if (len === 5 && (target.startsWith("ت") || target.startsWith("م")) && target[2] === "ا") {
      candidates.add(target[1] + target[3] + target[4]);
    }

    // 5 letters: تفعيل -> فعل (تعليم -> علم, تقييد -> قيد, تدريب -> درب)
    if (len === 5 && target.startsWith("ت") && target[3] === "ي") {
      candidates.add(target[1] + target[2] + target[4]);
    }

    // 5 letters: مفعول -> فعل (مكتوب -> كتب, معلوم -> علم, منصور -> نصر)
    if (len === 5 && target.startsWith("م") && target[3] === "و") {
      candidates.add(target[1] + target[2] + target[4]);
    }

    // 5 letters: مفاعل -> فعل (مساجد -> سجد, منازل -> نزل, مدارس -> درس)
    if (len === 5 && target.startsWith("م") && target[2] === "ا") {
      candidates.add(target[1] + target[3] + target[4]);
    }

    // 5 letters: مفعلة -> فعل (مكتبة -> كتب, مدرسة -> درس, محكمة -> حكم)
    if (len === 5 && target.startsWith("م") && target.endsWith("ة")) {
      candidates.add(target[1] + target[2] + target[3]);
    }

    // 4 or 5 letters: فعلان (رحمان/رحمن -> رحم, غفران -> غفر, شكران -> شكر, سلطان -> سلط)
    if ((len === 5 && target.endsWith("ان")) || (len === 4 && target === "رحمن")) {
      candidates.add(target.slice(0, 3));
    }

    // Geminate / Doubled roots (مضاعف: ضال -> ضلل, حب -> حبب, شد -> شدد, حق -> حقق)
    if (len === 3 && target[1] === "ا") {
      // e.g. ضال -> ضلل, بار -> برر, حار -> حرر, ماد -> مدد
      candidates.add(target[0] + target[2] + target[2]);
    }

    // 5 letters: فعلاء -> فعل (علماء -> علم, حكماء -> حكم, شهداء -> شهد, فقهاء -> فقه)
    if (len === 5 && target.endsWith("اء")) {
      candidates.add(target.slice(0, 3));
    }

    // 4 letters: فعال -> فعل (كتاب -> كتب, صراط -> صرط, سحاب -> سحب, سلام -> سلم, جهاد -> جهد)
    if (len === 4 && target[2] === "ا") {
      candidates.add(target[0] + target[1] + target[3]);
    }

    // 4 letters: فاعل -> فعل (كاتب -> كتب, صابر -> صبر, عالم -> علم)
    if (len === 4 && target[1] === "ا") {
      candidates.add(target[0] + target[2] + target[3]);
    }

    // 4 letters: فعيل -> فعل (عليم -> علم, رحيم -> رحم, وتين -> وتن, كريم -> كرم)
    if (len === 4 && target[2] === "ي") {
      candidates.add(target[0] + target[1] + target[3]);
    }

    // 4 letters: فعول -> فعل (غفور -> غفر, صبور -> صبر, شكور -> شكر)
    if (len === 4 && target[2] === "و") {
      candidates.add(target[0] + target[1] + target[3]);
    }

    // 4 letters: مفعل -> فعل (مسجد -> سجد, مكتب -> كتب, منزل -> نزل, مطلع -> طلع)
    if (len === 4 && target.startsWith("م")) {
      candidates.add(target[1] + target[2] + target[3]);
    }

    // 4 letters: أفعل -> فعل (أحسن -> حسن, أعلم -> علم, أكبر -> كبر, أفضل -> فضل)
    if (len === 4 && (target.startsWith("أ") || target.startsWith("ا"))) {
      candidates.add(target[1] + target[2] + target[3]);
    }

    // 4 letters: مضارع ثلاثي (يعلم -> علم, نعبد -> عبد, ينصر -> نصر, تفرح -> فرح)
    if (len === 4 && (target.startsWith("ي") || target.startsWith("ت") || target.startsWith("ن"))) {
      candidates.add(target[1] + target[2] + target[3]);
    }
  }

  // Run on unstripped normalized form first
  applyPatterns(normalized);

  // 1. Direct suffix stripping on normalized form
  for (const suffix of COMMON_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 3) {
      const stripped = normalized.slice(0, -suffix.length);
      candidates.add(stripped);
      applyPatterns(stripped);
    }
  }

  // 2. Prefix stripping & dual prefix/suffix stripping
  for (const prefix of COMMON_PREFIXES) {
    if (normalized.startsWith(prefix) && normalized.length - prefix.length >= 3) {
      const p = normalized.slice(prefix.length);
      candidates.add(p);
      applyPatterns(p);

      for (const suffix of COMMON_SUFFIXES) {
        if (p.endsWith(suffix) && p.length - suffix.length >= 3) {
          const both = p.slice(0, -suffix.length);
          candidates.add(both);
          applyPatterns(both);
        }
      }
    }
  }

  // 3. Remove common definite article and prefix combinations
  const withoutArticles = normalized.replace(/^(ال|كال|بال|فال|وال|لل)/, "");
  if (withoutArticles !== normalized && withoutArticles.length >= 3) {
    candidates.add(withoutArticles);
    applyPatterns(withoutArticles);

    for (const suffix of COMMON_SUFFIXES) {
      if (withoutArticles.endsWith(suffix) && withoutArticles.length - suffix.length >= 3) {
        const stripped = withoutArticles.slice(0, -suffix.length);
        candidates.add(stripped);
        applyPatterns(stripped);
      }
    }
  }

  // Rank candidate roots: 3-letter roots first, then 4-letter roots
  const roots = Array.from(candidates).filter((c) => c.length === 3 || c.length === 4);
  roots.sort((a, b) => {
    if (a.length === 3 && b.length !== 3) return -1;
    if (b.length === 3 && a.length !== 3) return 1;
    return 0;
  });

  return {
    normalized,
    candidateRoots: roots,
  };
}

/**
 * Format root string with hyphens: "كتب" -> "ك - ت - ب"
 */
export function formatRootLetters(root: string): string {
  if (!root) return "";
  return Array.from(root).join(" - ");
}
