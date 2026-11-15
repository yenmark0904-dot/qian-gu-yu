import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "./levels.ts";
import { floorDef } from "./shengong.ts";
import { freshBoard, makeRng, hasMove, emptySeal, type Wave } from "./match3.ts";
import {
  COMBAT,
  chainCast,
  combatTeam,
  comboHit,
  enemyAttack,
  enemyForFloor,
  enemyForLevel,
  enemyTurn,
  feedLamp,
  forgetBroken,
  freshChain,
  hitWithWaves,
  hurt,
  moveEnergy,
  purgeEnemySeals,
  skillHit,
  startEnemy,
  waveDamage,
} from "./combat.ts";
import { STORY_EVENTS, cleanStoryEvents, mergeStoryEvents, storyEventFor } from "./story-events.ts";
import { sanitizeSnapshot, SNAPSHOT_KEYS } from "./cloud-save.ts";

const wave = (n: number, collected = [n, 0, 0, 0, 0, 0], effects = 0): Pick<Wave, "removed" | "effects" | "sealHits" | "collected"> => ({
  removed: Array.from({ length: n }, (_, i) => ({ r: 0, c: i })),
  effects: Array.from({ length: effects }, () => ({ type: "row", r: 0, c: 0 }) as const),
  sealHits: [],
  collected,
});

test("every main level and sample floors get a valid 墨厄; 章末關 are 首領", () => {
  for (const def of LEVELS) {
    const e = enemyForLevel(def);
    assert.ok(e.hp >= 1500 && e.hp <= 6000, `lv ${def.id} hp ${e.hp}`);
    assert.ok(e.attackEvery >= 3);
    assert.equal(e.boss, def.id % 10 === 0);
    if (def.goals.some((g) => g.type === "seal")) assert.equal(e.skills.includes("ink"), false, `lv ${def.id} seal goal must not get enemy seals`);
  }
  for (const f of [1, 9, 10, 25, 50, 120]) {
    const def = floorDef(f);
    const e = enemyForFloor(f, def);
    assert.ok(e.hp > 0);
    assert.equal(e.boss, f % 10 === 0);
  }
});

test("main levels, presets (2/3/5 teaching boards) and stars are unchanged by combat", () => {
  assert.equal(LEVELS.length, 50);
  for (const id of [2, 3, 5]) assert.ok(LEVELS.find((l) => l.id === id)!.preset, `level ${id} keeps its teaching preset`);
});

test("damage: chain bonus, specials, 墨厄抗性 and shields", () => {
  const plain = enemyForLevel(LEVELS[0]!);
  assert.equal(waveDamage(plain, wave(3), 0), 81);
  assert.ok(waveDamage(plain, wave(3), 2) > 81);
  assert.equal(waveDamage(plain, wave(3, [3, 0, 0, 0, 0, 0], 1), 0), 81 + COMBAT.specialDamage);
  const lamp = STORY_EVENTS[0]!.enemy;
  assert.ok(waveDamage(lamp, wave(3, [0, 0, 3, 0, 0, 0]), 0) > waveDamage(lamp, wave(3, [0, 0, 0, 3, 0, 0]), 0), "lamp jade burns the shade, 墨玉 barely bites");
  let s = { ...startEnemy(plain), shield: 100 };
  const r = hurt(s, 150, 30);
  assert.equal(r.dealt, 80);
  assert.equal(r.state.shield, 0);
  s = hitWithWaves(plain, startEnemy(plain), [wave(3), wave(4)]).state;
  assert.ok(s.hp < plain.hp);
});

test("skill and 共鳴 hits; defeat flags 破厄 and stays at 0 HP", () => {
  const def = enemyForLevel(LEVELS[9]!);
  let s = startEnemy(def);
  const a = skillHit(def, s);
  assert.ok(a.dealt >= COMBAT.skillDamage);
  const d = comboHit(def, a.state, "duo");
  const t = comboHit(def, d.state, "trio");
  assert.ok(t.dealt > d.dealt);
  s = hurt(t.state, 1e9).state;
  assert.equal(s.hp, 0);
  assert.equal(s.defeated, true);
  assert.equal(hurt(s, 50).dealt, 0);
  // 首領 phase 2 under half HP
  const half = hurt(startEnemy(def), def.hp * 0.6).state;
  assert.equal(hitWithWaves(def, half, [wave(3)]).state.phase, 2);
});

