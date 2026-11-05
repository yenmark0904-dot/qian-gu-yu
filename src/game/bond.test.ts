import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CG_TIER,
  CHAPTER_TIERS,
  LOVE_TIER,
  MARK_OVERFLOW,
  MARK_TRICKLE,
  MAX_DUPES,
  bondLevel,
  bondProgress,
  bondTitle,
  chapterList,
  dupOutcome,
  shownSkin,
  skinUnlocked,
  tierRequirement,
  tierRewards,
} from "./bond.ts";
import { CHARACTERS, type Rarity } from "./data.ts";
import { CHARACTER_PRICE, COSMETICS, buyCharacter, buyCosmetic } from "./shop.ts";
import { ALL_SKILLS, NO_FX, describeFx, rewardBonus, skillFx, skillOf, skillStep, type SkillFx } from "./skills.ts";
import { STORIES_EXTRA, extraChapter } from "./stories-extra.ts";
import { COLOR, crackSeals, freshBoard, makeRng, seedSpecials, skillStrike } from "./match3.ts";

const copiesFor = (tier: number) => tier * 5 + 1;
const byRarity = (r: Rarity) => CHARACTERS.find((c) => c.rarity === r)!;

test("bond: every 5 duplicates is one tier, capped at 6", () => {
  assert.equal(bondLevel(0), 0);
  assert.equal(bondLevel(1), 0);
  assert.equal(bondLevel(5), 0);
  assert.equal(bondLevel(6), 1);
  assert.equal(bondLevel(11), 2);
  assert.equal(bondLevel(30), 5);
  assert.equal(bondLevel(31), 6);
  assert.equal(bondLevel(500), 6);
  assert.equal(MAX_DUPES, 30);
  assert.equal(bondTitle(0), "未逢");
  assert.deepEqual(bondProgress(8), { level: 1, have: 2, need: 5, max: false });
  assert.equal(bondProgress(31).max, true);
  assert.equal(tierRequirement(2), "緣分二階解鎖");
  assert.equal(tierRequirement(6), "緣分六階解鎖");
});

test("bond: story tiers match the owner spec (totals R1 S2 SS3 SSR4)", () => {
  assert.deepEqual(CHAPTER_TIERS, { R: [3], S: [3], SS: [2, 4], SSR: [2, 4, 6] });
  assert.equal(CG_TIER, 6);
  const totals: Record<Rarity, number> = { R: 1, S: 2, SS: 3, SSR: 4 };
  for (const r of ["R", "S", "SS", "SSR"] as Rarity[]) {
    const c = byRarity(r);
    const list = chapterList(c, copiesFor(6), extraChapter, r === "R" ? null : "first");
    assert.equal(list.length, totals[r], r);
    // each extra chapter is locked one tier below and open at its tier
    for (const tier of CHAPTER_TIERS[r]) {
      const below = chapterList(c, copiesFor(tier - 1), extraChapter, "first").filter((ch) => ch.tier === tier);
      const at = chapterList(c, copiesFor(tier), extraChapter, "first").filter((ch) => ch.tier === tier);
      assert.equal(below.length, 1);
      assert.equal(below[0]!.state, "locked");
      assert.equal(below[0]!.requirement, tierRequirement(tier));
      assert.notEqual(at[0]!.state, "locked");
    }
  }
});

test("bond: first-meeting story needs the card; unowned is all locked", () => {
  const ssr = byRarity("SSR");
  const none = chapterList(ssr, 0, extraChapter, "first");
  assert.ok(none.every((ch) => ch.state === "locked"));
  const met = chapterList(ssr, 1, extraChapter, "first");
  assert.equal(met[0]!.state, "open");
  assert.equal(met[0]!.text, "first");
  assert.ok(met.slice(1).every((ch) => ch.state === "locked"));
});

test("bond: empty extra text shows as empty (待你撰寫), not locked", () => {
  const ss = byRarity("SS");
  const list = chapterList(ss, copiesFor(4), () => ({ text: "  " }), "first");
  assert.ok(list.slice(1).every((ch) => ch.state === "empty"));
});

test("stories-extra: one entry per character with the right chapter count and SSR CG slot", () => {
  for (const c of CHARACTERS) {
    const e = STORIES_EXTRA[c.id];
    assert.ok(e, c.id);
    assert.equal(Object.keys(e.chapters).length, CHAPTER_TIERS[c.rarity].length, c.id);
    assert.equal(e.voice.length, 2);
    if (c.rarity === "SSR") assert.equal(typeof e.cg, "string");
  }
});

