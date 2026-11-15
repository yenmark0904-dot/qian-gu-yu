import { test } from "node:test";
import assert from "node:assert/strict";
import { CHARACTERS } from "./data.ts";
import { dupOutcome } from "./bond.ts";
import { payTierUp, type PullCard } from "./logic.ts";
import {
  BEATS,
  REVEAL_RARITY,
  SSR_SUMMON,
  demoAllowed,
  demoCard,
  demoCards,
  highestRarity,
  readLastSummon,
  recordLastSummon,
  markSummonWatched,
  revealLine,
  revealMode,
  settlementOf,
  summarise,
} from "./summon-reveal.ts";

const byId = (id: string) => CHARACTERS.find((c) => c.id === id)!;

test("five SSR summon lines are keyed by real SSR ids and kept verbatim", () => {
  const expected: Record<string, string> = {
    qin: "既已來到朕面前，便再走近些。",
    zhouyu: "方才那一曲，你可聽見了？",
    lanling: "別怕。到我身後來。",
    libai: "來得正好，這輪月亮，分你一半。",
    liuche: "你既來了，便陪朕看看這萬里山河。",
  };
  const ssr = CHARACTERS.filter((c) => c.rarity === "SSR").map((c) => c.id).sort();
  assert.deepEqual(Object.keys(SSR_SUMMON).sort(), ssr);
  for (const [id, line] of Object.entries(expected)) {
    assert.equal(byId(id).rarity, "SSR");
    assert.equal(SSR_SUMMON[id]!.line, line);
    // new summon lines have no VO: never voiced
    assert.deepEqual(revealLine(byId(id)), { text: line, voiced: false });
  }
});

test("SS reveal reuses its own 情話・其一 (matching VO); R/S have no line", () => {
  for (const c of CHARACTERS) {
    const l = revealLine(c);
    if (c.rarity === "SS") assert.deepEqual(l, { text: c.line.trim(), voiced: true });
    if (c.rarity === "R" || c.rarity === "S") assert.equal(l, null);
  }
});

test("single-pull timings sit inside the owner's windows", () => {
  const within = (v: number, lo: number, hi: number) => assert.ok(v >= lo && v <= hi, `${v} not in ${lo}-${hi}`);
  within(BEATS.R.revealAt, 1500, 2000);
  within(BEATS.S.revealAt, 2500, 3000);
  within(BEATS.SS.revealAt, 4000, 5000);
  within(BEATS.SSR.revealAt, 6000, 8000);
  within(REVEAL_RARITY.R.targetMs, 1500, 2000);
  within(REVEAL_RARITY.S.targetMs, 2500, 3000);
  within(REVEAL_RARITY.SS.targetMs, 4000, 5000);
  within(REVEAL_RARITY.SSR.targetMs, 6000, 8000);
  // caption lands within the window too
  within(BEATS.R.captionAt, 1500, 2000);
  within(BEATS.S.captionAt, 2500, 3000);
  within(BEATS.SS.captionAt, 4000, 5000);
  within(BEATS.SSR.captionAt, 6000, 8000);
});

test("十連 reveal modes: SSR full, first SS full, dupe SS fast, R/S fast; single always full", () => {
  const ss = CHARACTERS.find((c) => c.rarity === "SS")!;
  const s = CHARACTERS.find((c) => c.rarity === "S")!;
  assert.equal(revealMode({ character: byId("qin"), isNew: false }, true), "full");
  assert.equal(revealMode({ character: ss, isNew: true }, true), "full");
  assert.equal(revealMode({ character: ss, isNew: false }, true), "fast");
  assert.equal(revealMode({ character: s, isNew: true }, true), "fast");
  assert.equal(revealMode({ character: s, isNew: true }, false), "full");
});

test("demo cards follow the exact store.pull rules (dupOutcome + payTierUp)", () => {
  for (const c of [byId("qin"), CHARACTERS.find((x) => x.rarity === "R")!]) {
    for (let prev = 0; prev <= 40; prev++) {
      const bond = dupOutcome(c.rarity, prev);
      const tier = payTierUp(prev > 0 ? { [c.id]: bond.prevLevel } : {}, c.id, bond.prevLevel, bond.level);
      const card = demoCard(c, prev);
      assert.equal(card.marks, bond.marks, `marks @${prev}`);
      assert.equal(card.bondUp, bond.levelUp, `bondUp @${prev}`);
      assert.equal(card.bond, bond.level);
      assert.equal(!!card.overflow, bond.overflow, `overflow @${prev}`);
      assert.equal(card.tierInk, tier.ink, `tierInk @${prev}`);
    }
  }
});

