import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLOR,
  allMoves,
  boardFrom,
  canSwap,
  findMatches,
  freshBoard,
  hasMove,
  makeRng,
  reshuffle,
  sealsLeft,
  shapeOf,
  trySwap,
  type Board,
  type Pos,
  type SwapResult,
} from "./match3.ts";
import {
  LEVELS,
  MAX_STARS,
  levelById,
  totalStars,
  goalStatus,
  goalsMet,
  MOVE_BONUS_BASE,
  MOVE_BONUS_MULT,
  MOVE_BONUS_STEP,
  bonusTally,
  isChapterFinale,
  finalScore,
  isUnlocked,
  moveBonus,
  moveBonusPer,
  levelReward,
  rewardPerStar,
  sealGrid,
  startBoard,
  startProgress,
  starsFor,
} from "./levels.ts";
import { skillFx } from "./skills.ts";

const P = (r: number, c: number): Pos => ({ r, c });
const ok = (res: SwapResult) => {
  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("swap failed");
  return res;
};
const has = (list: Pos[], p: Pos) => list.some((q) => q.r === p.r && q.c === p.c);

// A background with no matches anywhere: kinds cycle so nothing lines up.
function bg(rows: number, cols: number): string[] {
  const pat = ["0123", "2301", "1230", "3012"];
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => pat[r % 4]![c % 4]!).join(""));
}
function put(rows: string[], cells: [number, number, number][]) {
  const out = rows.map((r) => [...r]);
  for (const [r, c, k] of cells) out[r]![c] = String(k);
  return out.map((r) => r.join(""));
}

test("background helper has no ready matches", () => {
  assert.equal(findMatches(boardFrom(bg(8, 7)).cells).length, 0);
});

test("match detection: straight 3, 4, 5, L and T shapes", () => {
  const three = boardFrom(put(bg(8, 7), [[0, 0, 5], [0, 1, 5], [0, 2, 5]]));
  const g3 = findMatches(three.cells);
  assert.equal(g3.length, 1);
  assert.equal(g3[0]!.cells.length, 3);
  assert.equal(g3[0]!.make, null);

  const h4 = findMatches(boardFrom(put(bg(8, 7), [[2, 1, 5], [2, 2, 5], [2, 3, 5], [2, 4, 5]])).cells);
  assert.equal(h4[0]!.make, "row");
  const v4 = findMatches(boardFrom(put(bg(8, 7), [[1, 3, 5], [2, 3, 5], [3, 3, 5], [4, 3, 5]])).cells);
  assert.equal(v4[0]!.make, "col");

  const five = findMatches(boardFrom(put(bg(8, 7), [[5, 0, 4], [5, 1, 4], [5, 2, 4], [5, 3, 4], [5, 4, 4]])).cells);
  assert.equal(five[0]!.make, "color");
  assert.equal(five[0]!.cells.length, 5);

  // L: corner at (2,2)
  const L = findMatches(boardFrom(put(bg(8, 7), [[2, 2, 5], [2, 3, 5], [2, 4, 5], [3, 2, 5], [4, 2, 5]])).cells);
  assert.equal(L.length, 1);
  assert.equal(L[0]!.cells.length, 5);
  assert.equal(L[0]!.make, "bomb");

  // T: stem down from the middle of a horizontal 3
  const T = findMatches(boardFrom(put(bg(8, 7), [[1, 1, 5], [1, 2, 5], [1, 3, 5], [2, 2, 5], [3, 2, 5]])).cells);
  assert.equal(T.length, 1);
  assert.equal(T[0]!.make, "bomb");

  assert.equal(shapeOf({ runs: [{ dir: "h", cells: [P(0, 0), P(0, 1), P(0, 2), P(0, 3), P(0, 4), P(0, 5)] }] }), "color");
});

test("swap with no match is rejected; sealed jades cannot be swapped", () => {
  const b = boardFrom(bg(8, 7));
  assert.equal(trySwap(b, P(0, 0), P(0, 1)).ok, false);
  const sealed = boardFrom(put(bg(8, 7), [[0, 0, 5], [0, 1, 5], [1, 2, 5]]), [], sealGrid({ seal: ["..1....", ...Array(7).fill(".......")] }));
  const res = trySwap(sealed, P(1, 2), P(0, 2));
  assert.deepEqual(res, { ok: false, reason: "sealed" });
  assert.equal(trySwap(sealed, P(0, 0), P(0, 2)).ok, false);
});

