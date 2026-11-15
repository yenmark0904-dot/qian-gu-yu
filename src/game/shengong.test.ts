import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_SUBMIT_GAP_MS,
  RANKS,
  applySubmission,
  boardScore,
  claimRankRewards,
  cleanNickname,
  difficulty,
  floorDef,
  rankForFloor,
  rankIndexForFloor,
  scoreBounds,
  sealCells,
  validateSubmission,
} from "./shengong.ts";

test("rank mapping: one Tang title per 10 floors, 皇后 from 81 forever", () => {
  const expect: [number, string][] = [
    [0, "采女"], [1, "采女"], [10, "采女"], [11, "御女"], [20, "御女"], [21, "寶林"], [31, "才人"], [41, "美人"],
    [50, "美人"], [51, "婕妤"], [61, "昭儀"], [71, "貴妃"], [80, "貴妃"], [81, "皇后"], [500, "皇后"], [100000, "皇后"],
  ];
  for (const [f, name] of expect) assert.equal(rankForFloor(f).name, name, `floor ${f}`);
  assert.equal(rankIndexForFloor(-5), 0);
  assert.deepEqual(RANKS.map((r) => r.reward), [0, 600, 1000, 1600, 2400, 3200, 4000, 5000, 6000]);
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i]!.reward > RANKS[i - 1]!.reward, "higher ranks give more");
});

test("difficulty never gets easier and stays within beatable caps", () => {
  let prev = difficulty(1);
  for (let f = 2; f <= 300; f++) {
    const d = difficulty(f);
    assert.ok(d.moves <= prev.moves, `moves floor ${f}`);
    assert.ok(d.seals >= prev.seals && d.ice >= prev.ice && d.collect >= prev.collect && d.kinds >= prev.kinds && d.score >= prev.score, `floor ${f}`);
    assert.ok(d.moves >= 16 && d.seals <= 18 && d.ice <= 8 && d.collect <= 18 && d.score <= 2400);
    prev = d;
  }
  assert.ok(difficulty(1).moves > difficulty(100).moves, "the curve actually rises");
});

test("floor defs are valid, deterministic and use the curve", () => {
  for (let f = 1; f <= 120; f++) {
    const def = floorDef(f);
    assert.deepEqual(def, floorDef(f));
    assert.equal(def.id, f);
    assert.equal(def.moves, difficulty(f).moves);
    assert.ok(def.goals.length >= 1);
    if (def.goals.some((g) => g.type === "seal")) {
      assert.equal(def.seal!.length, 8);
      assert.ok(def.seal!.every((row) => row.length === 7 && /^[.12]+$/.test(row)));
      assert.ok(sealCells(def.seal) >= 2 && sealCells(def.seal) <= difficulty(f).seals);
    }
    for (const g of def.goals) {
      if (g.type === "collect") assert.ok(g.count <= 18 && g.kind >= 0 && g.kind < 6);
      if (g.type === "score") assert.ok(g.target <= 2400);
    }
  }
  assert.equal(floorDef(10).goals.length, 3, "every 10th floor is a stacked 晉封試煉");
});

test("one-time rank rewards: each title pays once, never per floor", () => {
  let paid: number[] = [];
  let ink = 0;
  for (let f = 1; f <= 100; f++) {
    const c = claimRankRewards(f, paid);
    ink += c.ink;
    if (f === 11) assert.deepEqual([c.ranks, c.ink], [[1], 600]);
    else if (f === 81) assert.deepEqual([c.ranks, c.ink], [[8], 6000]);
    else if ((f - 1) % 10 !== 0 || f === 1) assert.equal(c.ink, 0, `floor ${f} pays nothing`);
    paid = c.paid;
  }
  assert.equal(ink, 23800);
  // Claiming again (replay, refresh, duplicate submission) never pays.
  assert.deepEqual(claimRankRewards(100, paid), { paid, ink: 0, ranks: [] });
  assert.equal(claimRankRewards(11, [1]).ink, 0);
  // Skipped titles (e.g. restored save) are each paid once.
  assert.deepEqual(claimRankRewards(25, []), { paid: [1, 2], ink: 1600, ranks: [1, 2] });
  // Junk paid lists are cleaned, never trusted to pay more.
  assert.deepEqual(claimRankRewards(5, [1, 2, "x", 99] as unknown as number[]).paid, []);
});

test("server records rank rewards once per device", () => {
  const now = 1_000_000;
  let rec = null as ReturnType<typeof applySubmission>["record"] | null;
  let total = 0;
  for (let f = 1; f <= 21; f++) {
    const score = scoreBounds(f).min;
    const r = applySubmission(rec, { deviceId: "device-abc", floor: f, score }, now + f * 10_000);
    total += r.ink;
    rec = r.record;
  }
  assert.equal(total, 1600);
  assert.deepEqual(rec!.ranksPaid, [1, 2]);
  assert.equal(rec!.floor, 21);
});

