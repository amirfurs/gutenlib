import test from "node:test";
import assert from "node:assert/strict";
import { lookupClassicalWord, CLASSICAL_LEXICON } from "./classicalDictionary.ts";
import { extractCandidateRoots, formatRootLetters, cleanLexiconQuery } from "./stemmer.ts";

test("Lexicon: cleanLexiconQuery strips quotes, brackets, and punctuation", () => {
  assert.equal(cleanLexiconQuery("«عَسْجَدٌ»"), "عَسْجَدٌ");
  assert.equal(cleanLexiconQuery('"غَسَقٍ"'), "غَسَقٍ");
  assert.equal(cleanLexiconQuery("(وَتِينُهُ)"), "وَتِينُهُ");
  assert.equal(cleanLexiconQuery("صَلْد،"), "صَلْد");
});

test("Lexicon: formatRootLetters adds spaced hyphens", () => {
  assert.equal(formatRootLetters("كتب"), "ك - ت - ب");
  assert.equal(formatRootLetters("عسجد"), "ع - س - ج - د");
});

test("Lexicon: extractCandidateRoots handles prefixes and inflections", () => {
  const r1 = extractCandidateRoots("بالعسجد");
  assert.ok(r1.candidateRoots.includes("عسجد"), "Should include un-prefixed root عسجد");

  const r2 = extractCandidateRoots("والغسق");
  assert.ok(r2.candidateRoots.includes("غسق"), "Should include root غسق");

  const r3 = extractCandidateRoots("مواخر");
  assert.ok(r3.candidateRoots.includes("مخر") || r3.candidateRoots.includes("ماخر"), "Should extract candidate root for مواخر");
});

test("Lexicon: lookupClassicalWord finds exact and inflected entries", () => {
  const res1 = lookupClassicalWord("عسجد");
  assert.equal(res1.found, true);
  assert.equal(res1.root, "عسجد");
  assert.equal(res1.entry?.vocalized, "العَسْجَدُ");
  assert.equal(res1.entry?.definitions.length, 2);
  assert.equal(res1.entry?.definitions[0].source, "لسان العرب");
  assert.equal(res1.entry?.definitions[1].source, "مقاييس اللغة");

  // Inflected form with preposition: "بالعسجد"
  const res2 = lookupClassicalWord("بالعسجد");
  assert.equal(res2.found, true);
  assert.equal(res2.root, "عسجد");

  // Inflected form: "غسق الليل"
  const res3 = lookupClassicalWord("غسق");
  assert.equal(res3.found, true);
  assert.equal(res3.root, "غسق");
  assert.ok(res3.entry?.definitions[0].citation?.includes("غَسَقِ اللَّيْلِ"));
});

test("Lexicon: graceful fallback for unindexed vocabulary", () => {
  const fallback = lookupClassicalWord("قسطنطينية");
  assert.equal(fallback.found, false);
  assert.ok(fallback.message?.includes("غير مفهرسة"));
});
