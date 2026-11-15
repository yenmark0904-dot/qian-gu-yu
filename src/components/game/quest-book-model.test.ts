import test from "node:test";
import assert from "node:assert/strict";
import { sortedQuests, claimableQuests } from "./quest-book-model.ts";
import {
  applyQuestEvent,
  emptyQuestBook,
  dailyView,
  dailyMoyuan,
  claimDailyQuest,
  weeklyView,
  claimWeekly,
  chestState,
  claimChest,
  rollQuestBook,
} from "../../game/quests.ts";
const now = Date.parse("2026-11-08T12:00:00+08:00");
const ctx = { vault: true, raid: true };
const fixture = () => {
  let book = emptyQuestBook();
  for (const event of ["LOGIN_COMPLETED", "MATCH3_COMPLETED", "CHARACTER_STORY_READ"] as const)
    book = applyQuestEvent(book, event, now);
  return claimDailyQuest(book, "story", ctx, now).book;
};
test("display sort: ready, incomplete, claimed; stable within groups; no mutation or state/id mismatch", () => {
  const book = fixture();
  const before = JSON.stringify(book);
  const rows = dailyView(book, ctx);
  const original = rows.map((q) => q.id);
  const sorted = sortedQuests(rows);
  assert.deepEqual(
    sorted.map((q) => q.id),
    ["login", "match1", "match3", "equip", "raid", "mainstory", "free", "story"],
  );
  assert.deepEqual(
    rows.map((q) => q.id),
    original,
  );
  assert.equal(JSON.stringify(book), before);
  for (const q of sorted)
    assert.strictEqual(
      q,
      rows.find((r) => r.id === q.id),
    );
});
test("bulk daily: exact eligible ids through original claim rules; pending excluded until claimed; repeat safe", () => {
  let book = fixture();
  const ready = claimableQuests(dailyView(book, ctx));
  assert.equal(dailyMoyuan(book), 15);
  assert.deepEqual(
    ready.map((q) => q.id),
    ["login", "match1"],
  );
  assert.equal(chestState(book, 20), "locked");
  let gained = 0;
  for (const q of ready) {
    const r = claimDailyQuest(book, q.id, ctx, now);
    book = r.book;
    gained += r.moyuan;
  }
  assert.equal(gained, 20);
  assert.equal(dailyMoyuan(book), 35);
  assert.equal(chestState(book, 20), "ready");
  assert.equal(chestState(book, 40), "locked");
  assert.deepEqual(claimableQuests(dailyView(book, ctx)), []);
  for (const q of ready) assert.equal(claimDailyQuest(book, q.id, ctx, now).moyuan, 0);
  const chest = claimChest(book, 20, ctx, now);
  assert.deepEqual(chest.reward, { ink: 20 });
  assert.equal(chestState(chest.book, 20), "claimed");
  assert.equal(claimChest(chest.book, 20, ctx, now).reward, null);
});
test("bulk weekly preserves true ticket rewards and repeat guard", () => {
  let book = {
    ...fixture(),
    weekDays: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"],
    weekRaids: 3,
  };
  const rows = claimableQuests(weeklyView(book, ctx));
  assert.equal(rows.length, 2);
  const rewards = [];
  for (const q of rows) {
    const r = claimWeekly(book, q.id, ctx, now);
    book = r.book;
    rewards.push(r.reward);
  }
  assert.deepEqual(rewards, [{ charTickets: 3 }, { artifactTickets: 2 }]);
  for (const q of rows) assert.equal(claimWeekly(book, q.id, ctx, now).reward, null);
});
test("stale bulk snapshot crossing daily/weekly reset cannot grant expired rewards", () => {
  let book = fixture();
  const ready = claimableQuests(dailyView(book, ctx));
  const monday = Date.parse("2026-11-09T04:00:00+08:00");
  for (const q of ready) {
    const r = claimDailyQuest(book, q.id, ctx, monday);
    book = r.book;
    assert.equal(r.moyuan, 0);
  }
  assert.equal(dailyMoyuan(book), 0);
  assert.deepEqual(
    rollQuestBook({ ...fixture(), weekClaimed: ["raid3"], weekRaids: 3 }, monday).weekClaimed,
    [],
  );
  assert.equal(claimWeekly({ ...fixture(), weekRaids: 3 }, "raid3", ctx, monday).reward, null);
});
