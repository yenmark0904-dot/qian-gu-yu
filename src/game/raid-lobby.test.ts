import test from "node:test";
import assert from "node:assert/strict";
import { RAID_ENCOUNTERS, RAID_ENCOUNTER_BY_ID, cleanRaid, emptyRaid, markRaidTry, mergeRaid, recordRaidClear } from "./raid.ts";
import { CHARACTERS } from "./data.ts";
import {
  RAID_CLASS_DISPLAY,
  raidActionLabel,
  raidMechanics,
  raidNeeds,
  raidRewards,
  raidStats,
  raidTags,
  raidTeamFit,
} from "./raid-lobby.ts";

const [normal, elite, sov] = RAID_ENCOUNTERS as [typeof RAID_ENCOUNTERS[0], typeof RAID_ENCOUNTERS[0], typeof RAID_ENCOUNTERS[0]];

test("boss numbers / drops are the untouched originals (snapshot)", () => {
  const snap = RAID_ENCOUNTERS.map((e) => [e.id, e.tier, e.enemy.name, e.enemy.hp, e.enemy.shield, e.enemy.attackEvery, e.enemy.ink, e.enemy.ice, e.enemy.spread ?? 0, e.enemy.phaseAt, e.enemy.boss, e.def.moves, e.drops, e.firstDrops]);
  assert.deepEqual(snap, [
    ["ink-shadow", "normal", "噬墨之影", 4200, 95, 3, 2, 1, 0, 0.5, false, 28, { jingmosha: 12 }, { jingmosha: 20 }],
    ["elite-ink-colossus", "elite", "濁墨巨傀", 5400, 150, 3, 2, 1, 1, 0.5, true, 30, { zhenejing: 3, jingmosha: 8 }, { zhenejing: 6 }],
    ["sovereign-ink-abyss", "sovereign", "墨淵厄主", 6600, 210, 3, 2, 1, 2, 0.5, true, 32, { tianmingcanyin: 1, zhenejing: 2, jingmosha: 10 }, { tianmingcanyin: 2 }],
  ]);
});

test("per-boss stats come from shared combat (HP, player HP, hits, shields)", () => {
  assert.deepEqual(raidStats(normal), { hp: 4200, playerHp: 1100, every: 3, everyPhase2: 2, hit: 140, hitPhase2: 168, shield: 95, shieldPhase2: 124 });
  assert.deepEqual(raidStats(elite), { hp: 5400, playerHp: 1200, every: 3, everyPhase2: 2, hit: 175, hitPhase2: 210, shield: 150, shieldPhase2: 195 });
  assert.deepEqual(raidStats(sov), { hp: 6600, playerHp: 1300, every: 3, everyPhase2: 2, hit: 175, hitPhase2: 210, shield: 210, shieldPhase2: 273 });
});

test("mechanics only list what exists; tags ≤ 3", () => {
  const keys = (e: typeof normal) => raidMechanics(e).map((m) => m.key);
  assert.deepEqual(keys(normal), ["attack", "ink", "ice", "shield", "phase"]); // no 墨紋, no 墨蝕
  assert.deepEqual(keys(elite), ["attack", "ink", "ice", "vein", "shield", "phase"]);
  assert.deepEqual(keys(sov), ["attack", "ink", "ice", "vein", "shield", "phase"]);
  // combat.enemyAttack: a non-boss lays ice every attack; a boss only in phase 2.
  assert.match(raidMechanics(normal).find((m) => m.key === "ice")!.text, /^每次出手追加冰封 1/);
  assert.match(raidMechanics(elite).find((m) => m.key === "ice")!.text, /生命低於50%後/);
  assert.match(raidMechanics(sov).find((m) => m.key === "vein")!.text, /延伸 2 顆/);
  for (const e of RAID_ENCOUNTERS) assert.ok(raidTags(e).length <= 3 && raidTags(e).length > 0);
  assert.deepEqual(raidTags(normal).map((t) => t.label), ["護盾 95", "墨封＋冰封", "半血每 2 回出手"]);
  assert.deepEqual(raidTags(sov).map((t) => t.label), ["護盾 210", "墨紋延伸 2", "半血每 2 回出手"]);
});

