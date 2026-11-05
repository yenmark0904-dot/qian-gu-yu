import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAPTERS,
  LEVELS,
  VOLUME_AWARD_INK,
  VOLUME_IDS,
  claimVolumeAward,
  cleanVolumeAwards,
  readyVolumes,
  volumeAwardReady,
  volumeStars,
  type LevelRecord,
} from "./levels.ts";

/** 3★ on every level of the given 卷 ids. */
function full(...volumes: number[]): Record<string, LevelRecord> {
  const m3: Record<string, LevelRecord> = {};
  for (const v of volumes) {
    const ch = CHAPTERS[v - 1];
    for (let id = ch.from; id <= ch.to; id++) m3[String(id)] = { stars: 3, best: 3000 };
  }
  return m3;
}

test("成就 · 卷滿: five 卷, each 10 levels × 3 = 30★, counted on its own levels only", () => {
  assert.equal(VOLUME_AWARD_INK, 2000);
  assert.deepEqual(VOLUME_IDS, [1, 2, 3, 4, 5]);
  assert.equal(LEVELS.length, 50);
  assert.deepEqual(CHAPTERS.map((c) => [c.from, c.to]), [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50]]);
  assert.deepEqual(CHAPTERS.slice(3).map((c) => c.name), ["卷四 · 紫闕", "卷五 · 玉京"]);
  for (const v of VOLUME_IDS) assert.equal(volumeStars({}, v).max, 30);
  assert.deepEqual(volumeStars(full(1), 1), { got: 30, max: 30 });
  assert.deepEqual(volumeStars(full(1), 2), { got: 0, max: 30 }, "卷一 stars don't count toward 卷二");
  assert.deepEqual(volumeStars({ ...full(2), "15": { stars: 9, best: 1 } }, 2), { got: 30, max: 30 }, "capped at 3 per level");
  assert.deepEqual(volumeStars(full(1), 9), { got: 0, max: 0 }, "unknown 卷");
  const almost = full(1);
  almost["10"] = { stars: 2, best: 2000 };
  assert.equal(volumeStars(almost, 1).got, 29);
  assert.equal(volumeAwardReady(almost, [], 1), false);
  assert.equal(volumeAwardReady(full(1), [], 1), true);
  assert.equal(volumeAwardReady(full(1), [1], 1), false);
  assert.deepEqual(readyVolumes(full(1, 3), []), [1, 3]);
  assert.deepEqual(readyVolumes(full(1, 3), [1]), [3]);
});

test("成就 · 卷滿 pays 2000 墨玉 once per 卷", () => {
  let state = { ink: 100, m3: full(1, 2), volumeAwards: [] as number[] };
  assert.equal(claimVolumeAward(state, 3).paid, 0, "卷三 not full");
  assert.equal(claimVolumeAward(state, 7).paid, 0, "no such 卷");

  const one = claimVolumeAward(state, 1);
  assert.deepEqual(one, { ink: 2100, volumeAwards: [1], paid: 2000 });
  state = { ...state, ink: one.ink, volumeAwards: one.volumeAwards };
  for (let i = 0; i < 3; i++) {
    const again = claimVolumeAward(state, 1);
    assert.equal(again.paid, 0, "卷一 never pays twice");
    assert.equal(again.ink, 2100);
  }
  const two = claimVolumeAward(state, 2);
  assert.deepEqual(two, { ink: 4100, volumeAwards: [1, 2], paid: 2000 }, "卷二 pays independently");
  state = { ...state, ink: two.ink, volumeAwards: two.volumeAwards };
  assert.equal(claimVolumeAward(state, 2).paid, 0);
  assert.equal(claimVolumeAward(state, 1).paid, 0);
});

test("claimed 卷 ids are cleaned: junk dropped, duplicates collapsed", () => {
  assert.deepEqual(cleanVolumeAwards(undefined), []);
  assert.deepEqual(cleanVolumeAwards("1"), []);
  assert.deepEqual(cleanVolumeAwards([3, "1", 1, 0, 6, -1, null, "x", 5]), [1, 3, 5]);
  // a save that says 卷一 is claimed twice still can't be paid again
  assert.equal(claimVolumeAward({ ink: 0, m3: full(1), volumeAwards: [1, 1] }, 1).paid, 0);
});

test("卷四 · 紫闕 and 卷五 · 玉京 pay 2000 墨玉 once each, on their own levels", () => {
  assert.deepEqual(volumeStars(full(4), 4), { got: 30, max: 30 });
  assert.deepEqual(volumeStars(full(1, 2, 3), 4), { got: 0, max: 30 }, "卷一–卷三 stars don't count toward 卷四");
  assert.deepEqual(volumeStars(full(4), 5), { got: 0, max: 30 });
  const almost = full(5);
  almost["50"] = { stars: 2, best: 3000 };
  assert.equal(volumeAwardReady(almost, [], 5), false);
  // an old save that already claimed 卷一–卷三 keeps those claims and can still earn 卷四/卷五
  let state = { ink: 0, m3: full(1, 2, 3, 4, 5), volumeAwards: [1, 2, 3] };
  assert.deepEqual(readyVolumes(state.m3, state.volumeAwards), [4, 5]);
  const four = claimVolumeAward(state, 4);
  assert.deepEqual(four, { ink: 2000, volumeAwards: [1, 2, 3, 4], paid: 2000 });
  state = { ...state, ink: four.ink, volumeAwards: four.volumeAwards };
  assert.equal(claimVolumeAward(state, 4).paid, 0, "卷四 never pays twice");
  const five = claimVolumeAward(state, 5);
  assert.deepEqual(five, { ink: 4000, volumeAwards: [1, 2, 3, 4, 5], paid: 2000 });
  assert.equal(claimVolumeAward({ ...state, ink: five.ink, volumeAwards: five.volumeAwards }, 5).paid, 0);
});