test("bond: R 初遇故事 opens at 緣分三階 and R 情話·其二 at 二階; other rarities keep 情話 at 三階", () => {
  assert.deepEqual(LOVE_TIER, { R: 2, S: 3, SS: 3, SSR: 3 });
  const r = byRarity("R");
  const at2 = chapterList(r, copiesFor(2), extraChapter, null);
  assert.equal(at2.length, 1);
  assert.equal(at2[0]!.state, "locked");
  assert.equal(at2[0]!.requirement, "緣分三階解鎖");
  assert.equal(chapterList(r, copiesFor(3), extraChapter, null)[0]!.state, "open");
  const rr = tierRewards("R");
  assert.ok(rr[1]!.items.includes("情話 · 其二"));
  assert.ok(!rr[2]!.items.includes("情話 · 其二"));
  assert.ok(rr[2]!.items.some((s) => s.includes("《專屬物語》")));
  assert.ok(!rr[1]!.items.some((s) => s.includes("《專屬物語》")));
  for (const k of ["S", "SS", "SSR"] as Rarity[]) {
    assert.ok(tierRewards(k)[2]!.items.includes("情話 · 其二"), k);
    assert.ok(!tierRewards(k)[1]!.items.includes("情話 · 其二"), k);
  }
});

test("bond: tier rewards list the story / CG unlocks and cosmetics", () => {
  const ssr = tierRewards("SSR");
  assert.equal(ssr.length, 6);
  assert.ok(ssr[5]!.items.some((s) => s.includes("CG")));
  assert.ok(!tierRewards("SS")[5]!.items.some((s) => s.includes("CG")));
  assert.equal(skinUnlocked("gilt", copiesFor(1)), false);
  assert.equal(skinUnlocked("gilt", copiesFor(2)), true);
  assert.equal(skinUnlocked("vow", copiesFor(6)), true);
  assert.equal(shownSkin(copiesFor(1), "vow"), "base");
});

test("墨痕: small trickle before max, full overflow after tier 6", () => {
  const up = dupOutcome("SSR", 5); // 5 → 6 copies
  assert.equal(up.levelUp, true);
  assert.equal(up.level, 1);
  assert.equal(up.marks, MARK_TRICKLE.SSR);
  assert.equal(dupOutcome("R", 2).levelUp, false);
  assert.equal(dupOutcome("R", 2).marks, MARK_TRICKLE.R);
  const last = dupOutcome("SS", 30); // reaches tier 6
  assert.equal(last.level, 6);
  assert.equal(last.overflow, false);
  const over = dupOutcome("SS", 31);
  assert.equal(over.overflow, true);
  assert.equal(over.marks, MARK_OVERFLOW.SS);
  assert.equal(over.levelUp, false);
  assert.ok(MARK_OVERFLOW.R < MARK_OVERFLOW.S && MARK_OVERFLOW.S < MARK_OVERFLOW.SS && MARK_OVERFLOW.SS < MARK_OVERFLOW.SSR);
});

test("墨寶閣: buying characters and cosmetics", () => {
  const ssr = byRarity("SSR");
  const base = { marks: 2000, owned: {} as Record<string, number>, cosmetics: [] as string[] };
  const a = buyCharacter(base, ssr.id, "SSR");
  assert.ok(a.ok);
  if (a.ok) {
    assert.equal(a.state.marks, 2000 - CHARACTER_PRICE.SSR);
    assert.equal(a.state.owned[ssr.id], 1);
  }
  assert.deepEqual(buyCharacter({ ...base, marks: 10 }, ssr.id, "SSR"), { ok: false, reason: "broke" });
  assert.deepEqual(buyCharacter({ ...base, owned: { [ssr.id]: 31 } }, ssr.id, "SSR"), { ok: false, reason: "maxed" });
  assert.deepEqual(buyCharacter(base, "nobody", undefined), { ok: false, reason: "unknown" });
  const gilt = COSMETICS.find((c) => c.id === "frame-gilt")!;
  const b = buyCosmetic(base, gilt.id);
  assert.ok(b.ok);
  if (b.ok) {
    assert.equal(b.state.marks, 2000 - gilt.price);
    assert.deepEqual(buyCosmetic(b.state, gilt.id), { ok: false, reason: "owned" });
  }
  assert.deepEqual(buyCosmetic(base, "frame-plain"), { ok: false, reason: "owned" });
  assert.deepEqual(buyCosmetic({ ...base, marks: 0 }, gilt.id), { ok: false, reason: "broke" });
});

