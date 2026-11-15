import test from "node:test";
import assert from "node:assert/strict";
import { ARTIFACT_BY_ID, ARTIFACT_MAX_LEVEL, UNLOCK_AT, artifactUnlocks, emptyArtifacts, emptyMaterials, exclusivePct, type ArtifactSave } from "./artifacts.ts";
import { AWAKEN_FROM, REFINE_COSTS, refineArtifact, refineCheck, refineCost } from "./artifact-refine.ts";
import { RAID_ENCOUNTERS, RAID_ENCOUNTER_BY_ID, applyDrops, cleanRaid, emptyRaid, mergeRaid, recordRaidClear } from "./raid.ts";
import { RESONANCE, artifactCast, artifactMove, resonanceDamage, slotsFor, startArtifactRun, type WaveInfo } from "./artifact-engine.ts";
import { playerMaxHp } from "./combat.ts";

const cleared = (...ids: number[]) => Object.fromEntries(ids.map((i) => [String(i), { stars: 1, best: 1 }]));
const OPEN = { awaken: true };
const CLOSED = { awaken: false };
const rich = (): ArtifactSave => ({
  ...emptyArtifacts(),
  instances: [
    { uid: "a1", eid: "liuhe-xuanxi", level: 1, equippedBy: "qin", locked: true },
    { uid: "a2", eid: "suxin-yuzhui", level: 1, equippedBy: null, locked: false },
  ],
  materials: { jingmosha: 9999, zhenejing: 9999, tianmingcanyin: 9999, suyuanlu: 7 },
  serial: 3,
});

test("refine cost table: Lv.1–9 each defined, only 鎮厄司 materials, monotone 進階/覺醒 steps", () => {
  for (let lv = 1; lv < ARTIFACT_MAX_LEVEL; lv++) {
    const c = REFINE_COSTS[lv]!;
    assert.ok(c, `cost for Lv.${lv}`);
    for (const k of Object.keys(c)) assert.ok(["jingmosha", "zhenejing", "tianmingcanyin"].includes(k), k);
  }
  assert.equal(refineCost(ARTIFACT_MAX_LEVEL), null);
  assert.deepEqual(REFINE_COSTS[1], { jingmosha: 8 });
  assert.deepEqual(REFINE_COSTS[4], { jingmosha: 24, zhenejing: 2 });
  assert.deepEqual(REFINE_COSTS[9], { jingmosha: 40, zhenejing: 12, tianmingcanyin: 3 });
  assert.equal(AWAKEN_FROM, 9);
  // Lv.1–4 never need elite materials; 天命殘印 only for 覺醒.
  for (const lv of [1, 2, 3]) assert.equal(REFINE_COSTS[lv]!.zhenejing, undefined);
  for (let lv = 1; lv < 9; lv++) assert.equal(REFINE_COSTS[lv]!.tianmingcanyin, undefined);
});

test("refine deducts exactly the step cost, level +1, keeps equip/lock, touches nothing else", () => {
  const s = rich();
  const r = refineArtifact(s, "a1", OPEN);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.from, 1);
  assert.equal(r.to, 2);
  const a1 = r.save.instances.find((i) => i.uid === "a1")!;
  assert.deepEqual({ ...a1 }, { uid: "a1", eid: "liuhe-xuanxi", level: 2, equippedBy: "qin", locked: true });
  assert.equal(r.save.instances.length, 2);
  assert.deepEqual(r.save.instances.find((i) => i.uid === "a2"), s.instances[1]);
  assert.equal(r.save.materials.jingmosha, 9999 - 8);
  assert.equal(r.save.materials.zhenejing, 9999);
  assert.equal(r.save.materials.suyuanlu, 7);
  assert.equal(r.save.serial, s.serial);
  assert.deepEqual(r.save.grants, s.grants);
  // Pure: the input save is untouched.
  assert.equal(s.instances[0]!.level, 1);
});

