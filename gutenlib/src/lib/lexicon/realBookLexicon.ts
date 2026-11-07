import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { DictionaryDefinition, DictionarySource, LexiconLookupResult } from "./types.ts";
import { extractCandidateRoots, formatRootLetters, cleanLexiconQuery } from "./stemmer.ts";
import { normalizeArabic } from "../abl/normalizeArabic.ts";

// Interface for node:sqlite DatabaseSync
interface SqliteDatabase {
  prepare(sql: string): {
    get(...params: any[]): any;
    all(...params: any[]): any[];
  };
  close(): void;
}

let dbInstance: SqliteDatabase | null = null;
let dbInitAttempted = false;

/**
 * Volumes of Lisan al-Arab in ABL by last letter (الباب).
 * Ibn Manzur arranges Lisan al-Arab by the final letter of the root (الباب),
 * then the first letter (الفصل).
 */
const LISAN_VOLUMES_BY_LAST_LETTER: Record<string, string> = {
  "ء": "3489", // Vol 1
  "أ": "3489",
  "ا": "3489",
  "ى": "3489",
  "ب": "3490", // Vol 2
  "ت": "3491", // Vol 3
  "ث": "3491",
  "ج": "3492", // Vol 4
  "ح": "3492",
  "خ": "3493", // Vol 5
  "د": "3493",
  "ذ": "3494", // Vol 6
  "ر": "3494",
  "ز": "3495", // Vol 7
  "س": "3495",
  "ش": "3496", // Vol 8
  "ص": "3496",
  "ض": "3497", // Vol 9
  "ط": "3497",
  "ظ": "3498", // Vol 10
  "ع": "3498",
  "غ": "3499", // Vol 11
  "ف": "3499",
  "ق": "3500", // Vol 12
  "ك": "3500",
  "ل": "3501", // Vol 13
  "م": "3502", // Vol 14
  "ن": "3502",
  "ه": "3503", // Vol 15
  "و": "3503",
  "ي": "3503",
};

function getLisanBookId(root: string): string | undefined {
  if (!root || root.length === 0) return "3489";
  const lastChar = root[root.length - 1];
  return LISAN_VOLUMES_BY_LAST_LETTER[lastChar] || "3489";
}

function getDatabase(): SqliteDatabase | null {
  if (dbInstance) return dbInstance;
  if (dbInitAttempted) return null;

  try {
    const candidatePaths = [
      path.join(process.cwd(), "data", "lexicon", "db.sqlite"),
      path.join(process.cwd(), "db.sqlite"),
    ];
    if (typeof __dirname !== "undefined") {
      candidatePaths.push(path.resolve(__dirname, "../../../data/lexicon/db.sqlite"));
    }

    let resolvedPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        resolvedPath = p;
        break;
      }
    }

    // Auto-extract from zip if sqlite missing but zip exists
    if (!resolvedPath) {
      const zipCandidates = [
        path.join(process.cwd(), "data", "lexicon", "db.sqlite.zip"),
        path.join(process.cwd(), "db.sqlite.zip"),
      ];
      for (const zp of zipCandidates) {
        if (fs.existsSync(zp)) {
          const targetDir = path.dirname(zp);
          try {
            execSync(`tar -xf "${zp}"`, { cwd: targetDir, stdio: "ignore" });
            const extracted = path.join(targetDir, "db.sqlite");
            if (fs.existsSync(extracted)) {
              resolvedPath = extracted;
              break;
            }
          } catch {
            // best-effort
          }
        }
      }
    }

    // Auto-fetch database if missing completely
    if (!resolvedPath) {
      const targetDir = path.join(process.cwd(), "data", "lexicon");
      const targetZip = path.join(targetDir, "db.sqlite.zip");
      const downloadUrl = "https://raw.githubusercontent.com/wizsk/arabic_lexicons/main/assets/data/db/db.sqlite.zip";
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        execSync(`curl.exe -s -L -o "${targetZip}" "${downloadUrl}"`, { stdio: "ignore" });
        if (fs.existsSync(targetZip)) {
          execSync(`tar -xf "${targetZip}"`, { cwd: targetDir, stdio: "ignore" });
          const extracted = path.join(targetDir, "db.sqlite");
          if (fs.existsSync(extracted)) {
            resolvedPath = extracted;
          }
        }
      } catch {
        // best-effort
      }
    }

    if (!resolvedPath) {
      console.warn("RealBookLexicon: db.sqlite not found in candidates.");
      dbInitAttempted = true;
      return null;
    }

    // Load node:sqlite safely without Turbopack/Webpack bundle hijacking
    let sqliteModule: any = null;
    if (typeof process !== "undefined" && typeof (process as any).getBuiltinModule === "function") {
      sqliteModule = (process as any).getBuiltinModule("node:sqlite");
    }
    if (!sqliteModule) {
      try {
        const req = new Function("moduleName", "return require(moduleName)");
        sqliteModule = req("node:sqlite");
      } catch {
        // fallback
      }
    }

    const DatabaseSync = sqliteModule?.DatabaseSync;
    if (DatabaseSync) {
      dbInstance = new DatabaseSync(resolvedPath, { readOnly: true }) as SqliteDatabase;
      return dbInstance;
    }
  } catch (err) {
    console.warn("RealBookLexicon: Failed to open sqlite database:", err);
  }

  dbInitAttempted = true;
  return null;
}