/* ── 助陣 skills ─────────────────────────────────────────────────── */

/** A rough power score, only for ordering rarities in the test. */
function power(fx: SkillFx) {
  return (
    (fx.moves ?? 0) * 1 +
    ((fx.mult ?? 1) - 1) * 40 +
    (fx.line ?? 0) * 0.9 +
    (fx.row ?? 0) * 1 +
    (fx.bomb ?? 0) * 1.6 +
    (fx.color ?? 0) * 3 +
    (fx.seals ?? 0) * 0.35 +
    (fx.reward ?? 0) * 8 +
    (fx.sweep ? 4 : 0) +
    (fx.burn ?? 0) * 1.6
  );
}

test("skills: every character has a skill; rarer is stronger at every step", () => {
  for (const c of CHARACTERS) assert.ok(skillOf(c.id), c.id);
  assert.equal(Object.keys(ALL_SKILLS).length, CHARACTERS.length);
  const best: Record<Rarity, number[]> = { R: [0, 0, 0], S: [0, 0, 0], SS: [0, 0, 0], SSR: [0, 0, 0] };
  const worst: Record<Rarity, number[]> = { R: [99, 99, 99], S: [99, 99, 99], SS: [99, 99, 99], SSR: [99, 99, 99] };
  const avg: Record<Rarity, number[]> = { R: [0, 0, 0], S: [0, 0, 0], SS: [0, 0, 0], SSR: [0, 0, 0] };
  const n: Record<Rarity, number> = { R: 0, S: 0, SS: 0, SSR: 0 };
  for (const c of CHARACTERS) {
    const s = skillOf(c.id)!;
    n[c.rarity]++;
    s.steps.forEach((fx, i) => {
      const p = power(fx);
      best[c.rarity][i] = Math.max(best[c.rarity][i]!, p);
      worst[c.rarity][i] = Math.min(worst[c.rarity][i]!, p);
      avg[c.rarity][i]! += p;
      if (i > 0) assert.ok(p >= power(s.steps[i - 1]!), `${c.id} step ${i} weaker than step ${i - 1}`);
    });
  }
  for (let i = 0; i < 3; i++) {
    const a = (r: Rarity) => avg[r][i]! / n[r];
    assert.ok(a("R") < a("S") && a("S") < a("SS") && a("SS") < a("SSR"), `step ${i} averages`);
    assert.ok(best.R[i]! <= worst.SS[i]!, `R never beats an SS at step ${i}`);
  }
});

test("skills: SS and SSR names are distinct; R may share", () => {
  for (const r of ["SS", "SSR"] as Rarity[]) {
    const names = CHARACTERS.filter((c) => c.rarity === r).map((c) => skillOf(c.id)!.name);
    assert.equal(new Set(names).size, names.length, r);
  }
  const ssrIds = ["qin", "zhouyu", "lanling", "libai", "liuche"];
  for (const id of ssrIds) assert.ok(skillOf(id), id);
  assert.ok(skillOf("qin")!.steps.every((fx) => fx.sweep));
  assert.ok(skillOf("zhouyu")!.steps.every((fx) => (fx.burn ?? 0) > 0));
  assert.ok(skillOf("lanling")!.steps.every((fx) => (fx.bomb ?? 0) >= 2));
  assert.ok(skillOf("liuche")!.steps.every((fx) => (fx.reward ?? 0) > 0));
  assert.ok(skillOf("libai")!.steps.every((fx) => (fx.moves ?? 0) > 0 && (fx.mult ?? 1) > 1));
});

test("skills: bond scaling, unowned is nothing, descriptions", () => {
  assert.equal(skillStep(1), 0);
  assert.equal(skillStep(copiesFor(2)), 0);
  assert.equal(skillStep(copiesFor(3)), 1);
  assert.equal(skillStep(copiesFor(5)), 1);
  assert.equal(skillStep(copiesFor(6)), 2);
  assert.equal(skillFx("libai", 0), NO_FX);
  assert.ok(skillFx("libai", copiesFor(6)).moves > skillFx("libai", 1).moves);
  assert.match(describeFx({ moves: 2, line: 1 }), /\+2 步/);
  assert.match(describeFx({ sweep: true }), /橫掃/);
  assert.equal(describeFx({}), "無");
});