test("insufficient materials: refused, nothing charged, missing amounts reported", () => {
  const s: ArtifactSave = { ...rich(), materials: { ...emptyMaterials(), jingmosha: 7 } };
  const r = refineArtifact(s, "a1", OPEN);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "materials");
  assert.deepEqual(r.missing, { jingmosha: 1 });
  // Lv.4→5 needs 鎮厄晶 too.
  const s4: ArtifactSave = { ...s, instances: [{ ...s.instances[0]!, level: 4 }], materials: { ...emptyMaterials(), jingmosha: 999 } };
  const c = refineCheck(s4, "a1", OPEN);
  assert.equal(c.ok, false);
  if (!c.ok) assert.deepEqual(c.missing, { zhenejing: 2 });
  assert.equal(refineArtifact(s, "nope", OPEN).ok, false);
});

test("Lv.10 cap and 覺醒 needs 第 50 關 (artifactUnlocks.awaken)", () => {
  let s = rich();
  for (let lv = 1; lv < AWAKEN_FROM; lv++) {
    const r = refineArtifact(s, "a1", CLOSED);
    assert.ok(r.ok, `Lv.${lv} → ${lv + 1} without 第 50 關`);
    if (r.ok) s = r.save;
  }
  assert.equal(s.instances[0]!.level, 9);
  const blocked = refineArtifact(s, "a1", CLOSED);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "awaken-locked");
  assert.equal(s.materials.tianmingcanyin, 9999); // nothing spent on the blocked try
  const aw = refineArtifact(s, "a1", OPEN);
  assert.ok(aw.ok);
  if (!aw.ok) return;
  assert.equal(aw.to, 10);
  assert.equal(aw.awakened, true);
  assert.equal(aw.save.materials.tianmingcanyin, 9999 - 3);
  const max = refineArtifact(aw.save, "a1", OPEN);
  assert.equal(max.ok, false);
  if (!max.ok) assert.equal(max.reason, "max-level");
  // 覺醒 switches the exclusive bonus to awakenPct (already in artifacts.ts).
  const ex = ARTIFACT_BY_ID["liuhe-xuanxi"]!.exclusive!;
  assert.equal(exclusivePct(ex, 9), ex.pct);
  assert.equal(exclusivePct(ex, 10), ex.awakenPct);
  // Gate comes from 第 50 關 stars.
  assert.equal(artifactUnlocks(cleared(49)).awaken, false);
  assert.equal(artifactUnlocks(cleared(UNLOCK_AT.awaken)).awaken, true);
});

test("total materials to take one 命器 Lv.1 → 10", () => {
  const sum = { jingmosha: 0, zhenejing: 0, tianmingcanyin: 0 };
  for (let lv = 1; lv < 10; lv++) for (const [k, n] of Object.entries(REFINE_COSTS[lv]!)) sum[k as keyof typeof sum] += n;
  assert.deepEqual(sum, { jingmosha: 212, zhenejing: 42, tianmingcanyin: 3 });
});

test("鎮厄司 gates: 普通 10 · 精英 20 · 首領 40 (old saves auto-unlock from stars)", () => {
  assert.deepEqual(RAID_ENCOUNTERS.map((e) => [e.tier, e.unlock, UNLOCK_AT[e.unlock]]), [
    ["normal", "raid", 10],
    ["elite", "elite", 20],
    ["sovereign", "sovereign", 40],
  ]);
  const u9 = artifactUnlocks(cleared(1, 2, 9));
  assert.equal(u9.raid, false);
  const u = artifactUnlocks(cleared(10, 20));
  assert.deepEqual([u.vault, u.raid, u.elite, u.resonance, u.sovereign, u.awaken], [false, true, true, false, false, false]);
  assert.deepEqual(UNLOCK_AT, { vault: 5, raid: 10, elite: 20, resonance: 30, sovereign: 40, awaken: 50 });
});