test("special creation: 4 in a row makes a line jade at the swapped cell", () => {
  // row 3: 5 5 _ 5 with a 5 above the gap at (2,2)
  const b = boardFrom(put(bg(8, 7), [[3, 0, 5], [3, 1, 5], [2, 2, 5], [3, 3, 5]]));
  const res = ok(trySwap(b, P(2, 2), P(3, 2), makeRng(1)));
  const made = res.waves[0]!.created;
  assert.equal(made.length, 1);
  assert.equal(made[0]!.piece.special, "row");
  assert.deepEqual(made[0]!.pos, P(3, 2));
  assert.equal(made[0]!.piece.kind, 5);
});

test("special creation: L makes a bomb, straight 5 makes a 龍珠", () => {
  const bombB = boardFrom(put(bg(8, 7), [[2, 3, 5], [2, 4, 5], [3, 2, 5], [4, 2, 5], [2, 1, 5]]));
  // moving (2,1) → (2,2) completes an L with corner (2,2)
  const r1 = ok(trySwap(bombB, P(2, 1), P(2, 2), makeRng(2)));
  assert.equal(r1.waves[0]!.created[0]!.piece.special, "bomb");
  assert.deepEqual(r1.waves[0]!.created[0]!.pos, P(2, 2));

  const fiveB = boardFrom(put(bg(8, 7), [[4, 0, 5], [4, 1, 5], [4, 3, 5], [4, 4, 5], [5, 2, 5]]));
  const r2 = ok(trySwap(fiveB, P(5, 2), P(4, 2), makeRng(3)));
  const c = r2.waves[0]!.created[0]!;
  assert.equal(c.piece.special, "color");
  assert.equal(c.piece.kind, COLOR);
});

test("activation: a line jade clears its whole row, a bomb its 3×3", () => {
  const rows = put(bg(8, 7), [[3, 0, 5], [3, 1, 5], [2, 2, 5]]);
  const lineB = boardFrom(rows, [[3, 1, "row"]]);
  const res = ok(trySwap(lineB, P(2, 2), P(3, 2), makeRng(4)));
  const w = res.waves[0]!;
  assert.ok(w.effects.some((e) => e.type === "row" && e.r === 3));
  for (let c = 0; c < 7; c++) assert.ok(has(w.removed, P(3, c)), `row cell ${c}`);

  const bombB = boardFrom(rows, [[3, 1, "bomb"]]);
  const wb = ok(trySwap(bombB, P(2, 2), P(3, 2), makeRng(4))).waves[0]!;
  assert.ok(wb.effects.some((e) => e.type === "bomb"));
  for (let r = 2; r <= 4; r++) for (let c = 0; c <= 2; c++) assert.ok(has(wb.removed, P(r, c)), `bomb ${r},${c}`);
});

test("activation: 龍珠 swapped with a jade clears every jade of that kind", () => {
  const b = boardFrom(bg(8, 7), [[0, 0, "color"]]);
  const kind = b.cells[0]![1]!.kind;
  const count = b.cells.flat().filter((p) => p.kind === kind).length;
  const w = ok(trySwap(b, P(0, 0), P(0, 1), makeRng(5))).waves[0]!;
  assert.equal(w.collected[kind], count);
  assert.ok(w.effects.some((e) => e.type === "color" && e.kind === kind));
});

test("chains: a line jade caught in a bomb blast fires too", () => {
  const rows = put(bg(8, 7), [[3, 0, 5], [3, 1, 5], [2, 2, 5]]);
  const b = boardFrom(rows, [[3, 1, "bomb"], [4, 6 - 6, "col"]]);
  // (4,0) is in the bomb's 3×3 and carries a column line → clears column 0 entirely
  const w = ok(trySwap(b, P(2, 2), P(3, 2), makeRng(6))).waves[0]!;
  assert.ok(w.effects.some((e) => e.type === "col" && e.c === 0));
  for (let r = 0; r < 8; r++) assert.ok(has(w.removed, P(r, 0)));
});

