import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, goalsMet, startBoard, startProgress } from "./levels.ts";
import { floorDef } from "./shengong.ts";
import { boardFrom, emptySeal, freshBoard, hasMove, makeRng, trySwap, type Board, type Pos } from "./match3.ts";
import {
  COMBAT,
  enemyAttack,
  enemyForFloor,
  enemyForLevel,
  fightOutcome,
  spreadForFloor,
  spreadForLevel,
  SPREAD_FROM,
  creepAfterMove,
  spreadVeins,
  startEnemy,
} from "./combat.ts";

const adj = (b: Board, p: Pos) =>
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => (b.seal[p.r + dr!]?.[p.c + dc!] ?? 0) > 0);

/* ── t436u: 過關 = 打倒墨厄 ─────────────────────────────────────────────── */

test("過關 only by 破厄: a met score/collect/seal goal never wins while the 墨厄 stands", () => {
  const def = LEVELS[0]!;
  const p = { ...startProgress(startBoard(def, makeRng(1))), score: 999999 };
  assert.ok(goalsMet(def, p), "the old score goal is met");
  assert.equal(fightOutcome({ defeated: false, hp: 600 }), null, "fight goes on");
});

test("破厄 wins even with every old goal unmet; 氣血 0 with the 墨厄 alive loses", () => {
  const def = LEVELS[3]!; // 破封 goal
  assert.equal(goalsMet(def, startProgress(startBoard(def, makeRng(1)))), false, "seal goal unmet");
  assert.equal(fightOutcome({ defeated: true, hp: 10 }), "win");
  assert.equal(fightOutcome({ defeated: false, hp: 0 }), "lose");
  assert.equal(fightOutcome({ defeated: false, hp: -40 }), "lose");
});

test("story 燈火: 破厄 with the lamp lit wins; lamp 0 or 氣血 0 loses; surviving alone is not a win", () => {
  assert.equal(fightOutcome({ defeated: true, hp: 300, lamp: 12 }), "win");
  assert.equal(fightOutcome({ defeated: false, hp: 300, lamp: 0 }), "lose");
  assert.equal(fightOutcome({ defeated: true, hp: 300, lamp: 0 }), "lose");
  assert.equal(fightOutcome({ defeated: false, hp: 0, lamp: 40 }), "lose");
  assert.equal(fightOutcome({ defeated: false, hp: 300, lamp: 40 }), null);
});

/* ── t438u / t439u: 墨紋延伸 from 第 40 關 ─────────────────────────────────── */

test("墨紋 creeps only from 第 40 關 (and 深宮 40 層): 1 per trigger, 首領 +1; 1–39 never", () => {
  assert.equal(SPREAD_FROM, 40);
  for (const def of LEVELS.filter((d) => d.id < 40)) assert.equal(enemyForLevel(def).spread ?? 0, 0, `L${def.id}`);
  for (const def of LEVELS.filter((d) => d.id >= 40)) {
    const e = enemyForLevel(def);
    assert.equal(e.spread, e.boss ? 2 : 1, `L${def.id}`);
    assert.ok(e.traits.some((t) => t.includes("墨紋延伸")));
  }
  assert.equal(enemyForLevel(LEVELS[49]!).spread, 2, "第 50 關首領 +1");
  assert.equal(spreadForLevel(39, true), 0);
  assert.equal(spreadForLevel(41, false), 1);
  assert.equal(spreadForFloor(39, false), 0);
  assert.equal(spreadForFloor(40, true), 2);
  assert.equal(spreadForFloor(57, false), 1);
  assert.equal(enemyForFloor(12, floorDef(12)).spread ?? 0, 0);
});

const v = (...ps: [number, number][]) => ps.map(([r, c]) => `${r},${c}`);

test("墨紋 grows from the 墨厄's own veins onto orthogonal neighbours, as one vein", () => {
  const seal = emptySeal(8, 7);
  seal[4]![3] = 1;
  const b0 = { ...freshBoard(8, 7, emptySeal(8, 7), makeRng(9)), seal };
  for (let s = 0; s < 30; s++) {
    const { board, cells } = spreadVeins(b0, 3, v([4, 3]), makeRng(s));
    assert.equal(cells.length, 3);
    const grow = { ...b0, seal: b0.seal.map((r) => r.slice()) };
    for (const p of cells) {
      assert.equal(grow.seal[p.r]![p.c], 0);
      assert.ok(adj(grow, p), `cell ${p.r},${p.c} next to the vein`);
      grow.seal[p.r]![p.c] = 1;
    }
    assert.ok(hasMove(board));
    assert.equal(b0.seal.flat().filter(Boolean).length, 1, "input board untouched");
  }
});