test("raid drops: materials only (never 墨玉), repeatable, first-clear bonus exactly once", () => {
  for (const e of RAID_ENCOUNTERS) {
    for (const d of [e.drops, e.firstDrops]) for (const k of Object.keys(d)) assert.ok(["jingmosha", "zhenejing", "tianmingcanyin"].includes(k), `${e.id}:${k}`);
    assert.ok(!("ink" in e.drops));
  }
  const elite = RAID_ENCOUNTER_BY_ID["elite-ink-colossus"]!;
  const a = recordRaidClear(emptyRaid(), elite);
  assert.equal(a.first, true);
  assert.equal(a.ink, 0);
  assert.deepEqual(a.drops, { zhenejing: 9, jingmosha: 8 });
  const b = recordRaidClear(a.raid, elite);
  assert.equal(b.first, false);
  assert.equal(b.ink, 0);
  assert.deepEqual(b.drops, elite.drops);
  assert.equal(b.raid.records[elite.id]!.clears, 2);
  // Survives clean + merge with an older snapshot: first bonus never repeats.
  const cleanedB = cleanRaid(JSON.parse(JSON.stringify(b.raid)), {});
  assert.equal(recordRaidClear(cleanedB, elite).first, false);
  assert.equal(recordRaidClear(mergeRaid(b.raid, emptyRaid()), elite).first, false);
  assert.equal(recordRaidClear(mergeRaid(emptyRaid(), b.raid), elite).first, false);
  // Only the legacy 噬墨之影 first win carries its old one-time 300 墨玉; repeats never pay 墨玉.
  const n1 = recordRaidClear(emptyRaid(), RAID_ENCOUNTER_BY_ID["ink-shadow"]!);
  assert.equal(n1.ink, 300);
  assert.equal(recordRaidClear(n1.raid, RAID_ENCOUNTER_BY_ID["ink-shadow"]!).ink, 0);
  // An old save whose 噬墨之影 first 墨玉 was already paid gets the material bonus once, no 墨玉.
  const old = cleanRaid({ team: [], records: { "ink-shadow": { cleared: true, rewardClaimed: true, bestMoves: 5 } } }, {});
  const o = recordRaidClear(old, RAID_ENCOUNTER_BY_ID["ink-shadow"]!);
  assert.equal(o.ink, 0);
  assert.equal(o.first, true);
  assert.equal(o.raid.records["ink-shadow"]!.clears, 2);
  // applyDrops adds to the material map and caps.
  const m = applyDrops({ ...emptyMaterials(), jingmosha: 999_995 }, { jingmosha: 20, zhenejing: 3 });
  assert.equal(m.jingmosha, 999_999);
  assert.equal(m.zhenejing, 3);
});

test("raid encounters escalate (HP / shield / spread) and use the shared HP combat numbers", () => {
  const [n, e, s] = RAID_ENCOUNTERS;
  assert.ok(n!.enemy.hp < e!.enemy.hp && e!.enemy.hp < s!.enemy.hp);
  assert.ok(n!.enemy.shield < e!.enemy.shield && e!.enemy.shield < s!.enemy.shield);
  assert.ok((n!.enemy.spread ?? 0) < (e!.enemy.spread ?? 0) && (e!.enemy.spread ?? 0) < (s!.enemy.spread ?? 0));
  for (const x of RAID_ENCOUNTERS) assert.ok(playerMaxHp(x.def.moves) > 0);
  assert.equal(n!.enemy.name, "噬墨之影");
});

const W = (o: Partial<WaveInfo>): WaveInfo => ({ index: 0, removed: 3, lines: 0, rowLines: 0, bombs: 0, colors: 0, sealHits: 0, sealsBroken: 0, score: 1000, ...o });
const stage = { mode: "main", hasSeal: true, hasMilestone: true, hasGoal: true };
const wearing = (eid: string, who: string, level = 1): ArtifactSave => ({
  ...emptyArtifacts(),
  instances: [{ uid: "a1", eid, level, equippedBy: who, locked: false }],
  serial: 2,
});

