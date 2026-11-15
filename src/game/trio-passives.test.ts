import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterCast, finishHand, freshTrioPassives, grantMap, liEvaluate, type Grant, type TrioState } from "./trio-passives.ts";
import { ALL_SKILLS, skillOf, skillFx, rewardBonus } from "./skills.ts";
import { BY_ID, CHARACTERS } from "./data.ts";
import { CHARGE_BASE, activateSkill, addEnergy, chargeCost, freshCharge, isFull, spend, waveEnergy, type Charge } from "./assist.ts";
import { ARTIFACTS, ARTIFACT_BY_ID } from "./artifacts.ts";
import { allMoves, freshBoard, makeRng, trySwap, type Board } from "./match3.ts";
import { COMBAT, enemyForFloor, enemyForLevel, enemyTurn, healHp, hitWithWaves, jadeHeal, playerMaxHp, skillHit, startEnemy, type EnemyDef } from "./combat.ts";
import { LEVELS } from "./levels.ts";
import { floorDef } from "./shengong.ts";
import { RAID_ENCOUNTERS } from "./raid.ts";

const TRIO = ["huo", "libai", "liuche"];
const sha = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
/** Baseline fingerprints taken from the official tree (src 795f2599…) before t516. */
const BASE = {
  others62: "e769c914d45d752d626400a6c60020b313d2c22dded6844b4ff0d996f2f5863d",
  allSteps: "ed9ee26b248836d467da69f1a5ec0ce7bdb9a79e767f9dd5c89ab53b3a404dbb",
  artifactsNoText: "36bae3a2a7066fc45194106ac67cc7d67105dd277859f0ba0a87670c64a0afa1",
  combat: "ea6a21b83f9bd5be364a2a6dd546dc8239a3586e78732d6741a46ee9da41123c",
};
const strip = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(strip) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== "text").map(([k, v]) => [k, strip(v)])) : x;

/** Mirrors Match3 `addEnergy` (non-share): skip at cap, else min(cost, e + n). */
type Team = Record<string, Charge>;
const team = (ids: string[], copies = 1): Team => Object.fromEntries(ids.map((id) => [id, freshCharge(chargeCost(BY_ID[id]!.rarity, copies))]));
const apply = (t: Team, g: Grant[]) => {
  const m = grantMap(g);
  for (const id of Object.keys(t)) if (m[id]) t[id] = addEnergy(t[id]!, m[id]!);
};

/* ---------- definitions preserved ---------- */

test("IDs, rarities, costs SS75 / SSR75 and 緣分 discounts are the official ones", () => {
  assert.deepEqual(TRIO.map((id) => [BY_ID[id]!.name, BY_ID[id]!.rarity]), [["霍去病", "SS"], ["李白", "SSR"], ["劉徹", "SSR"]]);
  assert.deepEqual(CHARGE_BASE, { R: 55, S: 65, SS: 75, SSR: 75 });
  assert.deepEqual([chargeCost("SS", 1), chargeCost("SSR", 1)], [75, 75]);
});

test("three remakes: new names, same ids and three-tier effects; other 62 skills byte-identical", () => {
  assert.deepEqual(TRIO.map((id) => [skillOf(id)!.id, skillOf(id)!.name]), [["huo", "疾鋒破陣"], ["libai", "醉月吟"], ["liuche", "漢闕天威"]]);
  assert.deepEqual(skillOf("huo")!.steps[0], { bomb: 1, line: 1 });
  assert.deepEqual(skillOf("libai")!.steps[0], { heal: 210, mult: 1.05 });
  assert.deepEqual(skillOf("liuche")!.steps[0], { reward: 0.25, heal: 140 });
  const others = CHARACTERS.map((c) => c.id).filter((id) => !TRIO.includes(id)).sort();
  assert.equal(others.length, 62);
  assert.equal(sha(others.map((id) => [id, ALL_SKILLS[id]])), BASE.others62);
  assert.equal(sha(CHARACTERS.map((c) => [c.id, ALL_SKILLS[c.id]!.steps])), BASE.allSteps);
  assert.equal(rewardBonus(skillFx("liuche", 1), 100, 0, 3), 25); // reward settlement untouched
});

