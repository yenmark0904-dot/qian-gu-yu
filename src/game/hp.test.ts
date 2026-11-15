import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "./levels.ts";
import { floorDef } from "./shengong.ts";
import { HEAL_CHANCE, HEAL_KIND, JADE_KINDS, KINDS, boardFrom, findMatches, freshBoard, gravity, makeRng, trySwap, emptySeal } from "./match3.ts";
import {
  PLAYER,
  attackDamage,
  boardHasSeal,
  clampHp,
  comboHit,
  enemyAttack,
  enemyTurn,
  hitWithWaves,
  enemyForLevel,
  healHp,
  hpEquivMoves,
  jadeHeal,
  playerMaxHp,
  skillHit,
  startEnemy,
} from "./combat.ts";
import { activateSkill, activationLabels, addEnergy, freshCharge, waveEnergy, spend } from "./assist.ts";
import { NO_FX, describeFx, skillFx } from "./skills.ts";

test("氣血: max HP = moves × 40 rounded to 50 (level 1 → 1000; 深宮 floors use their own moves)", () => {
  assert.equal(LEVELS[0]!.moves, 25);
  assert.equal(playerMaxHp(LEVELS[0]!.moves), 1000);
  for (const def of LEVELS) {
    const hp = playerMaxHp(def.moves);
    assert.equal(hp % 50, 0);
    assert.ok(Math.abs(hp - def.moves * 40) <= 25, `L${def.id}`);
  }
  const f = floorDef(12);
  assert.equal(playerMaxHp(f.moves), Math.round((f.moves * 40) / 50) * 50);
});

test("氣血 never below 0 or above max; heals cap", () => {
  assert.equal(clampHp(-30, 1000), 0);
  assert.equal(clampHp(1200, 1000), 1000);
  assert.equal(healHp(980, 1000, 45), 1000);
  assert.equal(healHp(500, 1000, 45), 545);
  assert.equal(healHp(500, 1000, -10), 500, "heal never hurts");
});

test("墨厄 attack hurts the player: 140 · boss ×1.25 · phase 2 ×1.2, shown in the label", () => {
  const minion = enemyForLevel(LEVELS[0]!);
  const boss = enemyForLevel(LEVELS[9]!);
  assert.equal(minion.boss, false);
  assert.equal(boss.boss, true);
  assert.equal(attackDamage(minion, 1), 140);
  assert.equal(attackDamage(minion, 2), 168);
  assert.equal(attackDamage(boss, 1), 175);
  assert.equal(attackDamage(boss, 2), 210);
  const board = freshBoard(8, 7, emptySeal(8, 7), makeRng(3));
  const out = enemyAttack(minion, startEnemy(minion), board, makeRng(4));
  assert.equal(out.hurt, 140);
  assert.match(out.label, /傷害 140/);
  const p2 = enemyAttack(boss, { ...startEnemy(boss), phase: 2 }, board, makeRng(4));
  assert.equal(p2.hurt, 210);
  // the player HP after an attack
  assert.equal(clampHp(1000 - out.hurt, 1000), 860);
  assert.equal(clampHp(100 - out.hurt, 1000), 0);
});

test("pink-heart 補血石 heals 45 each; green 青玉璧 no longer heals; hearts still damage and charge", () => {
  assert.equal(HEAL_KIND, 6);
  assert.equal(KINDS, 7);
  assert.equal(JADE_KINDS, 7);
  assert.equal(jadeHeal([3, 3, 3, 3, 3, 3, 0]), 0, "green no longer heals");
  assert.equal(jadeHeal([0, 0, 0, 0, 0, 0, 2]), 90);
  const b = boardFrom(["6612", "2362", "1234", "4512"]);
  assert.equal(findMatches(b.cells).length, 0);
  const res = trySwap(b, { r: 0, c: 2 }, { r: 1, c: 2 }, makeRng(1));
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.collected.length, JADE_KINDS);
  assert.ok(res.collected[HEAL_KIND]! >= 3);
  assert.equal(jadeHeal(res.collected), res.collected[HEAL_KIND]! * 45);
  assert.equal(PLAYER.healPerJade, 45);
  const enemy = enemyForLevel(LEVELS[0]!);
  assert.ok(hitWithWaves(enemy, startEnemy(enemy), res.waves).state.hp < enemy.hp);
  const charged = addEnergy(freshCharge(55, "R"), waveEnergy(res.waves[0]!, 0));
  assert.ok(charged.energy > 0, "heart still adds team charge");
  assert.equal(spend(charged).energy, 0, "skill activation still spends charge");
});

test("龍珠 swapped onto a pink heart clears every 粉心玉 and heals for each", () => {
  const b = boardFrom(["6123", "2641", "6302", "4516"], [[3, 0, "color"]]);
  const res = trySwap(b, { r: 3, c: 0 }, { r: 2, c: 0 }, makeRng(2));
  assert.ok(res.ok);
  if (!res.ok) return;
  const hearts = b.cells.flat().filter((p) => p.kind === HEAL_KIND).length;
  assert.ok(hearts >= 4);
  assert.equal(res.waves[0]!.collected[HEAL_KIND], hearts);
  assert.ok(jadeHeal(res.collected) >= hearts * 45);
});

