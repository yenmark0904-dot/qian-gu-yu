// Balance sim for the shared combat engine: a greedy bot (best immediate score, no skills) plays every
// main level and sample 深宮 floors N times, with and without the 墨厄, to measure 破厄 rate and how much
// the enemy changes the plain clear rate. Run: node --experimental-strip-types scripts/combat-balance.mjs
import { LEVELS, startBoard, startProgress, goalsMet } from "../src/game/levels.ts";
import { floorDef } from "../src/game/shengong.ts";
import { allMoves, trySwap, makeRng } from "../src/game/match3.ts";
import { enemyForLevel, enemyForFloor, startEnemy, hitWithWaves, enemyTurn, forgetBroken, feedLamp } from "../src/game/combat.ts";
import { STORY_EVENTS } from "../src/game/story-events.ts";

const N = Number(process.env.N ?? 24);
function play(def, enemyDef, seed, withEnemy, lamp) {
  const rng = makeRng(seed);
  let board = startBoard(def, rng);
  let p = startProgress(board);
  let e = startEnemy(enemyDef, lamp ? lamp.start : null);
  let moves = def.moves;
  while (moves > 0) {
    const opts = allMoves(board);
    if (!opts.length) break;
    let best = null;
    for (const [a, b] of opts) {
      const r = trySwap(board, a, b, makeRng(seed + moves));
      if (!r.ok) continue;
      let v = r.score + (lamp ? r.collected[lamp.kind] * 40 : 0) + r.sealsBroken * 25;
      if (!best || v > best.v) best = { v, a, b };
    }
    if (!best) break;
    const r = trySwap(board, best.a, best.b, rng);
    moves -= 1;
    board = r.board;
    p = { ...p, score: p.score + r.score, collected: p.collected.map((n, k) => n + (r.collected[k] ?? 0)), sealsLeft: Math.max(0, p.sealsLeft - r.sealsBroken) };
    if (withEnemy) {
      e = hitWithWaves(enemyDef, e, r.waves).state;
      if (lamp) e = feedLamp(e, r.collected[lamp.kind] * lamp.perJade);
      if (lamp) e = { ...e, lamp: Math.max(0, e.lamp - lamp.decay) };
      const t = enemyTurn(enemyDef, forgetBroken(e, board), board, rng);
      e = t.state; board = t.board;
      if (lamp && e.lamp <= 0) return { lose: true, e, moves };
    }
    if (!lamp && goalsMet(def, p)) return { won: true, e, moves };
    if (lamp && e.defeated) return { won: true, e, moves };
  }
  return { won: lamp ? (e.lamp > 0) : goalsMet(def, p), e, moves };
}
const rows = [];
for (const def of LEVELS) {
  const en = enemyForLevel(def);
  let base = 0, fight = 0, purge = 0, dmg = 0;
  for (let i = 0; i < N; i++) {
    if (play(def, en, 1000 + i * 7, false).won) base++;
    const r = play(def, en, 1000 + i * 7, true);
    if (r.won) fight++;
    if (r.e.defeated) purge++;
    dmg += r.e.damage / en.hp;
  }
  rows.push({ id: def.id, hp: en.hp, boss: en.boss, clearPlain: base / N, clearWithEnemy: fight / N, purgeRate: purge / N, avgDmgShare: +(dmg / N).toFixed(2) });
}
console.table(rows);
const avg = (k) => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(3);
console.log("main avg clearPlain", avg("clearPlain"), "clearWithEnemy", avg("clearWithEnemy"), "purge", avg("purgeRate"), "dmgShare", avg("avgDmgShare"));
const fl = [];
for (const f of [1, 5, 10, 20, 30, 40, 60]) {
  const def = floorDef(f); const en = enemyForFloor(f, def);
  let base = 0, fight = 0, purge = 0;
  for (let i = 0; i < N; i++) { if (play(def, en, 77 + i, false).won) base++; const r = play(def, en, 77 + i, true); if (r.won) fight++; if (r.e.defeated) purge++; }
  fl.push({ floor: f, hp: en.hp, clearPlain: base / N, clearWithEnemy: fight / N, purgeRate: purge / N });
}
console.table(fl);
for (const ev of STORY_EVENTS) {
  let won = 0, purge = 0, lampEnd = 0;
  for (let i = 0; i < N * 2; i++) { const r = play(ev.def, ev.enemy, 500 + i, true, ev.lamp); if (r.won) won++; if (r.e.defeated) purge++; lampEnd += r.e.lamp; }
  console.log("story", ev.id, "winRate(no skills)", won / (N * 2), "purge", purge / (N * 2), "avgLampEnd", (lampEnd / (N * 2)).toFixed(1));
}
