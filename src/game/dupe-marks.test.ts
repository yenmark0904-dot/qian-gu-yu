import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHARACTERS } from "./data.ts";
import { DUP_REFUND, COST_ONE } from "./logic.ts";
import { MARK_OVERFLOW, MARK_TRICKLE, dupOutcome } from "./bond.ts";

test("DUP_REFUND is zero for every rarity — duplicates never mint 墨玉", () => {
  assert.deepEqual(DUP_REFUND, { R: 0, S: 0, SS: 0, SSR: 0 });
  for (const r of ["R", "S", "SS", "SSR"] as const) {
    assert.equal(DUP_REFUND[r], 0);
    assert.ok(MARK_TRICKLE[r] > 0, `${r} trickle`);
    assert.ok(MARK_OVERFLOW[r] > 0, `${r} overflow`);
  }
});

test("store.pull credits marks on dupes and never adds DUP_REFUND to ink", () => {
  // store.pull settles through pull-settle.ts (shared by 墨玉 / 召喚券 / 今日免費召喚).
  const storeSrc =
    readFileSync(new URL("./store.ts", import.meta.url), "utf8") +
    readFileSync(new URL("./pull-settle.ts", import.meta.url), "utf8");
  assert.ok(storeSrc.includes("marks += bond.marks"), "pull banks 墨痕");
  assert.ok(!storeSrc.includes("ink += refund + tier.ink"), "pull must not add refund into ink");
  assert.ok(storeSrc.includes("ink += tier.ink"), "pull still pays tier-up 墨玉");
  const results = readFileSync(new URL("../components/game/Results.tsx", import.meta.url), "utf8");
  assert.ok(results.includes("重逢化墨痕"), "results show 墨痕 for dupes");
  assert.ok(!results.includes("重逢化墨 <MoYu"), "results must not show 墨玉 refund");
  const rates = readFileSync(new URL("../components/game/Rates.tsx", import.meta.url), "utf8");
  assert.ok(rates.includes("重複的人會化成墨痕"), "Rates copy updated");
  assert.ok(!rates.includes("重複的人會化成少量墨玉"), "old Rates 墨玉 copy gone");
});

test("a duplicate outcome yields marks and zero 墨玉 refund for every rarity", () => {
  // Simulate the store path for an already-owned copy (prev=1 → 2nd copy).
  for (const r of ["R", "S", "SS", "SSR"] as const) {
    const bond = dupOutcome(r, 1);
    assert.equal(DUP_REFUND[r], 0);
    assert.equal(bond.marks, MARK_TRICKLE[r]);
    assert.equal(bond.overflow, false);
  }
  // After max bond, overflow marks still apply and refund stays 0.
  for (const r of ["R", "S", "SS", "SSR"] as const) {
    const bond = dupOutcome(r, 31); // tier 6 already
    assert.equal(bond.overflow, true);
    assert.equal(bond.marks, MARK_OVERFLOW[r]);
    assert.equal(DUP_REFUND[r], 0);
  }
  assert.ok(CHARACTERS.length > 0);
  assert.ok(COST_ONE > 0);
});
