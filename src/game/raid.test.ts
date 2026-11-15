import assert from "node:assert/strict";
import { test } from "node:test";
import { allMoves, freshBoard, hasMove, makeRng, seedSpecials } from "./match3.ts";
import {
  RAID_BOSSES,
  RAID_RULES,
  bossAttack,
  cleanRaid,
  cleanRaidTeam,
  emptyRaid,
  ensureRaidMove,
  mergeRaid,
  raidSkill,
  raidSwap,
  recordRaidWin,
  startRaid,
  waveDamage,
} from "./raid.ts";
import { skillFx } from "./skills.ts";
import { sanitizeSnapshot, SNAPSHOT_KEYS } from "./cloud-save.ts";
const boss = RAID_BOSSES[0]!;
const owned = { qin: 1, libai: 1, machao: 1, sima: 1, zhouyu: 1, wangwei: 1 };
const ready = (ids = ["qin", "libai", "machao"]) => {
  const s = startRaid(boss, ids, owned, makeRng(1));
  return { ...s, fighters: s.fighters.map((f) => ({ ...f, energy: f.cost })) };
};
test("raid supports 1/2/3 different owned fighters, never gated by art", () => {
  for (let n = 1; n <= 3; n++) {
    const s = startRaid(boss, ["qin", "libai", "machao"].slice(0, n), owned, makeRng(n));
    assert.equal(s.fighters.length, n);
    assert.equal(s.board.rows, 8);
    assert.equal(s.board.cols, 7);
    assert.ok(hasMove(s.board));
    assert.equal(s.hp, 5000);
    assert.equal(s.moves, 20);
  }
  assert.deepEqual(cleanRaidTeam(["qin", "qin", "nalan", "unknown", "machao"], owned), [
    "qin",
    "machao",
  ]);
  assert.throws(() => startRaid(boss, [], owned));
});
test("only successful player moves charge all bars independently; skills never charge teammates", () => {
  const rng = makeRng(2);
  const s = ready();
  const fired = raidSkill(s, "qin", boss, 1000, rng).state;
  assert.equal(fired.fighters[0]!.energy, 0);
  assert.equal(fired.fighters[1]!.energy, s.fighters[1]!.energy);
  assert.equal(fired.moves, s.moves);
  assert.equal(raidSkill(fired, "qin", boss, 1100, rng).state, fired);
  const [a, b] = allMoves(fired.board)[0]!;
  const next = raidSwap(fired, a, b, boss, rng).state;
  assert.ok(
    next.fighters[0]!.energy > 0 && next.fighters[0]!.energy <= RAID_RULES.energyPerMoveCap,
  );
  assert.equal(next.fighters[1]!.energy, next.fighters[1]!.cost);
  const invalid = raidSwap(next, { r: 0, c: 0 }, { r: 7, c: 6 }, boss, rng);
  assert.equal(invalid.state, next);
  assert.equal(invalid.events.length, 0);
});
test("duo/trio require distinct ids inside configurable time and move windows, any rarity", () => {
  let s = ready();
  s = raidSkill(s, "qin", boss, 1000, makeRng(3)).state;
  const duo = raidSkill(s, "libai", boss, 1500, makeRng(4));
  assert.ok(duo.events.some((e) => e.kind === "duo"));
  const trio = raidSkill(duo.state, "machao", boss, 2000, makeRng(5));
  assert.ok(trio.events.some((e) => e.kind === "trio"));
  const expired = raidSkill(s, "libai", boss, 1001 + RAID_RULES.comboWindowMs);
  assert.ok(!expired.events.some((e) => e.kind === "duo"));
  const moved = raidSkill({ ...s, turns: 3 }, "libai", boss, 1600);
  assert.ok(!moved.events.some((e) => e.kind === "duo"));
  const repeated = raidSkill(
    { ...s, fighters: s.fighters.map((f) => ({ ...f, energy: f.cost })) },
    "qin",
    boss,
    1700,
  );
  assert.deepEqual(repeated.state.chain.ids, ["qin"]);
});
test("repeated persistent buffs do not stack; bonus move cap guarantees a finite fight", () => {
  let s = ready(["libai", "wangwei"]);
  for (let i = 0; i < 30; i++) {
    s = { ...s, hp: 100000, fighters: s.fighters.map((f) => ({ ...f, energy: f.cost })) };
    s = raidSkill(s, i % 2 ? "libai" : "wangwei", boss, i * 1000).state;
  }
  assert.equal(s.buff, Math.max(skillFx("libai", 1)!.mult, skillFx("wangwei", 1)!.mult));
  assert.equal(s.bonusMoves, RAID_RULES.bonusMovesCap);
  assert.equal(s.moves, boss.moves + RAID_RULES.bonusMovesCap);
});
test("HP damage is independent of level score; specials, cascades, seals and shields apply", () => {
  const wave = { removed: [{ r: 0, c: 0 }], effects: [], sealHits: [] };
  const normal = waveDamage(wave, 0);
  assert.equal(normal, RAID_RULES.jadeDamage);
  assert.ok(
    waveDamage({ ...wave, effects: [{ type: "bomb", r: 0, c: 0, radius: 1 }] }, 0) > normal,
  );
  assert.ok(waveDamage({ ...wave, sealHits: [{ r: 1, c: 1 }] }, 0) > normal);
  assert.ok(waveDamage(wave, 2, 1.1) > normal);
  const s = ready(["machao"]);
  const res = raidSkill({ ...s, hp: 10, shield: 0 }, "machao", boss, 1);
  assert.equal(res.state.hp, 0);
  assert.equal(res.state.status, "won");
  assert.equal(raidSkill(res.state, "machao", boss, 2).state, res.state);
  const shielded = raidSkill({ ...s, shield: 999 }, "machao", boss, 1);
  assert.equal(shielded.state.hp, s.hp);
  assert.ok(shielded.state.shield < 999);
});
test("boss attacks every three successful moves, phase 2 ice, bounded seals, no softlock", () => {
  let s = startRaid(boss, ["machao"], owned, makeRng(17));
  const rng = makeRng(18);
  for (let i = 0; i < 3; i++) {
    const [a, b] = allMoves(s.board)[0]!;
    s = raidSwap(s, a, b, boss, rng).state;
  }
  assert.equal(s.turns, 3);
  assert.ok(s.shield > 0);
  assert.ok(s.board.seal.flat().some((v) => v === 1));
  s = bossAttack({ ...s, hp: 2499 }, boss, rng);
  assert.equal(s.phase, 2);
  assert.ok(s.board.seal.flat().some((v) => v === 2));
  for (let i = 0; i < 15; i++) s = bossAttack(s, boss, rng);
  assert.ok(s.board.seal.flat().filter(Boolean).length <= RAID_RULES.sealCap);
  assert.ok(hasMove(s.board));
  const blocked = freshBoard(8, 7, undefined, rng);
  blocked.seal = blocked.seal.map((row) => row.map(() => 2));
  assert.ok(hasMove(ensureRaidMove(blocked, rng)));
});
test("special jade swaps damage boss, lose on final move, win has priority, retry is fresh/free", () => {
  const s = startRaid(boss, ["sima"], owned, makeRng(8));
  const rng = makeRng(9);
  const board = seedSpecials(s.board, { color: 1 }, rng);
  const color = board.cells
    .flatMap((row, r) => row.map((p, c) => ({ p, r, c })))
    .find((x) => x.p.special === "color")!;
  const a = { r: color.r, c: color.c };
  const b = { r: color.r, c: color.c === 6 ? 5 : color.c + 1 };
  const res = raidSwap({ ...s, board }, a, b, boss, rng);
  assert.ok(res.events.some((e) => e.kind === "special"));
  assert.ok(res.state.hp < boss.hp);
  const [x, y] = allMoves(s.board)[0]!;
  assert.equal(raidSwap({ ...s, moves: 1, hp: 100000 }, x, y, boss, rng).state.status, "lost");
  assert.equal(raidSwap({ ...s, moves: 1, hp: 1 }, x, y, boss, rng).state.status, "won");
  const fresh = startRaid(boss, ["sima"], owned, rng);
  assert.equal(fresh.moves, 20);
  assert.equal(fresh.hp, 5000);
  assert.equal(fresh.fighters[0]!.energy, 0);
});
test("first win reward is atomic/idempotent, team and ledger survive old/cloud saves", () => {
  const first = recordRaidWin(emptyRaid(), boss, 4);
  assert.equal(first.reward, boss.reward);
  assert.equal(recordRaidWin(first.raid, boss, 5).reward, 0);
  const cleaned = cleanRaid(
    { team: ["qin", "qin", "missing"], records: first.raid.records },
    owned,
  );
  assert.deepEqual(cleaned.team, ["qin"]);
  assert.deepEqual(cleanRaid(undefined, owned), emptyRaid());
  assert.equal(mergeRaid(first.raid, emptyRaid()).records[boss.id]!.rewardClaimed, true);
  assert.ok(SNAPSHOT_KEYS.includes("raid"));
  const snapshot = sanitizeSnapshot({ owned, raid: cleaned });
  assert.equal(snapshot.ok, true);
  if (snapshot.ok) assert.deepEqual(snapshot.data.raid, cleaned);
});
test("100 deterministic 1/2/3 fighter runs terminate; no unlimited steps, charge or stacked buffs", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = makeRng(seed);
    let s = startRaid(boss, ["libai", "qin", "machao"].slice(0, 1 + (seed % 3)), owned, rng);
    let actions = 0;
    while (s.status === "play" && actions++ < 120) {
      const f = s.fighters.find((f) => f.energy >= f.cost);
      if (f) s = raidSkill(s, f.id, boss, actions * 400, rng).state;
      else {
        const moves = allMoves(s.board);
        assert.ok(moves.length);
        const [a, b] = moves[Math.floor(rng() * moves.length)]!;
        s = raidSwap(s, a, b, boss, rng).state;
      }
      assert.ok(s.fighters.every((f) => f.energy >= 0 && f.energy <= f.cost));
      assert.ok(s.bonusMoves <= 12);
    }
    assert.notEqual(s.status, "play", `seed ${seed}`);
    assert.ok(s.turns <= 32);
  }
});