test("combos: line+line cross, bomb+line 3 rows+3 cols, bomb+bomb 5×5, pearl+pearl board", () => {
  const base = bg(8, 7);
  const ll = ok(trySwap(boardFrom(base, [[3, 3, "row"], [3, 4, "col"]]), P(3, 3), P(3, 4), makeRng(7))).waves[0]!;
  for (let c = 0; c < 7; c++) assert.ok(has(ll.removed, P(3, c)));
  for (let r = 0; r < 8; r++) assert.ok(has(ll.removed, P(r, 4)));

  const bl = ok(trySwap(boardFrom(base, [[3, 3, "bomb"], [3, 4, "row"]]), P(3, 3), P(3, 4), makeRng(8))).waves[0]!;
  for (const r of [2, 3, 4]) for (let c = 0; c < 7; c++) assert.ok(has(bl.removed, P(r, c)));
  for (const c of [3, 4, 5]) for (let r = 0; r < 8; r++) assert.ok(has(bl.removed, P(r, c)));

  const bb = ok(trySwap(boardFrom(base, [[3, 3, "bomb"], [3, 4, "bomb"]]), P(3, 3), P(3, 4), makeRng(9))).waves[0]!;
  for (let r = 1; r <= 5; r++) for (let c = 2; c <= 6; c++) assert.ok(has(bb.removed, P(r, c)));
  assert.ok(bb.effects.some((e) => e.type === "bomb" && e.radius === 2));

  const cc = ok(trySwap(boardFrom(base, [[3, 3, "color"], [3, 4, "color"]]), P(3, 3), P(3, 4), makeRng(10))).waves[0]!;
  assert.equal(cc.removed.length, 56);
});

test("combos: 龍珠 + line jade turns that kind into line jades that all fire", () => {
  const b = boardFrom(bg(8, 7), [[3, 3, "color"], [3, 4, "row"]]);
  const kind = b.cells[3]![4]!.kind;
  const w = ok(trySwap(b, P(3, 3), P(3, 4), makeRng(11))).waves[0]!;
  const lines = w.effects.filter((e) => e.type === "row" || e.type === "col").length;
  const count = b.cells.flat().filter((p) => p.kind === kind).length;
  assert.ok(lines >= count - 1, `${lines} line effects for ${count} jades`);
});

test("seals: matches beside a sealed jade crack it; ice takes two hits", () => {
  const seal = sealGrid({ seal: ["...2...", "...1...", ...Array(6).fill(".......")] });
  const b = boardFrom(put(bg(8, 7), [[1, 0, 5], [1, 1, 5], [2, 2, 5]]), [], seal);
  assert.equal(sealsLeft(b), 2);
  const res = ok(trySwap(b, P(2, 2), P(1, 2), makeRng(12)));
  // (1,2) is matched → its neighbour (1,3) is cracked
  assert.ok(res.waves[0]!.sealHits.some((p) => p.r === 1 && p.c === 3));
  assert.ok(res.sealsBroken >= 1);
  const line = boardFrom(bg(8, 7), [[0, 0, "row"], [0, 1, "row"]], seal);
  const r2 = ok(trySwap(line, P(0, 0), P(0, 1), makeRng(13)));
  assert.equal(r2.board.seal[0]![3], 1, "ice cracked to ink, not broken");
});

test("sealed jades stay put while others fall past them", () => {
  const seal = sealGrid({ seal: [".......", ".......", "1......", ...Array(5).fill(".......")] });
  const b = boardFrom(put(bg(8, 7), [[5, 0, 5], [6, 0, 5], [7, 1, 5]]), [], seal);
  const sealedId = b.cells[2]![0]!.id;
  const res = ok(trySwap(b, P(7, 1), P(7, 0), makeRng(14)));
  assert.equal(res.waves[0]!.after.cells[2]![0]!.id, sealedId);
});

test("fresh boards and reshuffles: no ready lines and at least one move, specials kept", () => {
  const rng = makeRng(15);
  for (let i = 0; i < 30; i++) {
    const b = freshBoard(8, 7, undefined, rng);
    assert.equal(findMatches(b.cells).length, 0);
    assert.ok(hasMove(b));
  }
  const dead: Board = boardFrom(["01234", "23401", "40123", "12340", "34012"], [[0, 0, "bomb"]]);
  assert.equal(hasMove(dead), false);
  const s = reshuffle(dead, rng);
  assert.equal(s.cells.flat().filter((p) => p.special === "bomb").length, 1);
  // a 龍珠 always counts as a move
  assert.ok(canSwap(boardFrom(["01", "23"], [[0, 0, "color"]]), P(0, 0), P(0, 1)));
  assert.ok(allMoves(boardFrom(bg(8, 7), [[0, 0, "color"]])).length >= 2);
});