test("skills: reward bonus only on new stars", () => {
  assert.equal(rewardBonus({ reward: 0.5 }, 100, 1, 3), 50);
  assert.equal(rewardBonus({ reward: 0.5 }, 5, 3, 3), 0);
  assert.equal(rewardBonus({ reward: 0 }, 100, 0, 3), 0);
});

function sealedBoard(seed: number) {
  const seal = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r >= 5 ? (c % 2 ? 2 : 1) : 0)));
  return freshBoard(8, 8, seal, makeRng(seed));
}

test("match3: seedSpecials places gifts on unsealed plain cells", () => {
  const b = sealedBoard(3);
  const out = seedSpecials(b, { bomb: 2, line: 1, color: 1 }, makeRng(4));
  let bombs = 0, lines = 0, colors = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = out.cells[r]![c]!;
      if (p.special) assert.equal(out.seal[r]![c], 0, "never on a seal");
      if (p.special === "bomb") bombs++;
      if (p.special === "row" || p.special === "col") lines++;
      if (p.special === "color") {
        colors++;
        assert.equal(p.kind, COLOR);
      }
    }
  assert.deepEqual([bombs, lines, colors], [2, 1, 1]);
});

test("match3: crackSeals hits the thickest seals first", () => {
  const b = sealedBoard(5);
  const before = b.seal.flat().reduce((n, v) => n + v, 0);
  const { board, broken, hits } = crackSeals(b, 4, makeRng(6));
  assert.equal(hits.length, 4);
  assert.equal(board.seal.flat().reduce((n, v) => n + v, 0), before - 4);
  assert.equal(broken, 0, "double seals only lose their ice first");
  for (const h of hits) assert.equal(b.seal[h.r]![h.c], 2);
});

test("match3: skillStrike sweep and burn clear and score", () => {
  const b = sealedBoard(7);
  const sweep = skillStrike(b, { kind: "sweep" }, makeRng(8));
  assert.ok(sweep && sweep.score > 0 && sweep.waves.length >= 1);
  const burn = skillStrike(b, { kind: "burn", rows: 2 }, makeRng(9));
  assert.ok(burn);
  assert.ok(burn.sealsBroken > 0 || burn.board.seal.flat().reduce((n, v) => n + v, 0) < b.seal.flat().reduce((n, v) => n + v, 0));
});

test("stories-extra: every non-empty SSR CG points at a real file in public/cg (all five SSRs have one)", async () => {
  const { existsSync } = await import("node:fs");
  assert.equal(STORIES_EXTRA.libai.cg, "/cg/libai.jpg");
  assert.equal(STORIES_EXTRA.qin.cg, "/cg/qin.jpg");
  assert.equal(STORIES_EXTRA.lanling.cg, "/cg/lanling.jpg");
  assert.equal(STORIES_EXTRA.liuche.cg, "/cg/liuche.jpg");
  assert.equal(STORIES_EXTRA.zhouyu.cg, "/cg/zhouyu.jpg");
  for (const id of ["qin", "zhouyu", "lanling", "libai", "liuche"]) assert.ok(STORIES_EXTRA[id]?.cg?.trim(), `${id}: SSR CG set`);
  for (const c of CHARACTERS) {
    const cg = STORIES_EXTRA[c.id]?.cg?.trim();
    if (!cg) continue;
    assert.equal(c.rarity, "SSR", `${c.id}: CG is SSR-only`);
    assert.match(cg, /^\/cg\/[a-z0-9_-]+\.(jpg|jpeg|png|webp)$/, c.id);
    assert.ok(existsSync(new URL(`../../public${cg}`, import.meta.url)), `${c.id}: public${cg} missing`);
  }
  // Unlock tier: 31 copies = 六階 shows the CG, 30 copies (五階) is still locked.
  assert.equal(bondLevel(31) >= CG_TIER, true);
  assert.equal(bondLevel(30) >= CG_TIER, false);
});

