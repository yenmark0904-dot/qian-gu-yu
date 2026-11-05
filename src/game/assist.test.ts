import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHARGE_BASE,
  ENERGY,
  NO_ASSIST,
  activateSkill,
  activationLabels,
  addEnergy,
  canActivate,
  chargeCost,
  chargeRatio,
  freshCharge,
  isFull,
  resolveAssist,
  spend,
  strongestOwned,
  waveEnergy,
} from "./assist.ts";
import { CHARACTERS } from "./data.ts";
import { freshBoard, hasMove, makeRng, sealsLeft } from "./match3.ts";
import { NO_FX, skillFx, skillStep } from "./skills.ts";

/** Fewest copies reaching a skill step (壹/貳/參). */
const copiesFor = (step: 0 | 1 | 2) => {
  let n = 1;
  while (skillStep(n) < step) n++;
  return n;
};

const roster = CHARACTERS.map((c) => ({ id: c.id, rarity: c.rarity }));
const rarity = (id: string) => CHARACTERS.find((c) => c.id === id)!.rarity;

test("assist: strongest owned is the default; NO_ASSIST opts out", () => {
  const owned = { machao: 3, sima: 1, baijuyi: 1 };
  const best = strongestOwned(roster, owned)!;
  assert.equal(rarity(best), "SS");
  assert.equal(resolveAssist(null, owned, roster), best);
  assert.equal(resolveAssist("machao", owned, roster), "machao");
  assert.equal(resolveAssist("qin", owned, roster), best, "a pick no longer owned falls back");
  assert.equal(resolveAssist(NO_ASSIST, owned, roster), null);
  assert.equal(resolveAssist(null, {}, roster), null);
});

test("assist: energy from a wave grows with size, specials and chains", () => {
  const p = (n: number) => Array.from({ length: n }, (_, i) => ({ r: 0, c: i }));
  const three = waveEnergy({ removed: p(3), effects: [], created: [] }, 0);
  assert.equal(three, 3 * ENERGY.jade);
  assert.ok(waveEnergy({ removed: p(5), effects: [], created: [] }, 0) > three);
  assert.ok(waveEnergy({ removed: p(3), effects: [{} as never], created: [] }, 0) > three);
  assert.ok(waveEnergy({ removed: p(3), effects: [], created: [{} as never] }, 0) > three);
  assert.equal(waveEnergy({ removed: p(3), effects: [], created: [] }, 2), three + 2 * ENERGY.chain);
});

test("assist: charge fills, clamps, gates and resets", () => {
  let c = freshCharge(20);
  assert.equal(isFull(c), false);
  assert.equal(canActivate(c, "play", skillFx("qin", 1), 5), false, "empty ring cannot fire");
  c = addEnergy(c, 8);
  assert.equal(c.energy, 8);
  assert.equal(chargeRatio(c), 0.4);
  c = addEnergy(c, 50);
  assert.equal(c.energy, 20, "clamped at cost");
  assert.ok(isFull(c));
  assert.equal(addEnergy(c, 5), c, "no-op once full");
  assert.equal(canActivate(c, "play", skillFx("qin", 1), 5), true);
  assert.equal(canActivate(c, "busy", skillFx("qin", 1), 5), false);
  assert.equal(canActivate(c, "play", skillFx("qin", 1), 0), false);
  assert.equal(canActivate(c, "play", null, 5), false);
  const after = spend(c);
  assert.deepEqual(after, { energy: 0, cost: 20, uses: 1 });
  assert.equal(isFull(after), false);
  const again = spend(addEnergy(after, 99));
  assert.equal(again.uses, 2, "usable many times per level");
  assert.equal(isFull(freshCharge(0)), false);
});

test("assist: charge cost by rarity and 緣分", () => {
  for (const r of ["R", "S", "SS", "SSR"] as const) {
    assert.equal(chargeCost(r, 1), CHARGE_BASE[r]);
    assert.ok(chargeCost(r, copiesFor(1)) < chargeCost(r, 1), `${r} 貳 charges faster`);
    assert.ok(chargeCost(r, copiesFor(2)) < chargeCost(r, copiesFor(1)), `${r} 參 charges faster`);
  }
  assert.ok(CHARGE_BASE.R < CHARGE_BASE.S && CHARGE_BASE.S < CHARGE_BASE.SS);
});

test("assist: activation applies strike, gifts, seals and moves", () => {
  const seal = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r < 2 ? 1 : 0)));
  const board = freshBoard(8, 8, seal, makeRng(7));
  const sweep = activateSkill(board, skillFx("qin", copiesFor(2)), makeRng(1));
  assert.ok(sweep.strike && sweep.strike.waves.length > 0, "qin sweeps");
  assert.equal(sweep.moves, 1);
  assert.ok(sweep.gifts.length >= 1);
  assert.ok(hasMove(sweep.board));
  const burn = activateSkill(board, skillFx("zhouyu", 1), makeRng(2));
  assert.ok(burn.strike, "zhouyu burns");
  assert.ok(sealsLeft(burn.board) < sealsLeft(board), "burning hits the sealed rows first");
  const gifts = activateSkill(board, skillFx("lanling", 1), makeRng(3));
  assert.equal(gifts.strike, null);
  assert.equal(gifts.gifts.length, 2);
  assert.ok(gifts.gifts.every((p) => gifts.board.cells[p.r]![p.c]!.special === "bomb"));
  const none = activateSkill(board, NO_FX, makeRng(4));
  assert.equal(none.gifts.length, 0);
  assert.equal(none.moves, 0);
  assert.deepEqual(activationLabels(skillFx("lanling", 1)), ["+1 步"]);
});