test("settlement view copies settled numbers; summary sums match", () => {
  const demo = demoCards(new URLSearchParams("summonDemo=ten&top=SSR"))!;
  assert.equal(demo.cards.length, 10);
  const sum = summarise(demo.cards);
  assert.equal(sum.marks, demo.cards.reduce((a, c) => a + (c.marks ?? 0), 0));
  assert.equal(sum.tierInk, demo.cards.reduce((a, c) => a + (c.tierInk ?? 0), 0));
  assert.equal(sum.rankUps.length, demo.cards.filter((c) => c.bondUp).length);
  assert.equal(sum.firsts, demo.cards.filter((c) => c.isNew).length);
  assert.equal(highestRarity(demo.cards), "SSR");
  assert.equal(demo.cards.filter((c) => c.character.rarity === "SSR").length, 2);
  const kinds = demo.cards.map((c) => settlementOf(c).kind);
  assert.ok(kinds.includes("new") && kinds.includes("dupe") && kinds.includes("rankup") && kinds.includes("max"));
});

test("same character twice in one 十連: first 初逢, then 重逢 (sequential)", () => {
  const r = CHARACTERS.find((c) => c.rarity === "R")!;
  const owned: Record<string, number> = {};
  const cards: PullCard[] = [r, r].map((character) => {
    const prev = owned[character.id] ?? 0;
    owned[character.id] = prev + 1;
    const b = dupOutcome(character.rarity, prev);
    return { character, isNew: prev === 0, count: prev + 1, refund: 0, bond: b.level, bondUp: b.levelUp, marks: b.marks, overflow: b.overflow };
  });
  assert.equal(settlementOf(cards[0]!).kind, "new");
  assert.equal(settlementOf(cards[1]!).kind, "dupe");
  assert.equal(settlementOf(cards[1]!).marks, 1);
  assert.equal(settlementOf(cards[1]!).toNext, 4);
});

test("rank-up settlement shows from/to names and unlocks; max shows full conversion", () => {
  const up = settlementOf(demoCard(byId("qin"), 10)); // 11th copy → tier 2
  assert.equal(up.kind, "rankup");
  assert.equal(up.prevName, "再逢");
  assert.equal(up.levelName, "相知");
  assert.ok(up.unlocks.some((u) => u.label.includes("金絲")));
  const max = settlementOf(demoCard(byId("qin"), 31));
  assert.equal(max.kind, "max");
  assert.equal(max.marks, 200);
});

test("last-summon record survives a reload and is presentation-only", () => {
  const mem = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    },
  };
  const cards = demoCards(new URLSearchParams("summonDemo=ten"))!.cards;
  assert.ok(recordLastSummon(cards, 10, 1));
  const back = readLastSummon()!;
  assert.equal(back.watched, false);
  assert.equal(back.n, 10);
  assert.deepEqual(back.cards.map((c) => c.character.id), cards.map((c) => c.character.id));
  assert.deepEqual(back.cards.map((c) => c.marks), cards.map((c) => c.marks));
  markSummonWatched();
  assert.equal(readLastSummon()!.watched, true);
  delete (globalThis as unknown as { window?: unknown }).window;
});

test("demo mode is ignored on the live host", () => {
  assert.equal(demoAllowed("qian-gu-yu.vercel.app"), false);
  assert.equal(demoAllowed("qian-gu-yu-abc123-yen-709a.vercel.app"), true);
  assert.equal(demoCards(new URLSearchParams("")), null);
});


test("regular portraits retain backgrounds; story cutouts are restricted to four approved characters", async () => {
  const { portraitSrc, storyPortraitSrc } = await import("./summon-reveal.ts");
  for (const id of ["libai", "liuche", "zhouyu", "lanling"]) {
    assert.equal(portraitSrc(id), `/portraits/${id}.jpg?v=17`);
    assert.equal(storyPortraitSrc(id), `/sprites/${id}.png?v=20`);
  }
  assert.equal(portraitSrc("qin"), "/portraits/qin.jpg?v=17");
  assert.equal(storyPortraitSrc("qin"), "/portraits/qin.jpg?v=17");
});
