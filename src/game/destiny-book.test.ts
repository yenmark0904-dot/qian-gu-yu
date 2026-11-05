import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { CHARACTERS, destinyBook } from "./data.ts";
import { pullMany } from "./logic.ts";
import { STORIES_EXTRA } from "./stories-extra.ts";
import { chapterList } from "./bond.ts";

const SSR = CHARACTERS.filter((character) => character.rarity === "SSR");

test("SSR 天命書 lives on eroticStory, which the tale-only screen ignored", () => {
  assert.ok(SSR.length >= 5);
  for (const character of SSR) {
    assert.equal(character.tale, undefined, `${character.name} has no tale`);
    assert.equal(Boolean(character.eroticStory?.trim()), true);
    const book = destinyBook(character);
    assert.ok(book);
    assert.equal(book.title, "天命書");
    assert.equal(book.text, character.eroticStory);
    const portrait = new URL(`../../public/portraits/${character.id}.jpg`, import.meta.url);
    assert.equal(existsSync(portrait), true, `${character.id} portrait`);
  }
});

/**
 * Owner-written four-chapter 緣分 stories, imported verbatim by
 * scripts/import-bond-chapters.mjs from /workspace/stories/extra/<id>_bond_4ch.txt.
 * Chapter 1 replaced the old first-meeting 天命書 (backups: /workspace/stories/<id>_tianmingshu.txt;
 * old fingerprints qin 3902440512, liuche 3042471278, libai 1169485465, zhouyu 581452769, lanling 2780553390). Fingerprints are FNV-1a of each body
 * (no heading), as printed by the import script.
 */
const BOND_IMPORTS: Record<string, { headings: string[]; sigs: number[] }> = {
  qin: {
    headings: ["第一章・初遇（表面的帝王）", "第二章・佔有（開始失控）", "第三章・深淵（秘密浮現）", "第四章・獻祭（完全交付）"],
    sigs: [1773033561, 103661728, 2423088873, 80009936],
  },
  liuche: {
    headings: ["第一章・馬上歸來", "第二章・金屋舊話", "第三章・帳中", "第四章・整夜不放"],
    sigs: [3992001961, 1804975745, 1045293485, 1701408529],
  },
  libai: {
    headings: ["第一章・桃花與酒", "第二章・求一個眼神", "第三章・浪子", "第四章・只醉你"],
    sigs: [347640983, 3412765204, 1565852205, 2566486895],
  },
  zhouyu: {
    headings: ["第一章・琴弦未斷", "第二章・軍報未批", "第三章・暗室無燈", "第四章・江水未歇"],
    sigs: [2655997290, 330387367, 3995810283, 1488232458],
  },
  lanling: {
    headings: ["第一章・面具還在", "第二章・傷在背上", "第三章・他先跪下來", "第四章・面具丟在帳外"],
    sigs: [1780757790, 3957314939, 1036396965, 3975639929],
  },
};
const SSR_STORY_SIG: Record<string, number> = {
  qin: BOND_IMPORTS.qin!.sigs[0]!,
  zhouyu: BOND_IMPORTS.zhouyu!.sigs[0]!,
  lanling: BOND_IMPORTS.lanling!.sigs[0]!,
  libai: BOND_IMPORTS.libai!.sigs[0]!,
  liuche: BOND_IMPORTS.liuche!.sigs[0]!,
};

function storySig(text: string) {
  let n = 2166136261;
  for (const ch of text) n = Math.imul(n ^ ch.codePointAt(0)!, 16777619);
  return n >>> 0;
}

function hanCount(text: string) {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

test("SSR 天命書 text is unchanged", () => {
  for (const character of SSR) {
    assert.equal(storySig(character.eroticStory ?? ""), SSR_STORY_SIG[character.id]);
    assert.equal(destinyBook(character)?.title, "天命書");
  }
});

test("SS and S carry 專屬物語, R keeps only a love line", () => {
  const lines = new Set<string>();
  for (const character of CHARACTERS) {
    const book = destinyBook(character);
    if (character.rarity === "R") {
      assert.equal(character.eroticStory, undefined, character.name);
      assert.equal(book, null);
      assert.equal(Boolean(character.line.trim()), true, character.name);
      assert.equal(lines.has(character.line), false, character.name);
      lines.add(character.line);
      continue;
    }
    if (character.rarity !== "SS" && character.rarity !== "S") continue;
    assert.ok(book, character.name);
    assert.equal(book.title, "專屬物語");
    assert.equal(book.text, character.eroticStory);
    const n = hanCount(book.text);
    const [min, max] = character.rarity === "SS" ? [110, 135] : [50, 70];
    assert.ok(n >= min && n <= max, `${character.name} ${n}`);
    assert.equal(lines.has(book.text), false, character.name);
    lines.add(book.text);
  }
});

test("each SSR can be drawn and still opens 天命書", () => {
  const seen = new Set<string>();
  for (let index = 0; index < SSR.length; index++) {
    let call = 0;
    const { cards } = pullMany(0, 1, false, () => {
      call += 1;
      if (call === 1) return 0.999;
      return (index + 0.5) / SSR.length;
    });
    const card = cards[0];
    assert.ok(card);
    assert.equal(card.rarity, "SSR");
    assert.equal(destinyBook(card)?.title, "天命書");
    assert.equal(destinyBook(card)?.text, card.eroticStory);
    seen.add(card.id);
  }
  assert.deepEqual([...seen].sort(), SSR.map((character) => character.id).sort());
});

test("pity grants an SSR whose 天命書 is present", () => {
  const { cards, pity } = pullMany(49, 1, false, () => 0);
  assert.equal(cards[0]?.rarity, "SSR");
  assert.equal(pity, 0);
  assert.equal(destinyBook(cards[0]!)?.title, "天命書");
});

for (const [id, { headings, sigs }] of Object.entries(BOND_IMPORTS)) {
  test(`${id} four chapters match the owner's file byte for byte`, () => {
    const character = CHARACTERS.find((c) => c.id === id)!;
    const extra = STORIES_EXTRA[id]!;
    const data = [
      { title: character.eroticTitle ?? "", text: character.eroticStory ?? "" },
      extra.chapters[1]!,
      extra.chapters[2]!,
      extra.chapters[3]!,
    ];
    assert.deepEqual(data.map((c) => c.title), headings);
    data.forEach((c, i) => assert.equal(storySig(c.text), sigs[i], `chapter ${i + 1}`));
    // Rebuild the file from data: heading line, body lines, trailing newline.
    const rebuilt = data.map((c) => `${c.title}\n${c.text}`).join("\n") + "\n";
    const source = new URL(`../../../stories/extra/${id}_bond_4ch.txt`, import.meta.url);
    if (existsSync(source)) assert.equal(rebuilt, readFileSync(source, "utf8"));
    assert.equal(destinyBook(character)?.chapter, headings[0]);
    const list = chapterList(character, 31, (cid, i) => STORIES_EXTRA[cid]?.chapters[i], destinyBook(character)!.text);
    assert.deepEqual(list.map((c) => c.title), headings);
    assert.deepEqual(list.map((c) => c.tier), [0, 2, 4, 6]);
    assert.deepEqual(list.map((c) => c.text), data.map((c) => c.text));
  });
}