test("stories-extra: all 10 SS have 緣分 chapters 1–2, all 20 S and all 30 R have chapter 1 (owner text imported)", () => {
  const ss = CHARACTERS.filter((c) => c.rarity === "SS");
  const s = CHARACTERS.filter((c) => c.rarity === "S");
  assert.equal(ss.length, 10);
  assert.equal(s.length, 20);
  for (const c of ss)
    for (const i of [1, 2]) {
      const ch = STORIES_EXTRA[c.id]?.chapters[i];
      assert.ok(ch?.title.trim() && ch.text.trim(), `${c.id} SS chapter ${i}`);
    }
  for (const c of s) {
    const ch = STORIES_EXTRA[c.id]?.chapters[1];
    assert.ok(ch?.title.trim() && ch.text.trim(), `${c.id} S chapter 1`);
  }
  const r = CHARACTERS.filter((c) => c.rarity === "R");
  assert.equal(r.length, 30);
  for (const c of r) {
    const ch = STORIES_EXTRA[c.id]?.chapters[1];
    assert.ok(ch?.title.trim() && ch.text.trim(), `${c.id} R chapter 1`);
  }
});

test("stories-extra: SS/S/R chapters rebuild the owner's source files byte for byte (when present)", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const { parseSS, parseS, parseR, rebuildSS, rebuildS, rebuildR } = await import("../../scripts/import-ss-s-chapters.mjs");
  const dir = new URL("../../../stories/extra/", import.meta.url);
  const roster = (r: Rarity) => CHARACTERS.filter((c) => c.rarity === r).map((c) => ({ id: c.id, name: c.name }));
  const ssPath = new URL("SS_bond_ch12.txt", dir);
  if (existsSync(ssPath)) {
    const file = readFileSync(ssPath, "utf8");
    parseSS(file, roster("SS"));
    const data = Object.fromEntries(roster("SS").map((c) => [c.id, [1, 2].map((i) => STORIES_EXTRA[c.id]!.chapters[i]!)]));
    assert.equal(rebuildSS(data, roster("SS"), file.endsWith("\n")), file);
  }
  const sPath = new URL("S_bond_ch1.txt", dir);
  if (existsSync(sPath)) {
    const file = readFileSync(sPath, "utf8");
    parseS(file, roster("S"));
    const data = Object.fromEntries(roster("S").map((c) => [c.id, STORIES_EXTRA[c.id]!.chapters[1]!]));
    assert.equal(rebuildS(data, roster("S"), file.endsWith("\n")), file);
  }
  const rPath = new URL("R_bond_ch1.txt", dir);
  if (existsSync(rPath)) {
    const file = readFileSync(rPath, "utf8");
    parseR(file, roster("R"));
    const data = Object.fromEntries(roster("R").map((c) => [c.id, STORIES_EXTRA[c.id]!.chapters[1]!]));
    assert.equal(rebuildR(data, roster("R"), file.endsWith("\n")), file);
  }
});

test("stories-extra: 情話・其二 (love) is filled for all 65 and matches R_love2.txt / SSR_SS_S_love2.txt byte for byte", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const { parseLove, rebuildLove } = await import("../../scripts/import-ss-s-chapters.mjs");
  assert.equal(CHARACTERS.length, 65);
  for (const c of CHARACTERS) assert.ok(STORIES_EXTRA[c.id]?.love.trim(), `${c.id} love`);
  const groups: Array<[string, Rarity[], number]> = [
    ["R_love2.txt", ["R"], 30],
    ["SSR_SS_S_love2.txt", ["SSR", "SS", "S"], 35],
  ];
  for (const [name, rarities, n] of groups) {
    const group = CHARACTERS.filter((c) => rarities.includes(c.rarity));
    assert.equal(group.length, n);
    const path = new URL(`../../../stories/extra/${name}`, import.meta.url);
    if (!existsSync(path)) continue;
    const file = readFileSync(path, "utf8");
    const roster = group.map((c) => ({ id: c.id, name: c.name }));
    const love = Object.fromEntries(group.map((c) => [c.id, STORIES_EXTRA[c.id]!.love]));
    assert.deepEqual(love, parseLove(file, roster), name);
    const order = file.replace(/\n$/, "").split("\n").map((l: string) => l.slice(0, l.indexOf("：")));
    assert.equal(rebuildLove(love, roster, file.endsWith("\n"), order), file, name);
  }
});