test("submission validation: sequential floors, plausible scores, rate limit", () => {
  const now = 10_000_000;
  const ok = (floor: number) => scoreBounds(floor).min + 100;
  assert.equal(validateSubmission(null, { deviceId: "device-123", floor: 1, score: ok(1) }, now).ok, true);
  const skip = validateSubmission(null, { deviceId: "device-123", floor: 2, score: ok(2) }, now);
  assert.deepEqual(skip, { ok: false, error: "sequence", expected: 1 });
  const prev = { floor: 4, updatedAt: now - 60_000 };
  assert.equal(validateSubmission(prev, { deviceId: "device-123", floor: 5, score: ok(5) }, now).ok, true);
  assert.equal((validateSubmission(prev, { deviceId: "device-123", floor: 4, score: ok(4) }, now) as { error: string }).error, "sequence");
  assert.equal((validateSubmission(prev, { deviceId: "device-123", floor: 6, score: ok(6) }, now) as { error: string }).error, "sequence");
  assert.equal((validateSubmission(prev, { deviceId: "device-123", floor: 5, score: scoreBounds(5).max + 1 }, now) as { error: string }).error, "score");
  assert.equal((validateSubmission(prev, { deviceId: "device-123", floor: 5, score: 0 }, now) as { error: string }).error, "score");
  const fast = { floor: 4, updatedAt: now - MIN_SUBMIT_GAP_MS + 1 };
  assert.equal((validateSubmission(fast, { deviceId: "device-123", floor: 5, score: ok(5) }, now) as { error: string }).error, "rate_limited");
  for (const bad of [null, "x", { deviceId: "short", floor: 1, score: 1000 }, { deviceId: "device-123", floor: 1.5, score: 1000 }, { deviceId: "device-123", floor: 1, score: -1 }, { deviceId: "dev<script>", floor: 1, score: 1000 }]) {
    assert.equal((validateSubmission(null, bad, now) as { error: string }).error, "invalid");
  }
  // The old score goal is not a clear gate; only the structural min-30 check remains.
  assert.equal(scoreBounds(1).min, 30);
});

test("nicknames: trimmed, 2–12 chars, tags and profanity removed", () => {
  assert.equal(cleanNickname("  小桂子  "), "小桂子");
  assert.equal(cleanNickname("<b>武媚娘</b>"), "武媚娘");
  assert.equal(cleanNickname("a"), null);
  assert.equal(cleanNickname("一二三四五六七八九十一二三"), null);
  assert.equal(cleanNickname("一二三四五六七八九十一二"), "一二三四五六七八九十一二");
  assert.equal(cleanNickname("  a   b  "), "a b");
  assert.equal(cleanNickname("fuck"), null, "all-masked names are rejected");
  assert.equal(cleanNickname("幹你娘娘"), "＊＊娘娘");
  assert.equal(cleanNickname('"&\'`'), null);
  assert.equal(cleanNickname("A\u0000B\u202EC"), "ABC");
  assert.equal(cleanNickname(42), null);
});

test("leaderboard key: floor first, cumulative score breaks ties", () => {
  assert.ok(boardScore(12, 0) > boardScore(11, 9_999_999));
  assert.ok(boardScore(12, 5000) > boardScore(12, 4999));
});


test("HP-clear submissions below former score goals are accepted, structural and maximum bounds remain", () => {
  const now = 10_000_000;
  for (const floor of [1, 5, 10, 41]) {
    const def = floorDef(floor);
    const goal = def.goals.find((g) => g.type === "score");
    assert.ok(goal && goal.target > 100);
    assert.equal(scoreBounds(floor).min, 30);
    const moves = def.moves + 12;
    assert.equal(scoreBounds(floor).max, moves * 1500 + moves * 2 * (60 + 2 * (floor - 1)));
    const prev = floor === 1 ? null : { floor: floor - 1, updatedAt: now - MIN_SUBMIT_GAP_MS };
    for (const score of [30, 50, 100, scoreBounds(floor).max]) {
      assert.equal(validateSubmission(prev, { deviceId: "device-low", floor, score }, now).ok, true);
    }
    for (const score of [0, 29, scoreBounds(floor).max + 1]) {
      assert.deepEqual(validateSubmission(prev, { deviceId: "device-low", floor, score }, now), { ok: false, error: "score" });
    }
    assert.deepEqual(validateSubmission(prev, { deviceId: "device-low", floor, score: 50.5 }, now), { ok: false, error: "invalid" });
  }
});

test("low-score clear preserves historical total/nickname/paid ranks and cannot replay rewards", () => {
  const now = 10_000_000;
  const prev = { deviceId: "device-old", nickname: "舊名號", floor: 40, total: 123456, lastScore: 2400, ranksPaid: [1, 2, 3], updatedAt: now - MIN_SUBMIT_GAP_MS };
  const original = structuredClone(prev);
  const input = { deviceId: prev.deviceId, floor: 41, score: 50 };
  assert.equal(validateSubmission(prev, input, now).ok, true);
  const applied = applySubmission(prev, input, now);
  assert.equal(applied.record.total, prev.total + 50);
  assert.equal(applied.record.nickname, prev.nickname);
  assert.deepEqual(applied.record.ranksPaid, [1, 2, 3, 4]);
  assert.equal(applied.ink, 2400);
  assert.deepEqual(prev, original, "old record is not mutated");
  assert.deepEqual(validateSubmission(applied.record, input, now + MIN_SUBMIT_GAP_MS), { ok: false, error: "sequence", expected: 42 });
  assert.equal(claimRankRewards(41, applied.record.ranksPaid).ink, 0);
  const next = applySubmission(applied.record, { ...input, floor: 42 }, now + MIN_SUBMIT_GAP_MS);
  assert.equal(next.ink, 0);
  assert.deepEqual(next.record.ranksPaid, applied.record.ranksPaid);
});