function cleanEntryText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\|\s*([^|]+)\s*\|/g, "\n« $1 »\n")
    .replace(/\[\[([^\]]+)\]\]/g, "($1)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractQuranCitation(raw: string): { citation: string; author: string } | null {
  const match = raw.match(/\{([^}]+)\}(?:\s*\[([^\]]+)\])?/);
  if (match) {
    return {
      citation: match[1].trim(),
      author: match[2] ? `القرآن الكريم — سورة ${match[2]}` : "القرآن الكريم",
    };
  }
  return null;
}

function extractPoemCitation(raw: string): { citation: string; author: string } | null {
  const match = raw.match(/\|([^|]{10,120})\|/);
  if (match) {
    return {
      citation: match[1].trim().replace(/\s*\.\.\.\s*/, " ... "),
      author: "ديوان العرب والشواهد التراثية",
    };
  }
  return null;
}

function getConciseDefinition(cleanText: string, maxLen = 450): string {
  if (!cleanText) return "";
  if (cleanText.length <= maxLen) return cleanText;

  const slice = cleanText.slice(0, maxLen);
  const lastBreak = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("؛ "),
    slice.lastIndexOf(".\n"),
    slice.lastIndexOf(":\n"),
    slice.lastIndexOf("\n")
  );

  if (lastBreak > 200) {
    return slice.slice(0, lastBreak).trim() + "...";
  }
  return slice.trim() + "...";
}

function generateSearchKeys(word: string, candidateRoots: string[]): string[] {
  const keys = new Set<string>();
  const cleaned = cleanLexiconQuery(word);
  if (cleaned) {
    keys.add(cleaned);
    const unvocalized = normalizeArabic(cleaned, {
      stripTashkeel: true,
      stripTatweel: true,
      mapAlefVariants: false,
      mapAlefMaqsuraToYa: false,
    });
    if (unvocalized) keys.add(unvocalized);
  }

  for (const r of candidateRoots) {
    if (!r) continue;
    keys.add(r);
    // Weak letter variations
    keys.add(r.replace(/ي$/, "ى"));
    keys.add(r.replace(/ى$/, "ي"));
    keys.add(r.replace(/و$/, "ى"));
    keys.add(r.replace(/و$/, "ا"));
    keys.add(r.replace(/^[أإآ]/, "ا"));
    keys.add(r.replace(/^ا/, "أ"));
    keys.add(r.replace(/أ$/, "ء"));
    keys.add(r.replace(/ء$/, "أ"));
    // Geminate un-doubling / doubling
    if (r.length === 2) {
      keys.add(r + r[1]);
    }
    if (r.length === 3 && r[1] === r[2]) {
      keys.add(r.slice(0, 2));
    }
  }

  return Array.from(keys);
}

/**
 * Perform direct retrieval of verbatim classical dictionary text
 * from Lisan al-Arab, Maqayis al-Lughah, Al-Sihah, Al-Qamus al-Muhit, and Al-Mu'jam al-Wasit.
 */