test("stage 墨封 never creep; with no 墨紋 only an attack (seed) starts one; vein cap holds", () => {
  const seal = emptySeal(8, 7);
  seal[0]![0] = 1; // a stage 墨封, not a 墨紋
  const b = { ...freshBoard(8, 7, emptySeal(8, 7), makeRng(4)), seal };
  assert.equal(spreadVeins(b, 2, [], makeRng(5)).cells.length, 0, "no 墨紋 → nothing creeps after a move");
  const seeded = spreadVeins(b, 2, [], makeRng(5), true);
  assert.equal(seeded.cells.length, 2);
  const g = { ...b, seal: emptySeal(8, 7) };
  g.seal[seeded.cells[0]!.r]![seeded.cells[0]!.c] = 1;
  assert.ok(adj(g, seeded.cells[1]!), "the second cell grows from the seeded one");
  const many = v([2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5]);
  const capped = { ...b, seal: emptySeal(8, 7) };
  for (const k of many) {
    const [r, c] = k.split(",").map(Number);
    capped.seal[r!]![c!] = 1;
  }
  assert.equal(many.length, COMBAT.veinCap);
  assert.equal(spreadVeins(capped, 3, many, makeRng(5)).cells.length, 0);
  assert.equal(spreadVeins(capped, 3, many.slice(1), makeRng(5)).cells.length, 1);
});

test("「沒弄掉就會延伸」: after a move a standing 墨紋 creeps (第 40 關+); cleared or early levels don't", () => {
  const late = enemyForLevel(LEVELS[44]!);
  const early = enemyForLevel(LEVELS[38]!);
  const seal = emptySeal(8, 7);
  seal[5]![2] = 1;
  const board = { ...freshBoard(8, 7, emptySeal(8, 7), makeRng(31)), seal };
  const st = { ...startEnemy(late), placed: v([5, 2]) };
  const out = creepAfterMove(late, st, board, makeRng(32));
  assert.equal(out.cells.length, 1);
  assert.ok(adj(board, out.cells[0]!));
  assert.equal(out.state.placed.length, 2);
  assert.equal(creepAfterMove(early, { ...startEnemy(early), placed: v([5, 2]) }, board, makeRng(32)).cells.length, 0, "第 39 關 never creeps");
  const cleared = { ...board, seal: emptySeal(8, 7) };
  assert.equal(creepAfterMove(late, st, cleared, makeRng(32)).cells.length, 0, "a melted 墨紋 does not grow back");
  assert.equal(creepAfterMove(late, { ...st, defeated: true }, board, makeRng(32)).cells.length, 0);
});

test("墨紋 never seals the last legal move", () => {
  const b = boardFrom(["0010", "2304", "4521", "1453"]);
  assert.equal(hasMove(b), true);
  for (let s = 0; s < 60; s++) {
    const { board } = spreadVeins(b, 5, [], makeRng(s), true);
    assert.ok(hasMove(board), `seed ${s}`);
  }
});

test("unlock a 墨紋 exactly like 墨封: a line on the cell or beside it breaks the lock", () => {
  const seal = emptySeal(4, 4);
  seal[1]![1] = 1;
  const b = boardFrom(["0010", "2304", "4521", "1453"], [], seal);
  const res = trySwap(b, { r: 0, c: 2 }, { r: 1, c: 2 }, makeRng(1));
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.board.seal[1]![1], 0, "adjacent line melted it");
  assert.equal(trySwap(b, { r: 1, c: 1 }, { r: 1, c: 2 }, makeRng(1)).ok, false, "a locked jade can't move");
});

test("墨厄 attacks: 第 40 關+ reports 墨紋延伸 next to its veins; 第 1–39 關 only drop isolated locks", () => {
  const e = enemyForLevel(LEVELS[44]!);
  const seal = emptySeal(8, 7);
  seal[0]![0] = 1;
  const board = { ...freshBoard(8, 7, emptySeal(8, 7), makeRng(21)), seal };
  const out = enemyAttack(e, { ...startEnemy(e), placed: v([0, 0]) }, board, makeRng(22));
  assert.match(out.label, /墨紋延伸 ×\d/);
  assert.ok(hasMove(out.board));
  for (const lv of [5, 25, 39]) {
    const ee = enemyForLevel(LEVELS[lv - 1]!);
    const o = enemyAttack(ee, { ...startEnemy(ee), placed: v([0, 0]) }, board, makeRng(22));
    assert.doesNotMatch(o.label, /墨紋延伸/, `L${lv}`);
  }
  // a 破封 boss at 40 with no isolated ink still seeds and grows a vein on attack
  const boss = enemyForLevel(LEVELS[39]!);
  const bo = enemyAttack(boss, startEnemy(boss), board, makeRng(24));
  assert.match(bo.label, /墨紋延伸 ×2/);
});
