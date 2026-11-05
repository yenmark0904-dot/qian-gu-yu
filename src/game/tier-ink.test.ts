import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bondLevel, dupOutcome, MAX_BOND, tierRewards } from "./bond.ts";
import { payTierUp, settleTierPaid, TIER_UP_INK } from "./logic.ts";

/** Drive copies 1..n through the same path store.pull uses. */
function drawCopies(n: number, paid: Record<string, number> = {}, id = "qin", from = 0) {
  let ink = 0;
  const perCopy: number[] = [];
  for (let prev = from; prev < n; prev++) {
    const b = dupOutcome("SSR", prev);
    const t = payTierUp(paid, id, b.prevLevel, b.level);
    paid = t.paid;
    ink += t.ink;
    perCopy.push(t.ink);
    if (t.ink > 0) assert.ok(b.levelUp, `copy ${prev + 1} pays only on a tier-up`);
  }
  return { ink, paid, perCopy };
}

test("tier-up 墨玉: +500 at each of tiers 1–6, exactly on the copy that raises the tier", () => {
  assert.equal(TIER_UP_INK, 500);
  const { ink, paid, perCopy } = drawCopies(60);
  assert.equal(ink, 6 * 500);
  assert.equal(paid.qin, MAX_BOND);
  const payingCopies = perCopy.flatMap((v, i) => (v > 0 ? [i + 1] : []));
  assert.deepEqual(payingCopies, [6, 11, 16, 21, 26, 31]);
  for (const c of payingCopies) assert.equal(bondLevel(c), bondLevel(c - 1) + 1);
  for (const r of ["R", "S", "SS", "SSR"] as const) {
    const t = payTierUp({}, "x", dupOutcome(r, 5).prevLevel, dupOutcome(r, 5).level);
    assert.equal(t.ink, 500, r);
  }
});

test("tier-up 墨玉: idempotent — never paid twice for the same tier per character", () => {
  const first = drawCopies(11);
  assert.equal(first.ink, 1000);
  // a cloud restore lowers copies to 3, then they are drawn again: tiers 1–2 do not pay again
  const again = drawCopies(16, first.paid, "qin", 3);
  assert.equal(again.ink, 500, "only tier 3 is new");
  // replaying the same tier-up (e.g. a re-run after reload) pays 0
  assert.equal(payTierUp(again.paid, "qin", 2, 3).ink, 0);
  // per character: another character still gets its own tiers
  assert.equal(payTierUp(again.paid, "libai", 0, 1).ink, 500);
});

test("tier-up 墨玉: existing saves are settled without back-pay; junk is dropped; settling is idempotent", () => {
  const owned = { qin: 16, libai: 1, baijuyi: 40 };
  const settled = settleTierPaid(owned, undefined);
  assert.deepEqual(settled, { qin: 3, baijuyi: 6 });
  assert.deepEqual(settleTierPaid(owned, settled), settled);
  assert.deepEqual(settleTierPaid(owned, { qin: 5, bad: "x", neg: -1, big: 99 }), { qin: 5, big: 6, baijuyi: 6 });
  // the next tier-up after settling pays only the new tier
  assert.equal(payTierUp(settled, "qin", 3, 4).ink, 500);
  assert.equal(payTierUp(settled, "baijuyi", 6, 6).ink, 0);
  // even with no mark, tiers at or below the previous level never pay
  assert.equal(payTierUp({}, "qin", 3, 3).ink, 0);
  assert.equal(payTierUp({}, "qin", 3, 4).ink, 500);
});

test("tier-up 墨玉: every tier in tierRewards lists 墨玉 ×500 (tiers 1 and 5 no longer empty)", () => {
  for (const r of ["SSR", "SS", "S", "R"] as const) {
    const rows = tierRewards(r);
    assert.equal(rows.length, 6);
    for (const row of rows) assert.equal(row.items[0], "墨玉 ×500", `${r} tier ${row.tier}`);
    assert.ok(rows[0]!.items.length >= 1 && rows[4]!.items.length >= 1);
  }
});

test("tier-up 墨玉: store wiring and feedback", () => {
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.ok(store.includes("payTierUp(tierInkPaid, character.id, bond.prevLevel, bond.level)"), "pull pays tier-ups");
  assert.ok(store.includes("tierInkPaid: settleTierPaid(p.owned, p.tierInkPaid)"), "merge settles old saves");
  const results = readFileSync(new URL("../components/game/Results.tsx", import.meta.url), "utf8");
  assert.ok(results.includes("墨玉 +{current.tierInk}"));
});
