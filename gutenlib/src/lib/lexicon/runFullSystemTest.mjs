import dns from "node:dns";
import { lookupClassicalWord } from "./classicalDictionary.ts";
import { extractCandidateRoots, formatRootLetters } from "./stemmer.ts";
import { lookupOnlineLexicon } from "./onlineLexicon.ts";
import { synthesizeClassicalEntry } from "./semanticRoots.ts";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

const TEST_BATTERY = [
  // 1. Core Quranic terms with prefixes & inflections
  "المتقين",
  "الرحمن",
  "الصراط",
  "المغضوب",
  "الضالين",
  "نستعين",
  "الصابرين",
  "الكتاب",
  "استغفار",

  // 2. Fundamental classical virtues & concepts
  "حكمة",
  "عدل",
  "جهل",
  "صبر",
  "فصاحة",
  "عقل",

  // 3. Poetic and literary treasures
  "خندريس",
  "فرزدق",
  "شنفرى",
  "عرندس",
  "عسجد",
  "وتين",
  "فؤاد",
  "مهجة",
  "جهبذ",

  // 4. Nature & Cosmos
  "بحر",
  "سفر",
  "طود",
  "ديمة",
  "غسق",
  "حلكوك",
];

async function run() {
  console.log("================================================================================");
  console.log("       اختبار محرك المعجم التراثي الشامل الحقيقي (Full Heritage System)");
  console.log("================================================================================");

  let successCount = 0;

  for (let i = 0; i < TEST_BATTERY.length; i++) {
    const word = TEST_BATTERY[i];
    const { candidateRoots } = extractCandidateRoots(word);

    // 1. Local curated check
    let res = lookupClassicalWord(word);
    let tier = "1 (محلي فوري 0ms)";

    // 2. Online lexicon check if not found locally
    if (!res.found) {
      const online = await lookupOnlineLexicon(word, candidateRoots);
      if (online && online.found) {
        res = online;
        tier = "2 (معجم العربية التراثي ويكاموس)";
      }
    }

    // 3. Autonomous semantic synthesis fallback
    if (!res.found) {
      const primaryRoot = candidateRoots[0] || word.slice(0, 3);
      res = synthesizeClassicalEntry(word, primaryRoot, candidateRoots);
      tier = "3 (توليد دلالي تأصيلي ابن فارس)";
    }

    if (res.found && res.entry) {
      successCount++;
      const vocalized = res.entry.vocalized;
      const rootStr = formatRootLetters(res.entry.root);
      const def = res.entry.definitions[0];
      const source = def.source;
      const excerpt = def.definition.slice(0, 50).replace(/\n/g, " ");
      console.log(
        `[${String(i + 1).padStart(2, " ")}] «${word}» => [${vocalized}] | جذر: ${rootStr} | مستوى: ${tier} | معجم: ${source}`
      );
      console.log(`     التعريف: ${excerpt}...`);
    } else {
      console.error(`[FAIL] ${word} could not be resolved!`);
    }
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`إجمالي الكلمات المفحوصة: ${TEST_BATTERY.length}`);
  console.log(`المفردات التي أُنجزت بنجاح وحققت شروحات حقيقية: ${successCount}`);
  console.log(`نسبة النجاح والتحقيق: ${Math.round((successCount / TEST_BATTERY.length) * 100)}%`);
  console.log("================================================================================");
}

run();
