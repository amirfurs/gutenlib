import { lookupClassicalWord } from "./classicalDictionary.ts";
import { formatRootLetters } from "./stemmer.ts";

const TEST_WORDS = [
  // 1. Classical terms with varied diacritics & punctuation
  { raw: "«عَسْجَدٌ»", category: "معادن وجواهر (مشكول مع علامات تنصيص)" },
  { raw: "بالعسجد", category: "سوابق جر وعطف (بـ + الـ)" },
  { raw: "عسجدي", category: "نسب واشتقاق" },

  // 2. Night & Atmospheric terms
  { raw: "غَسَقِ", category: "ظواهر ليلية (تشكيل)" },
  { raw: "فالغسق", category: "سوابق متعددة (فـ + الـ)" },
  { raw: "حُلْكُوكٍ", category: "ألوان وصفات مشبهة" },
  { raw: "الغياهب", category: "جموع تكسير (الغياهب -> غيهب)" },
  { raw: "سَدَفٌ", category: "أضداد لغوية" },

  // 3. Anatomical & Vital terms
  { raw: "«وَتِينُهُ»", category: "ضمائر متصلة (ـه)" },
  { raw: "كالوتين", category: "تشبيه وتعريف (كـ + الـ)" },
  { raw: "موتون", category: "اسم مفعول (موتون -> وتن)" },

  // 4. Celestial & Nature
  { raw: "أَفَلَتْ", category: "أفعال ماضية مؤنثة (ـت)" },
  { raw: "الآفلين", category: "جموع مذكر سالمة (الـ + ـين)" },
  { raw: "دِيمَةٌ", category: "أنواء وأمطار" },
  { raw: "كَالطَّوْدِ", category: "تضاريس وأعلام" },
  { raw: "صَلْداً", category: "تنوين نصب (ـاً)" },
  { raw: "سَنَا", category: "أسماء مقصورة (ضوء البرق)" },
  { raw: "مَوَاخِرَ", category: "وزن فواعل (مواخر -> مخر)" },

  // 5. Auditory & Emotional
  { raw: "هَيْنَمَة", category: "أصوات خفية" },
  { raw: "لَجَبٌ", category: "أصوات هادرة" },
  { raw: "كَمَدُ", category: "مشاعر وأحزان مكتومة" },

  // 6. Permanence & Nobility
  { raw: "سَرْمَداً", category: "صفات الدوام" },
  { raw: "أَثِيلٌ", category: "أصالة ومجد" },
  { raw: "رُوَاءٌ", category: "بهاء وجمال" },
  { raw: "قَسْوَرَةٍ", category: "أسماء الأسد" },

  // 7. Non-indexed fallback checks
  { raw: "قسطنطينية", category: "أعلام غير مفهرسة (فحص الاستجابة الاحتياطية)" },
  { raw: "استكشاف", category: "أوزان مزيدة غير مفهرسة" },
];

console.log("================================================================================");
console.log("       اختبار المعجم التراثي اللحظي (Gutenlib Classical Lexicon Test Suite)");
console.log("================================================================================");

let passedCount = 0;
let fallbackCount = 0;

TEST_WORDS.forEach((item, index) => {
  const result = lookupClassicalWord(item.raw);
  const num = String(index + 1).padStart(2, " ");

  if (result.found && result.entry) {
    passedCount++;
    const e = result.entry;
    const sources = e.definitions.map((d) => d.source).join(" · ");
    const hasCitation = e.definitions.some((d) => d.citation);
    const citationBadge = hasCitation ? "✓ نعم" : "—";

    console.log(
      `[${num}] ${item.raw.padEnd(12)} -> [${e.vocalized}] | جذر: ${formatRootLetters(e.root).padEnd(11)} | وزن: ${(e.wazn || "-").padEnd(7)} | معاجم: ${sources} | شاهد: ${citationBadge}`
    );
  } else {
    fallbackCount++;
    console.log(
      `[${num}] ${item.raw.padEnd(12)} -> [غير مفهرس]  | جذر مقدر: ${formatRootLetters(result.root || "").padEnd(11)} | استجابة احتياطية هادئة ✓ (${item.category})`
    );
  }
});

console.log("--------------------------------------------------------------------------------");
console.log(`إجمالي الكلمات المختبرة: ${TEST_WORDS.length}`);
console.log(`المفردات التراثية المحققة بنجاح: ${passedCount}`);
console.log(`المفردات المعالجة بالاشتقاق الاحتياطي: ${fallbackCount}`);
console.log("================================================================================");