test("reward states: unclaimed → claimed after first win; repeat never re-grants", () => {
  let save = emptyRaid();
  let r = raidRewards(normal, save.records[normal.id]);
  assert.deepEqual(r.every, [{ id: "jingmosha", n: 12 }]);
  assert.deepEqual(r.firstWin, { items: [{ id: "jingmosha", n: 20 }], claimed: false });
  assert.deepEqual(r.legacyInk, { n: 300, claimed: false });
  assert.equal(raidRewards(elite, undefined).legacyInk, null);
  const w1 = recordRaidClear(save, normal);
  save = w1.raid;
  r = raidRewards(normal, save.records[normal.id]);
  assert.equal(r.firstWin.claimed, true);
  assert.equal(r.legacyInk!.claimed, true);
  const w2 = recordRaidClear(save, normal);
  assert.deepEqual(w2.drops, { jingmosha: 12 });
  assert.equal(w2.ink, 0);
});

test("action label: 開始討伐 → 再次討伐 after a try (loss) or a win; tries never pay or claim", () => {
  let save = emptyRaid();
  assert.equal(raidActionLabel(save.records[elite.id]), "開始討伐");
  save = markRaidTry(save, elite.id);
  assert.equal(raidActionLabel(save.records[elite.id]), "再次討伐");
  assert.equal(save.records[elite.id]!.tries, 1);
  assert.equal(save.records[elite.id]!.firstDrop, false);
  // A loss-only record still gets the full first-win bonus later.
  const w = recordRaidClear(save, elite);
  assert.equal(w.first, true);
  assert.deepEqual(w.drops, { zhenejing: 9, jingmosha: 8 });
  assert.equal(w.raid.records[elite.id]!.tries, 1);
  assert.equal(w.raid.records[elite.id]!.clears, 1);
  // Old V1 save (cleared, no clears/tries) reads as challenged.
  const old = cleanRaid({ team: [], records: { "ink-shadow": { cleared: true, rewardClaimed: true, bestMoves: 5 } } }, {});
  assert.equal(raidActionLabel(old.records["ink-shadow"]), "再次討伐");
  assert.equal("tries" in old.records["ink-shadow"]!, false); // additive: untouched old shape
  assert.equal(markRaidTry(save, "nope"), save);
});

test("tries survive clean + merge (max), old saves load unchanged", () => {
  const a = markRaidTry(markRaidTry(emptyRaid(), sov.id), sov.id);
  const cleaned = cleanRaid(JSON.parse(JSON.stringify(a)), {});
  assert.equal(cleaned.records[sov.id]!.tries, 2);
  assert.equal(mergeRaid(cleaned, markRaidTry(emptyRaid(), sov.id)).records[sov.id]!.tries, 2);
  assert.equal(cleanRaid({ records: { [sov.id]: { cleared: false, tries: -3 } } }, {}).records[sov.id]!.tries, undefined);
  assert.deepEqual(cleanRaid(undefined, {}), emptyRaid());
  assert.ok(RAID_ENCOUNTER_BY_ID[sov.id]);
});

test("class display covers all 65 characters; team-fit hints follow real mechanics", () => {
  assert.equal(Object.keys(RAID_CLASS_DISPLAY).length, 65);
  for (const c of CHARACTERS) assert.ok(RAID_CLASS_DISPLAY[c.id], `missing class for ${c.id}`);
  assert.deepEqual(raidNeeds(normal).map((n) => n.cls), ["破厄", "承命"]); // shield, no boss hit
  assert.deepEqual(raidNeeds(sov).map((n) => n.cls), ["破厄", "鎮守", "承命"]);
  assert.equal(raidTeamFit(sov, []).level, "empty");
  assert.equal(raidTeamFit(sov, ["qin", "lanling", "libai"]).level, "good");
  const p = raidTeamFit(sov, ["qin", "zhouyu", "sima"]);
  assert.equal(p.level, "partial");
  assert.deepEqual(p.missing.map((m) => m.cls), ["鎮守", "承命"]);
});
