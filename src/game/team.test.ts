import test from "node:test";
import assert from "node:assert/strict";
import { CHARACTERS } from "./data.ts";
import { RANK } from "./logic.ts";
import { skillOf } from "./skills.ts";
import { NO_ASSIST } from "./assist.ts";
import { enemyImage, enemyForLevel } from "./combat.ts";
import { LEVELS } from "./levels.ts";
import { TEAM_SIZE, autoTeam, cleanTeam, fightTeam, skillTags } from "./team.ts";

const skilled = CHARACTERS.filter((c) => skillOf(c.id));
const byRank = (r: number) => skilled.filter((c) => RANK[c.rarity] === r);
const ownAll = (ids: string[], n = 1) => Object.fromEntries(ids.map((id) => [id, n]));

test("cleanTeam keeps owned skilled unique ids, max three", () => {
  const [a, b, c, d] = skilled.map((x) => x.id);
  const owned = ownAll([a!, b!, c!, d!]);
  assert.deepEqual(cleanTeam([a, a, "nope", 3, b, c, d], owned), [a, b, c]);
  assert.deepEqual(cleanTeam([a], {}), []);
  assert.deepEqual(cleanTeam(undefined, owned), []);
});

test("自動配對 fills three seats: pin first, then rarity before anything else", () => {
  assert.deepEqual(autoTeam(CHARACTERS, {}), []);
  const ssr = byRank(RANK.SSR)[0]!;
  const rs = byRank(RANK.R).slice(0, 3);
  const owned = { ...ownAll(rs.map((c) => c.id), 4), [ssr.id]: 1 };
  const team = autoTeam(CHARACTERS, owned);
  assert.equal(team.length, TEAM_SIZE);
  assert.equal(team[0], ssr.id, "an SSR outranks R even with fewer copies");
  const pinned = rs[2]!.id;
  const withPin = autoTeam(CHARACTERS, owned, { pinned });
  assert.equal(withPin[0], pinned, "固定助陣 sits first");
  assert.equal(withPin[1], ssr.id);
  assert.equal(new Set(withPin).size, TEAM_SIZE);
  // a pin that is not owned, or 不帶助陣, is ignored — still three
  assert.deepEqual(autoTeam(CHARACTERS, owned, { pinned: byRank(RANK.SS)[0]!.id }), team);
  assert.deepEqual(autoTeam(CHARACTERS, owned, { pinned: NO_ASSIST }), team);
});

test("自動配對 prefers a new kind of skill effect within the same rarity", () => {
  let found: [string, string, string] | null = null;
  for (const r of [RANK.R, RANK.S, RANK.SS, RANK.SSR]) {
    const group = byRank(r);
    for (const a of group)
      for (const b of group) {
        if (a === b) continue;
        const ta = skillTags(a.id, 1).join();
        if (ta !== skillTags(b.id, 1).join()) continue;
        const c = group.find((x) => x !== a && x !== b && skillTags(x.id, 1).some((t) => !skillTags(a.id, 1).includes(t)));
        if (c) found ??= [a.id, b.id, c.id];
      }
  }
  assert.ok(found, "data has a same-rarity pair with identical effects and a third with a different one");
  const [a, b, c] = found!;
  // a and b have more copies; c only one — but c brings an effect the team lacks
  const team = autoTeam(CHARACTERS, { [a]: 2, [b]: 2, [c]: 1 });
  assert.equal(team[1], c, JSON.stringify({ team, tags: [a, b, c].map((id) => skillTags(id, 1)) }));
  assert.equal(team.length, 3);
});

test("fight team: never a lone assist when more are owned; empty 編隊 auto-fills", () => {
  const ids = skilled.slice(0, 5).map((c) => c.id);
  const owned = ownAll(ids);
  assert.equal(fightTeam([], owned, CHARACTERS).length, 3, "empty → full auto team");
  const one = fightTeam([ids[4]], owned, CHARACTERS);
  assert.equal(one.length, 3);
  assert.equal(one[0], ids[4], "hand-picked seats keep their order");
  const two = fightTeam([ids[3], ids[1]], owned, CHARACTERS, ids[0]);
  assert.deepEqual(two, [ids[3], ids[1], ids[0]], "the pin takes the first free seat");
  assert.deepEqual(fightTeam(ids.slice(0, 3), owned, CHARACTERS), ids.slice(0, 3), "a full 編隊 is untouched");
  assert.deepEqual(fightTeam([], ownAll([ids[0]!]), CHARACTERS), [ids[0]], "only one owned → one");
  assert.deepEqual(fightTeam([], {}, CHARACTERS), []);
});

test("墨厄 art slot: image by id, name or art kind, else the drawn ink body", () => {
  const def = enemyForLevel(LEVELS[0]!);
  assert.equal(enemyImage(def, {}), null);
  assert.equal(enemyImage(def, { [def.art]: "/enemies/a.webp" }), "/enemies/a.webp");
  assert.equal(enemyImage(def, { [def.name]: "/enemies/n.webp", [def.art]: "/enemies/a.webp" }), "/enemies/n.webp");
  assert.equal(enemyImage(def, { [def.id]: "/enemies/i.webp", [def.name]: "/enemies/n.webp" }), "/enemies/i.webp");
  assert.equal(enemyImage({ ...def, image: "/x.png" }, { [def.id]: "/enemies/i.webp" }), "/x.png");
});
