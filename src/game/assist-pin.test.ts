import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_ASSIST, resolveAssist, strongestOwned } from "./assist.ts";
import { assistBadge, assistState, cleanAssist } from "./assist-pin.ts";
import { CHARACTERS } from "./data.ts";

const roster = CHARACTERS.map((c) => ({ id: c.id, rarity: c.rarity }));
const r = CHARACTERS.find((c) => c.rarity === "R")!.id;

test("assist pin: default is auto strongest until something is pinned", () => {
  const owned = { qin: 1, [r]: 3 };
  const s = assistState(null, owned, roster);
  assert.equal(s.mode, "auto");
  assert.equal(s.id, "qin");
  assert.equal(s.id, strongestOwned(roster, owned));
  assert.equal(assistBadge(s), "自動推薦 · 最強");
});

test("assist pin: a pinned favourite is used in every level, even weaker; clearing returns to auto", () => {
  const owned = { qin: 1, [r]: 3 };
  const pinned = assistState(r, owned, roster);
  assert.equal(pinned.mode, "pinned");
  assert.equal(pinned.id, r);
  assert.equal(assistBadge(pinned), "固定助陣");
  // levels don't change the pick: resolve is level-independent
  for (let level = 1; level <= 50; level++) assert.equal(resolveAssist(r, owned, roster), r);
  const cleared = assistState(null, owned, roster);
  assert.equal(cleared.id, "qin");
  assert.equal(assistState(NO_ASSIST, owned, roster).id, null);
});

test("assist pin: persists through save rehydration (cleanAssist) and falls back without losing the pin", () => {
  // what the store writes is what merge() reads back
  const saved = JSON.parse(JSON.stringify({ assist: r })) as { assist: unknown };
  assert.equal(cleanAssist(saved.assist), r);
  assert.equal(cleanAssist(NO_ASSIST), NO_ASSIST);
  assert.equal(cleanAssist(null), null);
  assert.equal(cleanAssist(undefined), null);
  assert.equal(cleanAssist("not-a-character"), null);
  assert.equal(cleanAssist(42), null);
  // pinned but not owned (e.g. other device): auto fills in, pin remembered
  const s = assistState(r, { qin: 1 }, roster);
  assert.equal(s.mode, "pinned");
  assert.equal(s.pinned, r);
  assert.equal(s.id, "qin");
  assert.equal(s.fallback, true);
});