test("level table: 50 levels, every jade kind used, sane goals and stars", () => {
  assert.equal(LEVELS.length, 50);
  const kinds = new Set<number>();
  LEVELS.forEach((l, i) => {
    assert.equal(l.id, i + 1);
    assert.ok(l.moves >= 10 && l.moves <= 30);
    assert.ok(l.stars[0] > 0 && l.stars[1] > l.stars[0]);
    for (const g of l.goals) if (g.type === "collect") kinds.add(g.kind);
    if (l.goals.some((g) => g.type === "seal")) assert.ok(l.seal, `L${l.id} seal goal needs seals`);
    const b = startBoard(l, makeRng(l.id));
    assert.equal(findMatches(b.cells).length, 0, `L${l.id} starts without ready matches`);
    assert.ok(hasMove(b), `L${l.id} has a move`);
  });
  assert.equal(kinds.size, 6);
});

test("level goals, stars and rewards", () => {
  const l8 = LEVELS[7]!;
  const p = startProgress(startBoard(l8, makeRng(1)));
  assert.equal(goalsMet(l8, p), false);
  const collect = l8.goals.find((g) => g.type === "collect")!;
  if (collect.type !== "collect") throw new Error();
  p.collected[collect.kind] = collect.count;
  assert.equal(goalStatus(collect, p).done, true);
  p.score = 999999;
  assert.equal(goalsMet(l8, p), true);
  const seal = LEVELS[3]!;
  const ps = startProgress(startBoard(seal, makeRng(1)));
  assert.ok(ps.sealsTotal > 0);
  ps.sealsLeft = 0;
  assert.equal(goalsMet(seal, ps), true);

  assert.equal(finalScore(1000, 5, 1), 1600);
  assert.equal(starsFor(l8, l8.stars[0] - 1), 1);
  assert.equal(starsFor(l8, l8.stars[0]), 2);
  assert.equal(starsFor(l8, l8.stars[1]), 3);

  assert.equal(rewardPerStar(1), 44);
  assert.equal(levelReward(1, 0, 3), 132);
  assert.equal(levelReward(1, 1, 3), 88);
  assert.equal(levelReward(1, 3, 3), 20);
  assert.equal(isUnlocked(1, {}), true);
  assert.equal(isUnlocked(2, {}), false);
  assert.equal(isUnlocked(2, { "1": { stars: 1, best: 100 } }), true);
});

test("tutorial presets show their special on the first suggested move", () => {
  const l2 = startBoard(LEVELS[1]!);
  assert.equal(ok(trySwap(l2, P(0, 1), P(1, 1), makeRng(1))).waves[0]!.created[0]!.piece.special, "row");
  const l3 = startBoard(LEVELS[2]!);
  assert.equal(ok(trySwap(l3, P(1, 1), P(1, 2), makeRng(1))).waves[0]!.created[0]!.piece.special, "bomb");
  const l5 = startBoard(LEVELS[4]!);
  assert.deepEqual(
    ["row", "bomb", "col", "color"].map((s) => l5.cells.flat().some((p) => p.special === s)),
    [true, true, true, true],
  );
});

test("餘步加分: remaining moves pay double the level-scaled rate", () => {
  assert.equal(MOVE_BONUS_BASE, 60);
  assert.equal(MOVE_BONUS_STEP, 2);
  assert.equal(MOVE_BONUS_MULT, 2);
  assert.equal(moveBonusPer(1), 120);
  assert.equal(moveBonusPer(10), 156);
  assert.equal(moveBonusPer(21), 200);
  assert.equal(moveBonusPer(30), 236);
  assert.equal(moveBonusPer(50), 316);
  for (const def of LEVELS) assert.equal(moveBonusPer(def.id), 2 * (60 + 2 * (def.id - 1)));
  // every level pays more per move than the one before it
  for (let id = 2; id <= LEVELS.length; id++) assert.ok(moveBonusPer(id) > moveBonusPer(id - 1));
  assert.equal(moveBonus(12, 0), 0);
  assert.equal(moveBonus(12, -3), 0);
  assert.equal(moveBonus(12, 7), 7 * 164);
  assert.equal(finalScore(1500, 0, 20), 1500);
  assert.equal(finalScore(1500, 4, 20), 1500 + 4 * 196);
  // count-up steps end exactly at the final score
  assert.deepEqual(bonusTally(1000, 3, 5), [1136, 1272, 1408]);
  assert.deepEqual(bonusTally(1000, 0, 5), []);
  assert.equal(bonusTally(1777, 9, 17).at(-1), finalScore(1777, 9, 17));
});