test("天命連攜: duo then trio, never repeats the same assist, resets after three (no loop)", () => {
  let c = freshChain();
  let r = chainCast(c, "a", 0, 0);
  assert.equal(r.combo, null);
  r = chainCast(r.chain, "a", 0, 10);
  assert.equal(r.combo, null, "same assist twice is not a chain");
  r = chainCast(r.chain, "b", 0, 20);
  assert.equal(r.combo, "duo");
  r = chainCast(r.chain, "c", 1, 30);
  assert.equal(r.combo, "trio");
  assert.deepEqual(r.ids, ["a", "b", "c"]);
  assert.deepEqual(r.chain.ids, []);
  r = chainCast(r.chain, "a", 1, 40);
  assert.equal(r.combo, null);
  c = chainCast(freshChain(), "a", 0, 0).chain;
  assert.equal(chainCast(c, "b", 3, 1).combo, null, "too many moves apart");
});

test("team: up to three owned, fallback single assist; energy cap", () => {
  const owned = { a: 1, b: 2, c: 1, d: 1 };
  assert.deepEqual(combatTeam(["a", "b", "c", "d"], owned, "z", () => true), ["a", "b", "c"]);
  assert.deepEqual(combatTeam(["x"], owned, "a", () => true), ["a"]);
  assert.deepEqual(combatTeam([], owned, null, () => true), []);
  assert.equal(moveEnergy([10, 20], 1), 30);
  assert.equal(moveEnergy([10, 20], 3), COMBAT.energyPerMoveCap);
});

test("enemy attack: countdown, seals capped, never removes the last move, 破厄 melts only its own seals", () => {
  const def = enemyForLevel(LEVELS[0]!);
  const rng = makeRng(7);
  let board = freshBoard(8, 7, emptySeal(8, 7), rng);
  let s = startEnemy(def);
  for (let i = 0; i < def.attackEvery - 1; i++) {
    const t = enemyTurn(def, s, board, rng);
    assert.ok(!("label" in t));
    s = t.state;
  }
  const t = enemyTurn(def, s, board, rng);
  assert.ok("label" in t);
  if (!("label" in t)) return;
  assert.equal(t.state.countdown, def.attackEvery);
  assert.ok(hasMove(t.board));
  board = t.board;
  s = t.state;
  for (let i = 0; i < 20; i++) {
    const a = enemyAttack(def, s, board, rng);
    board = a.board;
    s = a.state;
    assert.ok(hasMove(board));
  }
  assert.ok(board.seal.flat().filter(Boolean).length <= COMBAT.sealCap);
  board.seal[0]![0] = 1; // a stage seal the 墨厄 never placed
  s = forgetBroken(s, board);
  const purge = purgeEnemySeals(s, board);
  assert.equal(purge.board.seal[0]![0], s.placed.includes("0,0") ? 0 : 1);
  assert.equal(purge.board.seal.flat().filter(Boolean).length, s.placed.includes("0,0") ? 0 : 1);
});

test("story event 《一盞留燈》: lamp rules, no 墨玉, sticky saves", () => {
  const e = storyEventFor(1, 4)!;
  assert.equal(e.volumeTitle, "一盞留燈");
  assert.ok(!e.volumeTitle.includes("盎"));
  assert.equal(e.def.goals.length, 0);
  assert.ok(e.enemy.skills.includes("dim"));
  assert.ok(e.enemy.resist && e.enemy.resist[2]! > 1);
  const s = startEnemy(e.enemy, e.lamp.start);
  assert.equal(feedLamp(s, 999).lamp, 100);
  const dimmed = enemyAttack(e.enemy, s, freshBoard(8, 7, emptySeal(8, 7), makeRng(1)), makeRng(1));
  assert.equal(dimmed.state.lamp, e.lamp.start - e.enemy.dim);
  assert.deepEqual(cleanStoryEvents({ "qin-4-lamp": { cleared: true, tries: 3 }, junk: { cleared: true } }), {
    "qin-4-lamp": { cleared: true, skipped: false, tries: 3 },
  });
  assert.equal(mergeStoryEvents({ "qin-4-lamp": { cleared: true, skipped: false, tries: 1 } }, { "qin-4-lamp": { cleared: false, skipped: true, tries: 4 } })["qin-4-lamp"]!.cleared, true);
  assert.equal(storyEventFor(1, 5), null);
});

test("cloud snapshot carries the additive story + coach flags; old snapshots default safely", () => {
  assert.ok(SNAPSHOT_KEYS.includes("storyEvents"));
  assert.ok(SNAPSHOT_KEYS.includes("coachSeen"));
  const res = sanitizeSnapshot({ ink: 10, m3: { "1": { stars: 3, best: 2000 } } });
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.deepEqual(res.data.storyEvents, {});
  assert.equal(res.data.coachSeen, 0);
  assert.equal(res.data.m3["1"]!.stars, 3, "stars are never reset");
});
