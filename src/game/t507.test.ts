import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEVELS } from "./levels.ts";
import { floorDef } from "./shengong.ts";
import { makeRng, freshBoard } from "./match3.ts";
import * as A from "./combat.ts";

/** t507 兩項戰鬥修復（t516 併入正式版）：連消波次索引、得分倍率不進傷害。 */
const wave = (n: number, eff = 0, seals = 0) => ({
  removed: Array.from({ length: n }, (_, i) => ({ r: 0, c: i })),
  effects: Array.from({ length: eff }, () => ({ type: "row", r: 0, c: 0 }) as const),
  sealHits: Array.from({ length: seals }, (_, i) => ({ r: 1, c: i })),
  collected: [n, 0, 0, 0, 0, 0],
});
const big = { ...A.enemyForLevel(LEVELS[5]!), shield: 0 };
const e0 = () => ({ ...A.startEnemy(big), shield: 0 });
// The Match3 playWave call site after the fix: one wave at a time, real index, damage mult 1.
const hit = (w: ReturnType<typeof wave>, i: number) => A.hitWithWaves(big, e0(), [w], 1, i).hits[0]!;

test("t507-1 wave 0 unchanged; later waves get the cascade bonus (×1.25 steps, cap ×3)", () => {
  const w = wave(4, 1, 1);
  assert.equal(hit(w, 0), A.hitWithWaves(big, e0(), [w]).hits[0]); // default startIndex 0 = old first wave
  const base = 4 * A.COMBAT.jadeDamage;
  const extra = w.effects.length * A.COMBAT.specialDamage + w.sealHits.length * A.COMBAT.sealDamage;
  [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3, 3].forEach((c, i) => assert.equal(hit(w, i), Math.round(base * c + extra), `idx ${i}`));
  // a multi-wave call with startIndex continues the same numbering
  assert.deepEqual(A.hitWithWaves(big, e0(), [w, w], 1, 2).hits, [hit(w, 2), hit(w, 3)]);
  assert.equal(A.waveDamage(big, w, 2), hit(w, 2));
});

test("t507-2 Match3 passes the real wave index and damage mult 1 (score keeps fx.mult)", () => {
  const src = readFileSync(new URL("../components/game/Match3.tsx", import.meta.url), "utf8");
  assert.match(src, /hitWithWaves\(enemyDef, enemyRef\.current, \[w\], 1, index, w\.after\)/);
  assert.doesNotMatch(src, /hitWithWaves\([^)]*fxRef\.current\.mult/);
  assert.match(src, /const gained = Math\.round\(w\.score \* fxRef\.current\.mult\)/);
  const w = wave(5);
  for (const i of [0, 1, 3]) assert.equal(A.hitWithWaves(big, e0(), [w], 1, i).hits[0], hit(w, i));
});

test("t507-3 skillHit / comboHit formulas unchanged", () => {
  for (const c of [0, 2, 5]) assert.equal(A.skillHit(big, e0(), c).dealt, Math.min(big.hp, Math.round(90 + big.hp * 0.05 + c * 24)));
  assert.ok(A.comboHit(big, e0(), "trio").dealt > 0);
});

test("t507-4 seeded fights (主線 + 深宮): no negatives, terminate, win only at enemy HP 0", () => {
  const defs = [A.enemyForLevel(LEVELS[0]!), A.enemyForLevel(LEVELS[9]!), A.enemyForFloor(10, floorDef(10)), A.enemyForFloor(30, floorDef(30))];
  for (const def of defs)
    for (const seed of [1, 7, 42, 2026]) {
      const rng = makeRng(seed);
      let s = A.startEnemy(def);
      let board = freshBoard(8, 7, undefined, rng);
      let turns = 0;
      while (!s.defeated && turns < 500) {
        const n = 1 + Math.floor(rng() * 4);
        for (let i = 0; i < n && !s.defeated; i++) s = A.hitWithWaves(def, s, [wave(3 + Math.floor(rng() * 4))], 1, i).state;
        assert.ok(s.hp >= 0 && s.shield >= 0 && s.damage >= 0);
        assert.equal(A.fightOutcome({ defeated: s.defeated, hp: 100 }), s.defeated ? "win" : null);
        if (!s.defeated) {
          const t = A.enemyTurn(def, s, board, rng);
          s = t.state;
          board = t.board;
        }
        turns++;
      }
      assert.ok(s.defeated && s.hp === 0, `seed ${seed} turns ${turns}`);
    }
});
