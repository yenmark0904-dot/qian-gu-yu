import assert from "node:assert/strict";
import test from "node:test";
import { BY_ID, CHARACTERS, RARITY_ORDER, WEIGHTS, type Rarity } from "./data.ts";
import { migrateLegacySr } from "./migrate.ts";
import { pickOf, pullMany, rollRarity } from "./logic.ts";

const REQUESTED: Array<[string, string, Rarity]> = [
  ["白居易", "詩魔", "R"],
  ["陶淵明", "五柳", "R"],
  ["杜牧", "揚州夢", "R"],
  ["孟浩然", "山水詩人", "R"],
  ["王昌齡", "七絕聖手", "R"],
  ["馬超", "錦馬超", "R"],
  ["周泰", "護主", "R"],
  ["陸遜", "儒將", "R"],
  ["姜維", "麒麟兒", "R"],
  ["少年長恭", "未戴面具", "R"],
  ["謝靈運", "山水詩祖", "R"],
  ["駱賓王", "初唐四傑", "R"],
  ["陳子昂", "幽州台", "R"],
  ["岑參", "邊塞", "R"],
  ["韋應物", "清雅", "R"],
  ["王勃", "滕王閣", "R"],
  ["賀知章", "四明狂客", "R"],
  ["王之渙", "涼州詞", "R"],
  ["高適", "邊塞", "R"],
  ["劉禹錫", "詩豪", "R"],
  ["元稹", "曾經滄海", "R"],
  ["柳宗元", "江雪", "R"],
  ["李賀", "詩鬼", "R"],
  ["張若虛", "春江花月", "R"],
  ["崔顥", "黃鶴樓", "R"],
  ["秦觀", "山抹微雲", "R"],
  ["黃庭堅", "山谷", "R"],
  ["晏幾道", "小晏", "R"],
  ["甘寧", "錦帆", "R"],
  ["太史慈", "信義", "R"],
  ["蘇軾", "東坡", "S"],
  ["韓信", "兵仙", "S"],
  ["杜甫", "詩聖", "S"],
  ["岳飛", "岳武穆", "S"],
  ["王維", "詩佛", "S"],
  ["辛棄疾", "詞帥", "S"],
  ["項羽", "西楚霸王", "S"],
  ["呂布", "飛將", "S"],
  ["衛青", "長平侯", "S"],
  ["屈原", "離騷", "S"],
  ["李煜", "詞帝", "S"],
  ["劉秀", "光武帝", "S"],
  ["孫策", "小霸王", "S"],
  ["曹植", "才高八斗", "S"],
  ["溫庭筠", "花間鼻祖", "S"],
  ["趙禎", "宋仁宗", "S"],
  ["李商隱", "無題", "S"],
  ["王安石", "拗相公", "S"],
  ["歐陽修", "醉翁", "S"],
  ["柳永", "凡有井水處", "S"],
];

test("the fifty requested figures are in the pool once, at R or S", () => {
  assert.equal(REQUESTED.length, 50);
  const ids = new Set<string>();
  for (const character of CHARACTERS) {
    assert.equal(ids.has(character.id), false, character.id);
    ids.add(character.id);
    assert.ok(character.name && character.epithet && character.line && character.verse);
  }
  for (const [name, epithet, rarity] of REQUESTED) {
    const matches = CHARACTERS.filter((character) => character.name === name);
    assert.equal(matches.length, 1, name);
    const character = matches[0]!;
    assert.equal(character.epithet, epithet);
    assert.equal(character.rarity, rarity);
    assert.equal(`${character.name} · ${character.epithet}`, `${name} · ${epithet}`);
    if (rarity === "R") assert.equal(character.eroticStory, undefined);
    else assert.equal(Boolean(character.eroticStory?.trim()), true);
  }
});

test("SR is gone and S keeps SR's exact 12% weight", () => {
  assert.deepEqual(RARITY_ORDER, ["R", "S", "SS", "SSR"]);
  assert.equal(WEIGHTS.S, 1200);
  assert.equal(WEIGHTS.R, 8100);
  assert.equal(WEIGHTS.SS, 500);
  assert.equal(WEIGHTS.SSR, 200);
  const sum = RARITY_ORDER.reduce((total, rarity) => total + WEIGHTS[rarity], 0);
  assert.equal(sum, 10000);
  for (const character of CHARACTERS) {
    assert.notEqual(character.rarity, "SR");
  }

  const counts: Record<Rarity, number> = { R: 0, S: 0, SS: 0, SSR: 0 };
  for (let i = 0; i < 10000; i++) {
    const rarity = rollRarity(0, () => (i + 0.5) / 10000);
    counts[rarity] += 1;
  }
  assert.deepEqual(counts, { R: 8100, S: 1200, SS: 500, SSR: 200 });
});

test("every R and S figure can be drawn, including former SR ids", () => {
  for (const rarity of ["R", "S"] as const) {
    const pool = CHARACTERS.filter((character) => character.rarity === rarity);
    assert.ok(pool.length > 0);
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      const card = pickOf(rarity, () => (i + 0.01) / pool.length);
      assert.equal(card.rarity, rarity);
      seen.add(card.id);
    }
    assert.equal(seen.size, pool.length);
  }
  for (const id of ["hanxin", "yuefei", "xinqiji"]) {
    assert.equal(BY_ID[id]?.rarity, "S");
  }
});

test("ten-pull floor and SSR pity are unchanged", () => {
  const ten = pullMany(0, 10, false, () => 0);
  assert.equal(ten.cards.filter((card) => card.rarity === "S").length, 1);
  assert.equal(ten.cards.filter((card) => card.rarity === "R").length, 9);
  const gifted = pullMany(0, 1, true, () => 0);
  assert.equal(gifted.cards[0]?.rarity, "SS");
  const pity = pullMany(49, 1, false, () => 0);
  assert.equal(pity.cards[0]?.rarity, "SSR");
  assert.equal(pity.pity, 0);
});

test("saves that still say SR load as S and keep former SR inventories", () => {
  const migrated = migrateLegacySr({
    ink: 8000,
    owned: { hanxin: 2, yuefei: 1, xinqiji: 3, gone: 9 },
    history: ["hanxin", "yuefei", "xinqiji"],
    rarity: "SR",
    nested: { tier: "SR", rarity: "S", note: "SR" },
  });
  assert.equal(migrated.rarity, "S");
  assert.equal(migrated.nested.tier, "S");
  assert.equal(migrated.nested.rarity, "S");
  assert.equal(migrated.nested.note, "SR");
  assert.deepEqual(migrated.owned, { hanxin: 2, yuefei: 1, xinqiji: 3, gone: 9 });

  const owned: Record<string, number> = {};
  for (const [id, count] of Object.entries(migrated.owned)) {
    if (!BY_ID[id]) continue;
    owned[id] = count;
  }
  assert.deepEqual(owned, { hanxin: 2, yuefei: 1, xinqiji: 3 });
  assert.equal(BY_ID.hanxin?.epithet, "兵仙");
  assert.equal(BY_ID.yuefei?.epithet, "岳武穆");
  assert.equal(BY_ID.xinqiji?.epithet, "詞帥");
});