test("fresh boards and refills use seven colours, including the pink-heart 補血石; legacy heal chance cannot bias drops", () => {
  assert.equal(HEAL_CHANCE, 0);
  const holes = Array.from({ length: 8 }, () => new Array(7).fill(null));
  const seal = emptySeal(8, 7);
  let green = 0;
  for (let seed = 0; seed < 100; seed++) {
    const normal = gravity(holes, seal, makeRng(seed));
    const legacy = gravity(holes, seal, makeRng(seed), 1);
    assert.deepEqual(legacy.cells.map((r) => r.map((p) => p.kind)), normal.cells.map((r) => r.map((p) => p.kind)));
    for (const p of legacy.cells.flat()) {
      assert.ok(p.kind >= 0 && p.kind < KINDS);
      if (p.kind === HEAL_KIND) green++; // now counts pink hearts
    }
    const fresh = freshBoard(8, 7, seal, makeRng(seed), 1);
    assert.equal(findMatches(fresh.cells).length, 0);
    assert.ok(fresh.cells.flat().every((p) => p.kind >= 0 && p.kind < KINDS));
    assert.deepEqual(fresh.cells.map((r) => r.map((p) => p.kind)), freshBoard(8, 7, seal, makeRng(seed)).cells.map((r) => r.map((p) => p.kind)));
  }
  assert.ok(green > 0);
});

test("enemy attacks never drain charge in either phase, while HP, seals and shields still apply", () => {
  const base = enemyForLevel(LEVELS[9]!);
  const def = { ...base, ink: 2, ice: 1, shield: 40, skills: ["ink", "drain", "shield"] as typeof base.skills };
  for (const phase of [1, 2] as const) {
    const board = freshBoard(8, 7, emptySeal(8, 7), makeRng(3));
    const out = enemyTurn(def, { ...startEnemy(def), phase, countdown: 1 }, board, makeRng(4));
    assert.ok("drain" in out);
    if (!("drain" in out)) return;
    assert.equal(out.drain, 0);
    assert.ok(out.hurt > 0);
    assert.ok(out.sealed.length > 0);
    assert.ok(out.shield > 0);
    assert.doesNotMatch(out.label, /墨蝕/);
  }
});

test("support skills heal on 發動; no skill adds 步", () => {
  const brush = skillFx("tao", 1);
  assert.equal(brush.heal, 70);
  assert.equal(brush.moves, 0);
  const board = freshBoard(8, 7, emptySeal(8, 7), makeRng(5));
  const act = activateSkill(board, skillFx("libai", 1), makeRng(6));
  assert.equal(act.heal, 210);
  assert.deepEqual(activationLabels(skillFx("libai", 1)).filter((t) => t.includes("血")), ["+210 血"]);
  assert.ok(!activationLabels(skillFx("libai", 1)).some((t) => t.includes("步")));
  assert.equal(activateSkill(board, NO_FX, makeRng(6)).heal, 0);
  assert.equal(describeFx(skillFx("nalan", 1)).includes("+70 血"), true);
});

test("餘血加分 mapping: floor(hp / max × moves), capped at moves", () => {
  assert.equal(hpEquivMoves(1000, 1000, 25), 25);
  assert.equal(hpEquivMoves(500, 1000, 25), 12);
  assert.equal(hpEquivMoves(39, 1000, 25), 0);
  assert.equal(hpEquivMoves(40, 1000, 25), 1);
  assert.equal(hpEquivMoves(5000, 1000, 25), 25);
  assert.equal(hpEquivMoves(-5, 1000, 25), 0);
});

test("墨封 or 冰封 still on the board blocks damage to 墨厄", () => {
  const enemy = enemyForLevel(LEVELS[0]!);
  const s0 = startEnemy(enemy);
  const wave = {
    removed: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }],
    effects: [],
    sealHits: [],
    collected: [0, 0, 0, 3, 0, 0, 0],
  };
  const sealed = { seal: [[1, 0], [0, 2]] };
  const open = { seal: [[0, 0], [0, 0]] };
  assert.equal(boardHasSeal(sealed), true);
  assert.equal(boardHasSeal({ seal: [[2]] }), true);
  assert.equal(boardHasSeal(open), false);
  const blocked = hitWithWaves(enemy, s0, [wave], 1, 0, sealed);
  assert.equal(blocked.state.hp, s0.hp);
  assert.deepEqual(blocked.hits, [0]);
  assert.ok(hitWithWaves(enemy, s0, [wave], 1, 0, open).state.hp < s0.hp);
  assert.equal(skillHit(enemy, s0, 2, sealed).dealt, 0);
  assert.ok(skillHit(enemy, s0, 2, open).dealt > 0);
  assert.equal(comboHit(enemy, s0, "duo", sealed).dealt, 0);
  assert.ok(comboHit(enemy, s0, "duo", open).dealt > 0);
});
