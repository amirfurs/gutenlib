import { normalizeArabic } from "@/lib/abl/normalizeArabic";

/**
 * Common prefixes in Classical Arabic (ordered longest to shortest).
 */
const COMMON_PREFIXES = [
  "كال", "بال", "فال", "وال", "لل",
  "ال", "فل", "ول",
  "است", "ان", "مت", "مست",
  "و", "ف", "ب", "ك", "ل", "س", "ي", "ت", "ن", "أ", "ا", "م"
];

/**
 * Common suffixes and enclitic pronouns in Classical Arabic.
 */
const COMMON_SUFFIXES = [
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
  // Strip punctuation, quotes, symbols, brackets, and leading/trailing whitespace
  const stripped = raw
    .replace(/[«»""''،؛.ـ:؟?!\(\)\[\]\{\}\/\\—–\-]/g, " ")
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
    if (!target || target.length < 4) return;
    const len = target.length;

    // استفعل -> فعل (6 letters)
    if (len === 6 && target.startsWith("است")) {
      candidates.add(target[3] + target[4] + target[5]);
    }
    // افتعل -> فعل (5 letters: starts with ا and 3rd is ت)
    if (len === 5 && target.startsWith("ا") && target[2] === "ت") {
      candidates.add(target[1] + target[3] + target[4]);
    }
    // فواعل -> فعل (5 letters: 2nd is و and 3rd is ا e.g. مواخر -> مخر, شواهد -> شهد)
    if (len === 5 && target[1] === "و" && target[2] === "ا") {
      candidates.add(target[0] + target[3] + target[4]);
    }
    // تفاعل -> فعل (5 letters)
    if (len === 5 && target.startsWith("ت") && target[2] === "ا") {
      candidates.add(target[1] + target[3] + target[4]);
    }
    // تفعيل -> فعل (5 letters)
    if (len === 5 && target.startsWith("ت") && target[3] === "ي") {
      candidates.add(target[1] + target[2] + target[4]);
    }
    // مفعول -> فعل (5 letters)
    if (len === 5 && target.startsWith("م") && target[3] === "و") {
      candidates.add(target[1] + target[2] + target[4]);
    }
    // فاعل -> فعل (4 letters: 2nd is ا)
    if (len === 4 && target[1] === "ا") {
      candidates.add(target[0] + target[2] + target[3]);
    }
    // فعيل -> فعل (4 letters: 3rd is ي e.g. وتين -> وتن, رحيم -> رحم)
    if (len === 4 && target[2] === "ي") {
      candidates.add(target[0] + target[1] + target[3]);
    }
    // فعول -> فعل (4 letters: 3rd is و e.g. غفور -> غفر)
    if (len === 4 && target[2] === "و") {
      candidates.add(target[0] + target[1] + target[3]);
    }
  }

  // Run on unstripped normalized form first
  applyPatterns(normalized);

  // Strip prefixes
  let strippedPrefix = normalized;
  for (const prefix of COMMON_PREFIXES) {
    if (strippedPrefix.startsWith(prefix) && strippedPrefix.length - prefix.length >= 3) {
      strippedPrefix = strippedPrefix.slice(prefix.length);
      candidates.add(strippedPrefix);
      break;
    }
  }

  // Strip suffixes
  let strippedSuffix = strippedPrefix;
  for (const suffix of COMMON_SUFFIXES) {
    if (strippedSuffix.endsWith(suffix) && strippedSuffix.length - suffix.length >= 3) {
      strippedSuffix = strippedSuffix.slice(0, -suffix.length);
      candidates.add(strippedSuffix);
      break;
    }
  }

  // Run on stripped form as well
  applyPatterns(strippedSuffix);

  return {
    normalized,
    candidateRoots: Array.from(candidates).filter((c) => c.length >= 3 && c.length <= 4),
  };
}

/**
 * Format root string with hyphens: "كتب" -> "ك - ت - ب"
 */
export function formatRootLetters(root: string): string {
  if (!root) return "";
  return Array.from(root).join(" - ");
}