test("artifacts: every numeric/rule field unchanged (only 3 skill-name mentions in text); 封狼銀槍 still SCORE", () => {
  assert.equal(sha(strip(ARTIFACTS)), BASE.artifactsNoText);
  const f = ARTIFACT_BY_ID["fenglang-yinqiang"]!;
  assert.equal(f.exclusive!.skillId, "huo");
  assert.deepEqual(f.exclusive!.cond, { on: "lineOrBomb" });
  assert.match(f.exclusive!.text, /疾鋒破陣/);
  assert.equal(sha(COMBAT), BASE.combat);
});

test("霍 skill still only gifts 1 金鑲玉 + 1 刻玉 (no strike, no heal, no extra damage)", () => {
  const a = activateSkill(freshBoard(8, 7, undefined, makeRng(2)), skillFx("huo", 1), makeRng(3));
  assert.equal(a.strike, null);
  assert.equal(a.gifts.length, 2);
  assert.equal(a.heal, 0);
});

/* ---------- 霍去病「少年驍騎」 ---------- */

test("少年驍騎: +8 every 3 successful player hands, max 3 times (24) per fight", () => {
  const s = freshTrioPassives(["huo", "zhuge", "sima"]);
  const got: number[] = [];
  for (let h = 1; h <= 15; h++) for (const g of finishHand(s, h, 3)) got.push(h, g.gain);
  assert.deepEqual(got, [3, 8, 6, 8, 9, 8]);
  assert.equal(s.huoGrants, 3);
  assert.deepEqual(finishHand(s, 99, 0), []); // a non-clearing call is never a hand
  assert.deepEqual(freshTrioPassives(["zhuge"]).team, ["zhuge"]);
  const no = freshTrioPassives(["zhuge", "sima"]);
  for (let h = 1; h <= 6; h++) assert.deepEqual(finishHand(no, h, 5), []); // not on the team → nothing
});

/* ---------- 李白「將進酒」 ---------- */

test("將進酒: arms only below 70% (not full / not at 70%), next player hand +12, max 2", () => {
  const s = freshTrioPassives(["libai", "zhuge", "sima"]);
  assert.equal(liEvaluate(s, 1000, 1000), false);
  assert.equal(liEvaluate(s, 700, 1000), false); // exactly 70% is not "below"
  assert.equal(liEvaluate(s, 0, 1000), false); // dead
  assert.deepEqual(finishHand(s, 1, 3), []);
  assert.equal(liEvaluate(s, 699, 1000), true);
  assert.equal(liEvaluate(s, 300, 1000), false); // already armed: no double arm
  assert.deepEqual(finishHand(s, 2, 3).map((g) => [g.id, g.gain]), [["libai", 12]]);
  assert.deepEqual(finishHand(s, 3, 3), []); // consumed: same promise never pays twice
  assert.equal(liEvaluate(s, 500, 1000), true);
  assert.equal(finishHand(s, 4, 3).length, 1);
  assert.equal(liEvaluate(s, 100, 1000), false); // 2 grants = cap
  assert.deepEqual(finishHand(s, 5, 3), []);
  assert.equal(s.liGrants, 2);
});