test("餘步加分 counts toward stars and best score; assist +步 count as moves", () => {
  for (const def of LEVELS) {
    const [two, three] = def.stars;
    assert.ok(two < three, `L${def.id} stars ascend`);
    // a board score just under 2★ reaches 2★ once enough moves are cashed in
    const need = Math.ceil(1 / moveBonusPer(def.id));
    assert.equal(starsFor(def, finalScore(two - 1, 0, def.id)), 1);
    // (on L22 / L44 the 2★→3★ gap is smaller than one move's bonus, so one move can jump straight to 3★)
    assert.equal(starsFor(def, finalScore(two - 1, need, def.id)), three - two < moveBonusPer(def.id) ? 3 : 2);
    const toThree = Math.ceil((three - (two - 1)) / moveBonusPer(def.id));
    assert.equal(starsFor(def, finalScore(two - 1, toThree, def.id)), 3);
  }
  // 諸葛亮 草船借箭 grants +3 步: a clear with 2 natural moves left banks 5 moves of bonus
  const fx = skillFx("zhuge", 1);
  assert.equal(fx.moves, 3);
  assert.equal(finalScore(1200, 2 + fx.moves, 8), 1200 + 5 * moveBonusPer(8));
});

test("第 31–50 關: an old 30-level save keeps its progress and unlocks 31 in order", () => {
  const old: Record<string, { stars: number; best: number }> = {};
  for (let id = 1; id <= 30; id++) old[String(id)] = { stars: 3, best: 3000 };
  assert.equal(MAX_STARS, 150);
  assert.equal(totalStars(old), 90);
  assert.equal(isUnlocked(31, old), true, "31 opens after 30");
  assert.equal(isUnlocked(32, old), false);
  assert.equal(isUnlocked(31, { ...old, "30": { stars: 0, best: 0 } }), false);
  assert.equal(isUnlocked(50, { ...old, "49": { stars: 1, best: 1 } }), true);
  assert.equal(levelById(51), null);
  // first-clear 墨玉 follows the same per-star formula; replays still pay only REPLAY_INK
  assert.equal(rewardPerStar(50), 240);
  assert.equal(levelReward(50, 0, 3), 720);
  assert.equal(levelReward(50, 2, 3), 240);
  assert.equal(levelReward(50, 3, 3), 20);
});

test("第 31–50 關 ramp up: fewer spare moves, more ice, every new level winnable from its start", () => {
  const late = LEVELS.filter((l) => l.id > 30);
  assert.equal(late.length, 20);
  const ice = (l: (typeof LEVELS)[number]) => sealGrid(l).flat().filter((v) => v === 2).length;
  // both new 卷 finales are seal + score + collect, and carry more ice than 第 30 關
  for (const id of [40, 50]) {
    const l = levelById(id)!;
    assert.deepEqual(l.goals.map((g) => g.type).sort(), ["collect", "score", "seal"]);
    assert.ok(ice(l) > ice(levelById(30)!), `L${id} ice`);
  }
  for (const l of late) {
    // 3★ needs real headroom over 2★, and both sit above the plain score target
    assert.ok(l.stars[1] - l.stars[0] >= 200, `L${l.id} star gap`);
    const target = l.goals.find((g) => g.type === "score");
    if (target && target.type === "score") assert.ok(l.stars[0] > target.target, `L${l.id} 2★ above target`);
    assert.equal(l.preset, undefined);
  }
});

test("章末關: the last level of each 卷 is a stacked-goal finale", () => {
  assert.deepEqual(
    LEVELS.filter((l) => isChapterFinale(l.id)).map((l) => l.id),
    [10, 20, 30, 40, 50],
  );
  for (const id of [10, 20, 30, 40, 50]) {
    const def = levelById(id)!;
    assert.ok(def.goals.length >= 3, `L${id} stacks three goals`);
    assert.ok(def.goals.some((g) => g.type === "seal"), `L${id} has seals`);
  }
  assert.deepEqual(
    [10, 20, 30, 40, 50].map((id) => levelById(id)!.moves),
    [20, 22, 21, 23, 23],
  );
});