export function lookupRealBookLexicon(word: string): LexiconLookupResult {
  const db = getDatabase();
  if (!db) {
    return {
      found: false,
      query: word,
      message: "قاعدة بيانات المعاجم التراثية غير مفعلة محلياً.",
    };
  }

  const { candidateRoots, normalized } = extractCandidateRoots(word);
  const primaryRoot = candidateRoots[0] || normalized.slice(0, 3) || word;
  const partOfSpeech = "اسم / مادة تراثية";
  const wazn = undefined;
  const searchKeys = generateSearchKeys(word, candidateRoots);

  const getLisan = db.prepare("SELECT word, meanings FROM lisanularab WHERE word = ? LIMIT 1");
  const getMaqayis = db.prepare("SELECT word, meanings FROM maqayeesul_luga WHERE word = ? LIMIT 1");
  const getSihah = db.prepare("SELECT word, meanings FROM mujamul_shihah WHERE word = ? LIMIT 1");
  const getMuhith = db.prepare("SELECT word, meanings FROM mujamul_muhith WHERE word = ? LIMIT 1");
  const getWasith = db.prepare("SELECT word, meanings FROM mujamul_wasith WHERE word = ? LIMIT 1");

  const definitions: DictionaryDefinition[] = [];
  let matchedRoot = primaryRoot;

  // 1. Check لسان العرب (ابن منظور - ت 711هـ)
  for (const key of searchKeys) {
    const row = getLisan.get(key) as { word: string; meanings: string } | undefined;
    if (row && row.meanings) {
      matchedRoot = row.word;
      const clean = cleanEntryText(row.meanings);
      const quran = extractQuranCitation(row.meanings);
      const poem = extractPoemCitation(row.meanings);
      const bookId = getLisanBookId(row.word);

      definitions.push({
        source: "لسان العرب",
        author: "ابن منظور (ت 711هـ)",
        century: "القرن الثامن الهجري",
        definition: getConciseDefinition(clean, 500),
        citation: quran?.citation || poem?.citation,
        citationAuthor: quran?.author || poem?.author,
        bookId,
        fullText: clean,
      });
      break;
    }
  }

  // 2. Check معجم مقاييس اللغة (أحمد بن فارس - ت 395هـ)
  for (const key of searchKeys) {
    const row = getMaqayis.get(key) as { word: string; meanings: string } | undefined;
    if (row && row.meanings) {
      if (!matchedRoot) matchedRoot = row.word;
      const clean = cleanEntryText(row.meanings);
      const quran = extractQuranCitation(row.meanings);
      const poem = extractPoemCitation(row.meanings);

      definitions.push({
        source: "مقاييس اللغة",
        author: "أحمد بن فارس (ت 395هـ)",
        century: "القرن الرابع الهجري",
        definition: getConciseDefinition(clean, 500),
        citation: quran?.citation || poem?.citation,
        citationAuthor: quran?.author || poem?.author,
        fullText: clean,
      });
      break;
    }
  }

  // 3. Check الصحاح في اللغة (الجوهري - ت 393هـ)
  for (const key of searchKeys) {
    const row = getSihah.get(key) as { word: string; meanings: string } | undefined;
    if (row && row.meanings) {
      const clean = cleanEntryText(row.meanings);
      const quran = extractQuranCitation(row.meanings);
      const poem = extractPoemCitation(row.meanings);

      definitions.push({
        source: "الصحاح في اللغة",
        author: "الجوهري (ت 393هـ)",
        century: "القرن الرابع الهجري",
        definition: getConciseDefinition(clean, 400),
        citation: quran?.citation || poem?.citation,
        citationAuthor: quran?.author || poem?.author,
        fullText: clean,
      });
      break;
    }
  }

  // 4. Check القاموس المحيط (الفيروزآبادي - ت 817هـ)
  for (const key of searchKeys) {
    const row = getMuhith.get(key) as { word: string; meanings: string } | undefined;
    if (row && row.meanings) {
      const clean = cleanEntryText(row.meanings);
      definitions.push({
        source: "القاموس المحيط",
        author: "الفيروزآبادي (ت 817هـ)",
        century: "القرن التاسع الهجري",
        definition: getConciseDefinition(clean, 350),
        fullText: clean,
      });
      break;
    }
  }

  // 5. Check المعجم الوسيط (مجمع اللغة العربية) if needed
  if (definitions.length < 2) {
    for (const key of searchKeys) {
      const row = getWasith.get(key) as { word: string; meanings: string } | undefined;
      if (row && row.meanings) {
        const clean = cleanEntryText(row.meanings);
        definitions.push({
          source: "المعجم الوسيط",
          author: "مجمع اللغة العربية بالقاهرة",
          century: "القرن الرابع عشر الهجري",
          definition: getConciseDefinition(clean, 350),
          fullText: clean,
        });
        break;
      }
    }
  }

  if (definitions.length === 0) {
    return {
      found: false,
      query: word,
      root: primaryRoot,
      suggestedRoots: candidateRoots,
      message: `لم يُعثر على مادة تراثية للكلمة [${word}] في أمهات كتب المعاجم.`,
    };
  }

  const suggestedRoots = candidateRoots.filter((r) => r !== matchedRoot);

  return {
    found: true,
    query: word,
    root: matchedRoot,
    suggestedRoots,
    entry: {
      word,
      root: matchedRoot,
      vocalized: word,
      partOfSpeech,
      wazn,
      definitions,
      relatedWords: candidateRoots,
    },
  };
}