test("將進酒: ANY successful player clear consumes — no actor/colour attribution exists", () => {
  // finishHand has no actor parameter at all; every hand in a team containing 李白 can pay.
  assert.equal(finishHand.length, 3);
  for (const t of [["libai"], ["zhuge", "libai", "sima"], ["huo", "liuche", "libai"]]) {
    const s = freshTrioPassives(t);
    liEvaluate(s, 100, 1000);
    assert.ok(finishHand(s, 1, 3).some((g) => g.id === "libai" && g.gain === 12), t.join());
  }
  const src = readFileSync(new URL("./trio-passives.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /actorId|hand-attribution|actorForHand/);
});

test("將進酒: armed promise survives a later heal to ≥70%; a heal alone never consumes", () => {
  const s = freshTrioPassives(["libai", "zhuge", "sima"]);
  liEvaluate(s, 400, 1000);
  liEvaluate(s, 1000, 1000); // skill / jade heal re-check: neither arms nor disarms
  assert.equal(s.liArmed, true);
  assert.deepEqual(afterCast(s, "libai", "libai:1"), []); // 醉月吟's own heal is not a hand
  assert.equal(s.liArmed, true);
  assert.equal(finishHand(s, 1, 3)[0]!.id, "libai");
});

/* ---------- 劉徹「帝王號令」 ---------- */

test("帝王號令 1: first player hand clearing ≥4 jades gives 劉徹 +15, once per fight", () => {
  const s = freshTrioPassives(["liuche", "zhuge", "sima"]);
  assert.deepEqual(finishHand(s, 1, 3), []);
  assert.deepEqual(finishHand(s, 2, 4).map((g) => [g.id, g.gain]), [["liuche", 15]]);
  assert.deepEqual(finishHand(s, 3, 12), []);
});

test("帝王號令 2: 劉徹's first complete cast gives each OTHER teammate +5 exactly once", () => {
  const s = freshTrioPassives(["liuche", "huo", "libai"]);
  assert.deepEqual(afterCast(s, "huo", "huo:1"), []); // others' casts do nothing
  const g = afterCast(s, "liuche", "liuche:1");
  assert.deepEqual(g.map((x) => [x.id, x.gain]), [["huo", 5], ["libai", 5]]);
  assert.deepEqual(afterCast(s, "liuche", "liuche:1"), []); // repeated callback / re-entry
  assert.deepEqual(afterCast(s, "liuche", "liuche:2"), []); // later casts never repeat
  const t = team(["liuche", "huo", "libai"]);
  apply(t, g);
  assert.deepEqual([t.liuche!.energy, t.huo!.energy, t.libai!.energy], [0, 5, 5]);
});

/* ---------- shared rules ---------- */

test("grants never exceed the personal cost cap; at cap the opportunity is consumed, not banked", () => {
  const s = freshTrioPassives(["huo", "libai", "liuche"]);
  const t = team(["huo", "libai", "liuche"]);
  t.huo = { ...t.huo!, energy: 70 };
  t.libai = { ...t.libai!, energy: 75 };
  liEvaluate(s, 10, 1000);
  for (let h = 1; h <= 3; h++) apply(t, finishHand(s, h, 5));
  assert.equal(t.huo!.energy, 75);
  assert.equal(t.libai!.energy, 75);
  assert.equal(s.liGrants, 1); // spent while full: no overflow kept for later
  assert.equal(t.liuche!.energy, 15);
  t.huo = spend(t.huo!);
  assert.equal(t.huo.energy, 0);
});

test("same hand id twice (animation re-entry / repeated callback) never double-triggers", () => {
  const s = freshTrioPassives(["huo", "libai", "liuche"]);
  liEvaluate(s, 100, 1000);
  finishHand(s, 1, 6);
  finishHand(s, 2, 3);
  const once = finishHand(s, 3, 3);
  assert.deepEqual(once.map((g) => g.id), ["huo"]);
  for (let i = 0; i < 5; i++) for (const h of [1, 2, 3]) assert.deepEqual(finishHand(s, h, 9), []);
  assert.deepEqual([s.huoHands, s.huoGrants, s.liGrants, s.liuFour], [3, 1, 1, true]);
});

test("restart: a fresh state per fight — counters never carry over", () => {
  let s = freshTrioPassives(["huo", "libai", "liuche"]);
  for (let h = 1; h <= 9; h++) finishHand(s, h, 5);
  liEvaluate(s, 10, 1000);
  afterCast(s, "liuche", "liuche:1");
  s = freshTrioPassives(["huo", "libai", "liuche"]); // what Match3 begin() does
  assert.deepEqual([s.huoHands, s.huoGrants, s.liArmed, s.liGrants, s.liuFour, s.liuAlly, s.seenHands.size, s.seenCasts.size], [0, 0, false, 0, false, false, 0, 0]);
  assert.equal(finishHand(s, 1, 4)[0]!.id, "liuche"); // handId 1 reused in the new fight is fine
  assert.equal(afterCast(s, "liuche", "liuche:1").length, 2);
});

/* ---------- official Match3 wiring (source order) ---------- */

test("Match3 wiring: reset at begin/finish/unmount; hand hook after all waves; Li arm at settled points; Liu after full cast", () => {
  const src = readFileSync(new URL("../components/game/Match3.tsx", import.meta.url), "utf8");
  const begin = src.slice(src.indexOf("const begin = () => {"), src.indexOf("setPhase(\"play\");\n  };", src.indexOf("const begin = () => {")));
  assert.match(begin, /trioRef\.current = freshTrioPassives\(team\)/);
  const fin = src.slice(src.indexOf("const finish = (p: Progress) => {"), src.indexOf("if (raid) {", src.indexOf("const finish = (p: Progress) => {")));
  assert.match(fin, /trioRef\.current = freshTrioPassives\(\[\]\)/);
  assert.match(src, /live\.current = false;\n\s+trioRef\.current = freshTrioPassives\(\[\]\)/);
  const swap = src.slice(src.indexOf("const playSwap = async"), src.indexOf("const cellAt ="));
  const iWaves = swap.indexOf("acc = await playWave(res.waves[i]!, i, acc);");
  const iHand = swap.indexOf("applyTrio(finishHand(trioRef.current, turnRef.current, res.waves.reduce((n, w) => n + w.removed.length, 0)))");
  const iArm = swap.indexOf("liEvaluate(trioRef.current, hpRef.current, maxHp);", iHand);
  const iEnemy = swap.indexOf("enemyTurn(enemyDef");
  const iHurt = swap.indexOf("changeHp(-t.hurt);");
  const iArm2 = swap.indexOf("liEvaluate(trioRef.current, hpRef.current, maxHp);", iHurt);
  assert.ok(iWaves > 0 && iWaves < iHand && iHand < iArm && iArm < iEnemy && iEnemy < iHurt && iHurt < iArm2, JSON.stringify({ iWaves, iHand, iArm, iEnemy, iHurt, iArm2 }));
  assert.ok(swap.indexOf("if (!res.ok)") < iHand); // failed swaps return before any hook
  assert.equal(swap.match(/finishHand\(/g)!.length, 1);
  const act = src.slice(src.indexOf("const activate = async"), src.indexOf("const playWave = async"));
  assert.doesNotMatch(act, /finishHand\(/); // skills / strikes are never hands
  const iHeal = act.indexOf("setHp(before + act.heal);");
  const iSkillArm = act.indexOf("liEvaluate(trioRef.current, hpRef.current, maxHp);");
  const iCast = act.indexOf("applyTrio(afterCast(trioRef.current, id, `${id}:${mem.uses + 1}`));");
  const iDone = act.indexOf("busy.current = false;", iCast);
  assert.ok(iHeal > 0 && iHeal < iSkillArm && iSkillArm < iCast && iCast < iDone);
  const wave = src.slice(src.indexOf("const playWave = async"), src.indexOf("const playSwap = async"));
  assert.doesNotMatch(wave, /trio|finishHand|liEvaluate|afterCast/); // per-wave code never touches passives
  assert.match(src, /const applyTrio = \(grants: Grant\[\]\) => \{\n\s+if \(!grants\.length\) return;\n\s+addEnergy\(grantMap\(grants\)\);/);
});

/* ---------- small fixed-seed harness on official modules (主線 / 深宮 / 鎮厄司) ---------- */

type Out = { won: boolean; casts: Record<string, number>; grants: Record<string, number>; maxSeen: number; s: TrioState };
/** Replays Match3's order with the official engine: swap → waves (charge, jade heal, hit) → hand hook → Li arm → enemy → Li arm; cast when full. */
function fight(def: EnemyDef, moves: number, ids: string[], seed: number): Out {
  const rng = makeRng(seed);
  const maxHp = playerMaxHp(moves);
  let hp = maxHp;
  let board: Board = freshBoard(8, 7, undefined, rng);
  let enemy = startEnemy(def);
  const t = team(ids);
  const s = freshTrioPassives(ids);
  const casts: Record<string, number> = {};
  const grants: Record<string, number> = {};
  let maxSeen = 0;
  let hand = 0;
  const give = (g: Grant[]) => {
    for (const x of g) grants[`${x.id}:${x.passive}`] = (grants[`${x.id}:${x.passive}`] ?? 0) + 1;
    apply(t, g);
  };
  const check = () => {
    for (const id of ids) {
      assert.ok(t[id]!.energy >= 0 && t[id]!.energy <= t[id]!.cost, `${id} ${t[id]!.energy}/${t[id]!.cost}`);
      maxSeen = Math.max(maxSeen, t[id]!.energy / t[id]!.cost);
    }
  };
  for (let turn = 0; turn < 200 && hp > 0 && !enemy.defeated; turn++) {
    for (const id of ids) {
      if (!isFull(t[id]!) || enemy.defeated) continue;
      t[id] = spend(t[id]!);
      casts[id] = (casts[id] ?? 0) + 1;
      const act = activateSkill(board, skillFx(id, 1), rng);
      board = act.board;
      enemy = skillHit(def, enemy, act.crackHits.length).state;
      hp = healHp(hp, maxHp, act.heal);
      liEvaluate(s, hp, maxHp);
      give(afterCast(s, id, `${id}:${casts[id]}`));
      check();
    }
    if (enemy.defeated) break;
    const mv = allMoves(board);
    if (!mv.length) break;
    const [a, b] = mv[Math.floor(rng() * mv.length)]!;
    const res = trySwap(board, a, b, rng);
    if (!res.ok) continue;
    hand += 1;
    let gained = 0;
    res.waves.forEach((w, i) => {
      const gain = Math.min(waveEnergy(w, i), Math.max(0, COMBAT.energyPerMoveCap - gained));
      gained += gain;
      for (const id of ids) t[id] = addEnergy(t[id]!, gain);
      if (!enemy.defeated) enemy = hitWithWaves(def, enemy, [w], 1, i).state;
      hp = healHp(hp, maxHp, jadeHeal(w.collected));
    });
    board = res.board;
    give(finishHand(s, hand, res.waves.reduce((n, w) => n + w.removed.length, 0)));
    give(finishHand(s, hand, 99)); // simulated animation re-entry of the same hand: must be a no-op
    liEvaluate(s, hp, maxHp);
    check();
    if (enemy.defeated) break;
    const et = enemyTurn(def, enemy, board, rng);
    enemy = et.state;
    board = et.board;
    if ("label" in et) {
      if (et.drain > 0) for (const id of ids) t[id] = { ...t[id]!, energy: Math.max(0, Math.floor(t[id]!.energy * (1 - et.drain))) };
      hp = Math.max(0, hp - et.hurt);
      liEvaluate(s, hp, maxHp);
    }
    check();
  }
  return { won: enemy.defeated, casts, grants, maxSeen, s };
}

test("fixed seeds — trio on one team in 主線 / 深宮 / 鎮厄司: caps hold, no overflow, Liu ally once, fights end", () => {
  const raid = RAID_ENCOUNTERS[0]!;
  const modes: [string, EnemyDef, number][] = [
    ["主線10", enemyForLevel(LEVELS[9]!), LEVELS[9]!.moves],
    ["深宮10", enemyForFloor(10, floorDef(10)), floorDef(10).moves],
    ["鎮厄司", raid.enemy, raid.def.moves],
  ];
  const rows: string[] = [];
  for (const [name, def, moves] of modes)
    for (const seed of [11, 516]) {
      const o = fight(def, moves, ["huo", "libai", "liuche"], seed);
      assert.ok((o.grants["huo:少年驍騎"] ?? 0) <= 3);
      assert.ok((o.grants["libai:將進酒"] ?? 0) <= 2);
      assert.ok((o.grants["liuche:帝王號令"] ?? 0) <= 1);
      assert.ok((o.grants["huo:帝王號令"] ?? 0) <= 1 && (o.grants["libai:帝王號令"] ?? 0) <= 1);
      assert.equal(o.grants["liuche:帝王號令"] ?? 0, o.s.liuFour ? 1 : 0);
      if (o.casts.liuche) assert.equal(o.grants["huo:帝王號令"], 1);
      assert.ok(o.maxSeen <= 1);
      rows.push(`${name} seed${seed} won=${o.won} casts=${JSON.stringify(o.casts)} grants=${JSON.stringify(o.grants)}`);
    }
  // at least one fixed seed exercises each passive
  const all = rows.join("\n");
  for (const k of ["huo:少年驍騎", "liuche:帝王號令", "huo:帝王號令"]) assert.ok(all.includes(k), k);
  console.log(all);
});

test("fixed seed — 李白 with two non-trio teammates: low HP lets their clears pay 將進酒", () => {
  let paid = 0;
  for (const seed of [3, 516, 2026]) {
    const o = fight(enemyForLevel(LEVELS[29]!), LEVELS[29]!.moves, ["libai", "zhuge", "sima"], seed);
    assert.ok(o.s.liGrants <= 2);
    paid += o.s.liGrants;
  }
  assert.ok(paid > 0, "將進酒 should fire on at least one fixed seed");
});
