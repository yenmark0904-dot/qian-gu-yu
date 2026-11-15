import test from "node:test";
import assert from "node:assert/strict";
import {
  ARTIFACTS,
  ARTIFACT_BY_ID,
  addInstance,
  cleanArtifacts,
  emptyArtifacts,
} from "./artifacts.ts";
import {
  ARTIFACT_SUMMON as C,
  cleanSummon,
  rollArtifactRarity,
  setArtifactWish,
  summonArtifacts,
} from "./artifact-summon.ts";
import type { ArtifactPullRecord } from "./artifact-summon-state.ts";
import { emptyArtifactSummon } from "./artifact-summon-state.ts";
import { COST_ONE, COST_TEN, PITY } from "./logic.ts";
const initial = () => ({
  records: [] as ArtifactPullRecord[],
  artifacts: emptyArtifacts(),
  artifactSummon: emptyArtifactSummon(),
  ink: 1_000_000,
  m3: { "5": { stars: 1, best: 100 } },
});
const must = (x: ReturnType<typeof summonArtifacts>) => {
  if (!x.ok) throw Error(x.error);
  assert.equal(x.ok, true);
  return x;
};
const step = (s: ReturnType<typeof initial>, count: 1 | 10 = 1, rng = () => 0.99) => {
  const r = must(summonArtifacts(s, count, rng, 123456));
  return { ...s, ...r };
};
test("centralized official economy and original character summon unchanged", () => {
  assert.equal(C.one, 150);
  assert.equal(C.ten, 1350);
  assert.deepEqual(C.rates, { SSR: 0.01, SS: 0.02, S: 0.485, R: 0.485 });
  assert.equal(C.ssPity, 10);
  assert.equal(C.ssrPity, 60);
  assert.equal(C.wishSSR, 120);
  assert.equal(C.wishSS, 40);
  assert.equal(COST_ONE, 160);
  assert.equal(COST_TEN, 1440);
  assert.equal(PITY, 50);
});
test("base rate boundaries and exhaustive stratified simulation", () => {
  const bins: Record<string, number> = { SSR: 0, SS: 0, S: 0, R: 0 };
  for (let i = 0; i < 100000; i++) bins[rollArtifactRarity(() => (i + 0.5) / 100000)]!++;
  assert.deepEqual(bins, { SSR: 1000, SS: 2000, S: 48500, R: 48500 });
});
test("single / ten-pull settle independent equipment pool, costs and records once", () => {
  const s = step(initial());
  assert.equal(s.ink, 1_000_000 - C.one);
  assert.equal(s.records.length, 1);
  const t = step(s, 10);
  assert.equal(t.ink, s.ink - C.ten);
  assert.equal(t.records.length, 10);
  assert.equal(t.artifactSummon.total, 11);
  assert.equal(t.artifactSummon.spentInk, C.one + C.ten);
  for (const r of t.artifactSummon.history) assert.ok(ARTIFACT_BY_ID[r.eid]);
  assert.equal(new Set(t.artifactSummon.history.map((r) => r.uid)).size, 11);
});
test("locked and broke reject without mutation", () => {
  const s = initial(),
    before = JSON.stringify(s);
  assert.deepEqual(summonArtifacts({ ...s, m3: {} }, 1), { ok: false, error: "locked" });
  assert.deepEqual(summonArtifacts({ ...s, ink: 149 }, 1), { ok: false, error: "broke" });
  assert.equal(JSON.stringify(s), before);
});
test("ten SS+ and sixty SSR hard pity, including ten-pull boundaries", () => {
  let s = initial();
  for (let i = 1; i <= 120; i++) {
    const r = step(s);
    const card = r.records[0]!;
    if (i % C.ssPity === 0) assert.ok(card.rarity === "SS" || card.rarity === "SSR");
    if (i % C.ssrPity === 0) assert.equal(card.rarity, "SSR");
    s = r;
  }
});
test("natural SSR on SS pity is not downgraded", () => {
  const s = initial();
  s.artifactSummon.sinceSS = 9;
  assert.equal(step(s, 1, () => 0).records[0]!.rarity, "SSR");
});
test("targeted SSR within120 and SS within40; owner IDs and names stay catalog-only", () => {
  for (const [rarity, deadline] of [
    ["SSR", C.wishSSR],
    ["SS", C.wishSS],
  ] as const) {
    let s = initial();
    const target = ARTIFACTS.find((a) => a.rarity === rarity)!;
    s.artifactSummon = setArtifactWish(s.artifactSummon, target.id);
    for (let i = 1; i <= deadline; i++) s = step(s);
    assert.ok(s.artifactSummon.history.some((r) => r.eid === target.id));
    assert.equal(s.artifactSummon.history.at(-1)!.eid, target.id);
    assert.equal(rarity === "SSR" ? s.artifactSummon.wishSSR : s.artifactSummon.wishSS, 0);
  }
});
test("simultaneous SS wish and SSR guarantee scheduled early", () => {
  let s = initial();
  const target = ARTIFACTS.find((a) => a.rarity === "SS")!;
  s.artifactSummon = { ...s.artifactSummon, target: target.id, wishSS: 38, sinceSSR: 58 };
  s = step(s);
  assert.equal(s.records[0]!.eid, target.id);
  assert.equal(s.records[0]!.reason, "wish");
  s = step(s);
  assert.equal(s.records[0]!.rarity, "SSR");
});
test("switching preserves all pity and separate target progress", () => {
  const ss = ARTIFACTS.find((a) => a.rarity === "SS")!,
    ssr = ARTIFACTS.find((a) => a.rarity === "SSR")!;
  const s = { ...emptyArtifactSummon(), sinceSS: 5, sinceSSR: 21, wishSS: 17, wishSSR: 44 };
  const a = setArtifactWish(s, ss.id),
    b = setArtifactWish(a, ssr.id),
    c = setArtifactWish(b, null);
  assert.deepEqual(c, s);
  assert.equal(setArtifactWish(s, "not-real"), s);
  let input = initial();
  input.artifactSummon = a;
  input = step(input);
  assert.equal(input.artifactSummon.wishSSR, 44);
  assert.equal(input.artifactSummon.wishSS, 18);
});
test("latest duplicate rule: new duplicate converts to essence; locked/equipped original untouched", () => {
  let s = initial();
  const eid = ARTIFACTS.filter((a) => a.rarity === "R").at(-1)!.id;
  const added = addInstance(s.artifacts, eid);
  s.artifacts = added.save;
  s.artifacts.instances[0] = { ...s.artifacts.instances[0]!, locked: true, equippedBy: "zhouyu" };
  const before = JSON.stringify(s.artifacts);
  s = step(s);
  assert.equal(s.records[0]!.isNew, false);
  assert.equal(s.records[0]!.essence, C.essencePerDuplicate);
  assert.equal(s.artifactSummon.essence, C.essencePerDuplicate);
  assert.equal(JSON.stringify(s.artifacts), before);
});
test("old independent duplicates, including beyond previous cap, survive migration", () => {
  let a = emptyArtifacts();
  for (let i = 0; i < 305; i++) a = addInstance(a, ARTIFACTS[0]!.id).save;
  assert.equal(cleanArtifacts(a, {}).instances.length, 305);
  assert.deepEqual(cleanSummon(undefined), emptyArtifactSummon());
});
test("serialization / refresh does not reroll, regrant or recharge", () => {
  const s = step(initial(), 10);
  const json = JSON.stringify(s);
  for (let i = 0; i < 5; i++) {
    const r = JSON.parse(json);
    assert.deepEqual(cleanSummon(r.artifactSummon), s.artifactSummon);
    assert.deepEqual(cleanArtifacts(r.artifacts, {}), s.artifacts);
    assert.equal(r.ink, s.ink);
  }
});

test("switching at colliding hard deadlines never delays either promise", () => {
  let s = initial();
  const target = ARTIFACTS.find((a) => a.rarity === "SS")!;
  s.artifactSummon = {
    ...s.artifactSummon,
    target: target.id,
    wishSS: C.wishSS - 1,
    sinceSSR: C.ssrPity - 1,
  };
  s = step(s);
  assert.equal(s.records[0]!.rarity, "SSR");
  assert.equal(s.records[1]!.eid, target.id);
  assert.equal(s.records[1]!.bonus, true);
  assert.equal(s.ink, 1_000_000 - C.one);
  assert.equal(s.artifactSummon.total, 1);
  assert.equal(s.artifactSummon.wishSS, 0);
  assert.equal(s.artifactSummon.sinceSSR, 0);
});
