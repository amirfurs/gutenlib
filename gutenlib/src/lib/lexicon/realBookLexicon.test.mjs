import test from "node:test";
import assert from "node:assert/strict";
import { lookupRealBookLexicon } from "./realBookLexicon.ts";

test("RealBookLexicon: retrieves authentic text from Lisan al-Arab & Maqayis for كتب", () => {
  const res = lookupRealBookLexicon("كتب");
  assert.equal(res.found, true);
  assert.equal(res.root, "كتب");
  assert.ok(res.entry.definitions.length >= 2);

  const lisan = res.entry.definitions.find((d) => d.source === "لسان العرب");
  assert.ok(lisan, "Should have Lisan al-Arab definition");
  assert.ok(lisan.author.includes("ابن منظور"));
  assert.ok(lisan.definition.includes("الكِتابُ") || lisan.definition.includes("كَتَبَ"));
  assert.ok(lisan.fullText.includes("الكِتابُ"));
  assert.equal(lisan.bookId, "3490"); // Lisan Volume 2 in ABL

  const maqayis = res.entry.definitions.find((d) => d.source === "مقاييس اللغة");
  assert.ok(maqayis, "Should have Maqayis al-Lughah definition");
  assert.ok(maqayis.author.includes("بن فارس"));
  assert.ok(maqayis.definition.includes("أَصْلٌ صَحِيحٌ"));
});

test("RealBookLexicon: handles weak / assimilated Quranic roots (المتقين -> وقي)", () => {
  const res = lookupRealBookLexicon("المتقين");
  assert.equal(res.found, true);
  assert.ok(res.root === "وقي" || res.root === "وقى");

  const lisan = res.entry.definitions.find((d) => d.source === "لسان العرب");
  assert.ok(lisan);
  assert.ok(lisan.definition.includes("وقاهُ اللهُ") || lisan.definition.includes("صانَه"));

  const maqayis = res.entry.definitions.find((d) => d.source === "مقاييس اللغة");
  assert.ok(maqayis);
  assert.ok(maqayis.definition.includes("تَدُلُّ عَلَى دَفْعِ شَيْءٍ"));
});

test("RealBookLexicon: retrieves classical citations for الصراط (صرط)", () => {
  const res = lookupRealBookLexicon("الصراط");
  assert.equal(res.found, true);
  assert.equal(res.root, "صرط");

  const lisan = res.entry.definitions.find((d) => d.source === "لسان العرب");
  assert.ok(lisan);
  assert.ok(lisan.definition.includes("الصِّراطَ") || lisan.definition.includes("الطَّرِيقُ"));
  assert.equal(lisan.bookId, "3497"); // Lisan Volume 9 in ABL
});

test("RealBookLexicon: retrieves authentic text for rare classical words (عسجد، غسق، وتين)", () => {
  for (const w of ["عسجد", "غسق", "وتين"]) {
    const res = lookupRealBookLexicon(w);
    assert.equal(res.found, true, `Should find real book entry for ${w}`);
    assert.ok(res.entry.definitions.length >= 2, `Should have multiple dictionary sources for ${w}`);
  }
});