test("命器共鳴: locked before 第 30 關; fires on the wearer's own cast; capped per battle with a cooldown", () => {
  const s = wearing("chixia-ren", "nalan");
  const off = artifactCast(startArtifactRun(slotsFor(s, ["nalan"]), stage), "nalan", "nalan");
  assert.equal(off.resonance.length, 0);
  let run = startArtifactRun(slotsFor(s, ["nalan"]), stage, true);
  // someone else's cast never resonates with nalan's 命器
  assert.equal(artifactCast(run, "qin", "qin").resonance.length, 0);
  const first = artifactCast(run, "nalan", "nalan");
  assert.equal(first.resonance.length, 1);
  assert.equal(first.resonance[0]!.exclusive, false);
  assert.equal(first.resonance[0]!.skillPct, RESONANCE.skillPct[0]);
  run = first.run;
  // cooldown: an immediate re-cast does not resonate
  assert.equal(artifactCast(run, "nalan", "nalan").resonance.length, 0);
  for (let i = 0; i < RESONANCE.cooldownMoves; i++) run = artifactMove(run, [W({})]).run;
  const second = artifactCast(run, "nalan", "nalan");
  assert.equal(second.resonance.length, 1);
  run = second.run;
  for (let i = 0; i < 10; i++) run = artifactMove(run, [W({})]).run;
  // per-battle cap
  let total = 2;
  for (let i = 0; i < 20; i++) {
    const c = artifactCast(run, "nalan", "nalan");
    total += c.resonance.length;
    run = c.run;
    for (let k = 0; k < 5; k++) run = artifactMove(run, [W({})]).run;
  }
  assert.equal(total, RESONANCE.perBattle);
});

test("命器共鳴 restores ONE general trigger, adds no energy; 命定之人 uses the 專屬 % (覺醒 at Lv.10)", () => {
  // general passive: 赤霞刃 前 3 次刻玉 → after 3 uses, resonance gives exactly one more.
  const s = wearing("chixia-ren", "nalan");
  let run = startArtifactRun(slotsFor(s, ["nalan"]), stage, true);
  for (let i = 0; i < 3; i++) run = artifactMove(run, [W({ lines: 1 })]).run;
  assert.equal(artifactMove(run, [W({ lines: 1 })]).bonus, 0);
  const c = artifactCast(run, "nalan", "nalan");
  assert.equal(c.resonance[0]!.refilled, true);
  const after = artifactMove(c.run, [W({ lines: 1 })]);
  assert.ok(after.bonus > 0);
  assert.equal(artifactMove(after.run, [W({ lines: 1 })]).bonus, 0);
  assert.deepEqual(after.energy, {});
  // 命定之人: 嬴政 + 六合玄璽 → 專屬 % on the skill hit; Lv.10 → awakenPct.
  const qin = artifactCast(startArtifactRun(slotsFor(wearing("liuhe-xuanxi", "qin"), ["qin"]), stage, true), "qin", "qin");
  assert.equal(qin.resonance[0]!.exclusive, true);
  assert.equal(qin.resonance[0]!.skillPct, 0.25);
  assert.deepEqual(qin.armed, ["萬象歸秦"]); // original exclusive arming unchanged
  const qin10 = artifactCast(startArtifactRun(slotsFor(wearing("liuhe-xuanxi", "qin", 10), ["qin"]), stage, true), "qin", "qin");
  assert.equal(qin10.resonance[0]!.skillPct, 0.35);
  // Non-owner wearing an exclusive 命器 gets the generic resonance only.
  const li = artifactCast(startArtifactRun(slotsFor(wearing("liuhe-xuanxi", "libai"), ["libai"]), stage, true), "libai", "libai");
  assert.equal(li.resonance[0]!.exclusive, false);
  // Damage is bounded by the cast's own hit.
  assert.equal(resonanceDamage(100, [{ ...qin10.resonance[0]!, skillPct: 9 }]), Math.round(100 * RESONANCE.maxSkillPct));
  assert.equal(resonanceDamage(0, qin.resonance), 0);
});
