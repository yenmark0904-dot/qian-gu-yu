import test from "node:test";
import assert from "node:assert/strict";
import {
  CHEST_STEPS,
  DAILY_QUESTS,
  MILESTONES,
  applyQuestEvent,
  chestReward,
  claimChest,
  claimDailyQuest,
  claimMilestone,
  claimWeekly,
  cleanQuestBook,
  dailyMoyuan,
  dailyView,
  emptyQuestBook,
  freeSummonUsed,
  grantReward,
  nextDailyReset,
  nextWeeklyReset,
  questClaimable,
  questDay,
  questWeek,
  rollQuestBook,
  teamHasArtifact,
  weeklyView,
  type QuestBook,
  type QuestCtx,
  type QuestEvent,
} from "./quests.ts";
import { freeSummonTransaction, settleCharacterPull } from "./pull-settle.ts";
import { emptyArtifacts } from "./artifacts.ts";
import { summonArtifacts } from "./artifact-summon.ts";
import { emptyArtifactSummon } from "./artifact-summon-state.ts";
import { COST_ONE, COST_TEN } from "./logic.ts";

/** Taipei wall time → epoch ms (Asia/Taipei = UTC+8, no DST). */
const tpe = (y: number, mo: number, d: number, h = 12, mi = 0) => Date.UTC(y, mo - 1, d, h - 8, mi);
// 2026-11-08 is a Sunday; 2026-11-09 a Monday.
const SUN_1200 = tpe(2026, 11, 8, 12);
const ALL: QuestCtx = { vault: true, raid: true };
const NONE: QuestCtx = { vault: false, raid: false };

const fire = (b: QuestBook, now: number, ...evs: QuestEvent[]) => evs.reduce((x, e) => applyQuestEvent(x, e, now), b);
const everything: QuestEvent[] = [
  "LOGIN_COMPLETED",
  "MATCH3_COMPLETED",
  "MATCH3_COMPLETED",
  "MATCH3_COMPLETED",
  "CHARACTER_STORY_READ",
  "ARTIFACT_ENHANCED",
  "BOSS_BATTLE_WON",
  "MAIN_STORY_READ",
  "DAILY_FREE_SUMMON_COMPLETED",
];
const claimAll = (b: QuestBook, ctx: QuestCtx, now: number) =>
  DAILY_QUESTS.reduce((x, q) => claimDailyQuest(x, q.id, ctx, now).book, b);

test("8 daily quests summing to 100 墨緣", () => {
  assert.equal(DAILY_QUESTS.length, 8);
  assert.equal(DAILY_QUESTS.reduce((n, q) => n + q.moyuan, 0), 100);
  const b = claimAll(fire(emptyQuestBook(), SUN_1200, ...everything), ALL, SUN_1200);
  assert.equal(dailyMoyuan(b), 100);
});

test("replacement tasks (命器閣 / 鎮厄司 locked) still reach 100 with only 三消 + reading + free pull", () => {
  const evs: QuestEvent[] = ["LOGIN_COMPLETED", "MATCH3_COMPLETED", "MATCH3_COMPLETED", "MATCH3_COMPLETED", "CHARACTER_STORY_READ", "MAIN_STORY_READ", "DAILY_FREE_SUMMON_COMPLETED"];
  const b0 = fire(emptyQuestBook(), SUN_1200, ...evs);
  const v = dailyView(b0, NONE);
  assert.equal(v.find((q) => q.id === "equip")!.replaced, true);
  assert.equal(v.find((q) => q.id === "raid")!.replaced, true);
  assert.ok(v.every((q) => q.completed));
  assert.equal(dailyMoyuan(claimAll(b0, NONE, SUN_1200)), 100);
  // With systems open, the real tasks are required.
  const open = dailyView(b0, ALL);
  assert.equal(open.find((q) => q.id === "equip")!.completed, false);
  assert.equal(open.find((q) => q.id === "raid")!.completed, false);
});

test("玉局初成 and 玉局精進 share the same 三消 completions", () => {
  let b = fire(emptyQuestBook(), SUN_1200, "MATCH3_COMPLETED");
  let v = dailyView(b, ALL);
  assert.equal(v.find((q) => q.id === "match1")!.completed, true);
  assert.deepEqual([v.find((q) => q.id === "match3")!.have, v.find((q) => q.id === "match3")!.need], [1, 3]);
  b = fire(b, SUN_1200, "MATCH3_COMPLETED", "MATCH3_COMPLETED");
  v = dailyView(b, ALL);
  assert.equal(v.find((q) => q.id === "match3")!.completed, true);
  assert.equal(v.find((q) => q.id === "match1")!.have, 1); // capped, never double-counted
});

test("a raid win is not a 主線/無盡塔 三消", () => {
  const b = fire(emptyQuestBook(), SUN_1200, "BOSS_BATTLE_WON");
  const v = dailyView(b, ALL);
  assert.equal(v.find((q) => q.id === "match1")!.completed, false);
  assert.equal(v.find((q) => q.id === "raid")!.completed, true);
});

test("claim then refresh (clean + reload) does not re-grant", () => {
  const b0 = fire(emptyQuestBook(), SUN_1200, "LOGIN_COMPLETED");
  const first = claimDailyQuest(b0, "login", ALL, SUN_1200);
  assert.equal(first.moyuan, 10);
  const reloaded = cleanQuestBook(JSON.parse(JSON.stringify(first.book)));
  assert.equal(claimDailyQuest(reloaded, "login", ALL, SUN_1200 + 1000).moyuan, 0);
  const c1 = claimChest(claimAll(fire(emptyQuestBook(), SUN_1200, ...everything), ALL, SUN_1200), 20, ALL, SUN_1200);
  assert.deepEqual(c1.reward, { ink: 20 });
  const c2 = claimChest(cleanQuestBook(JSON.parse(JSON.stringify(c1.book))), 20, ALL, SUN_1200);
  assert.equal(c2.reward, null);
});

test("incomplete quests cannot be claimed", () => {
  assert.equal(claimDailyQuest(emptyQuestBook(), "match1", ALL, SUN_1200).moyuan, 0);
  assert.equal(claimChest(emptyQuestBook(), 20, ALL, SUN_1200).reward, null);
});

test("LOGIN does not fire any other quest", () => {
  const b = fire(emptyQuestBook(), SUN_1200, "LOGIN_COMPLETED", "LOGIN_COMPLETED");
  const v = dailyView(b, ALL);
  assert.deepEqual(v.filter((q) => q.completed).map((q) => q.id), ["login"]);
  assert.deepEqual(dailyView(b, NONE).filter((q) => q.completed).map((q) => q.id), ["login"]);
});

test("daily reset at Taipei 04:00", () => {
  assert.equal(questDay(tpe(2026, 11, 8, 3, 59)), "2026-11-07");
  assert.equal(questDay(tpe(2026, 11, 8, 4, 0)), "2026-11-08");
  assert.equal(questDay(tpe(2026, 11, 9, 3, 59)), "2026-11-08");
  assert.equal(questDay(tpe(2026, 11, 9, 4, 0)), "2026-11-09");
  assert.equal(nextDailyReset(tpe(2026, 11, 8, 3, 59)), tpe(2026, 11, 8, 4, 0));
  assert.equal(nextDailyReset(tpe(2026, 11, 8, 4, 0)), tpe(2026, 11, 9, 4, 0));
});

test("weekly reset at Monday 04:00 Taipei (Sunday 03:59/04:00, Monday 03:59/04:00)", () => {
  assert.equal(questWeek(tpe(2026, 11, 8, 3, 59)), "2026-11-02");
  assert.equal(questWeek(tpe(2026, 11, 8, 4, 0)), "2026-11-02");
  assert.equal(questWeek(tpe(2026, 11, 9, 3, 59)), "2026-11-02");
  assert.equal(questWeek(tpe(2026, 11, 9, 4, 0)), "2026-11-09");
  assert.equal(nextWeeklyReset(tpe(2026, 11, 9, 3, 59)), tpe(2026, 11, 9, 4, 0));
  assert.equal(nextWeeklyReset(tpe(2026, 11, 9, 4, 0)), tpe(2026, 11, 16, 4, 0));
  assert.equal(nextWeeklyReset(tpe(2026, 11, 8, 12)), tpe(2026, 11, 9, 4, 0));
});

test("unclaimed daily 墨緣 and chests expire at reset (no back-pay)", () => {
  const before = tpe(2026, 11, 8, 3, 59);
  let b = claimAll(fire(emptyQuestBook(), before, ...everything), ALL, before);
  b = fire(b, before, "MATCH3_COMPLETED");
  assert.equal(dailyMoyuan(b), 100);
  const after = tpe(2026, 11, 8, 4, 0);
  const rolled = rollQuestBook(b, after);
  assert.equal(dailyMoyuan(rolled), 0);
  assert.equal(rolled.counts.MATCH3_COMPLETED, 0);
  for (const st of CHEST_STEPS) assert.equal(claimChest(b, st, ALL, after).reward, null);
  assert.equal(claimDailyQuest(b, "login", ALL, after).moyuan, 0);
  // but the day that reached 100 still counts for the week
  assert.deepEqual(rolled.weekDays, ["2026-11-07"]);
});

test("chest rewards: 130 墨玉 + 10 淨墨砂 unlocked, 150 墨玉 locked; via existing materials map", () => {
  const ink = (ctx: QuestCtx) => CHEST_STEPS.reduce((n, st) => n + (chestReward(st, ctx).ink ?? 0), 0);
  assert.equal(ink(ALL), 130);
  assert.equal(chestReward(40, ALL).material?.n, 10);
  assert.equal(chestReward(40, ALL).material?.id, "jingmosha");
  assert.equal(ink(NONE), 150);
  const s = { ink: 0, charTickets: 0, artifactTickets: 0, artifacts: emptyArtifacts() };
  const g = grantReward(s, chestReward(40, ALL));
  assert.equal(g.artifacts.materials.jingmosha, 10);
  assert.equal(g.ink, 0);
});

test("weekly: 七日勤修 counts unique days at 100; 鎮厄有功 raids or replacement; claims sticky per week", () => {
  let b = emptyQuestBook();
  for (let d = 9; d <= 13; d++) {
    const now = tpe(2026, 11, d, 12);
    b = claimAll(fire(b, now, ...everything), ALL, now);
    b = claimAll(b, ALL, now); // same day twice → still once
  }
  const now = tpe(2026, 11, 13, 13);
  const w = weeklyView(b, ALL);
  assert.equal(w[0]!.have, 5);
  assert.equal(w[0]!.completed, true);
  assert.equal(w[1]!.have, 3);
  const c = claimWeekly(b, "diligent", ALL, now);
  assert.deepEqual(c.reward, { charTickets: 3 });
  assert.equal(claimWeekly(cleanQuestBook(JSON.parse(JSON.stringify(c.book))), "diligent", ALL, now).reward, null);
  assert.deepEqual(claimWeekly(c.book, "raid3", ALL, now).reward, { artifactTickets: 2 });
  // Next Monday 04:00: unclaimed weekly expires, progress resets.
  const next = rollQuestBook(b, tpe(2026, 11, 16, 4, 0));
  assert.equal(next.weekDays.length, 0);
  assert.equal(claimWeekly(b, "diligent", ALL, tpe(2026, 11, 16, 4, 0)).reward, null);
  // Locked raid → 6 三消 replacement, same reward.
  let r = emptyQuestBook();
  for (let i = 0; i < 6; i++) r = fire(r, SUN_1200, "MATCH3_COMPLETED");
  const lw = weeklyView(r, NONE)[1]!;
  assert.equal(lw.replaced, true);
  assert.equal(lw.completed, true);
  assert.deepEqual(claimWeekly(r, "raid3", NONE, SUN_1200).reward, { artifactTickets: 2 });
});

test("free summon: once per quest-day, no 墨玉 / tickets spent, pity & 緣分 path shared", () => {
  const state = {
    ink: 500,
    pity: 10,
    owned: {} as Record<string, number>,
    totalPulls: 5,
    history: [] as string[],
    marks: 0,
    tierInkPaid: {} as Record<string, number>,
    charTickets: 3,
    questBook: emptyQuestBook(),
  };
  const first = freeSummonTransaction(state, SUN_1200);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.cards.length, 1);
  assert.equal(first.patch.charTickets, 3);
  assert.equal(first.patch.ink - first.cards.reduce((n, c) => n + (c.tierInk ?? 0), 0), 500);
  assert.equal(first.patch.totalPulls, 6);
  assert.ok(first.patch.pity === 11 || first.patch.pity === 0);
  const after = { ...state, ...first.patch };
  assert.equal(freeSummonUsed(after.questBook, SUN_1200), true);
  assert.equal(dailyView(after.questBook, ALL).find((q) => q.id === "free")!.completed, true);
  // refresh → reload save → still used
  const reloaded = { ...after, questBook: cleanQuestBook(JSON.parse(JSON.stringify(after.questBook))) };
  assert.deepEqual(freeSummonTransaction(reloaded, SUN_1200 + 60_000), { ok: false, error: "used" });
  // does not stack: next day only one again
  const tomorrow = tpe(2026, 11, 9, 4, 0);
  assert.equal(freeSummonTransaction(reloaded, tomorrow).ok, true);
  // duplicates still raise 緣分 (count goes up)
  const dupState = { ...state, owned: Object.fromEntries([[first.cards[0]!.character.id, 1]]) };
  const p2 = settleCharacterPull(dupState, 1, "free");
  assert.equal(p2.ok, true);
});

test("ink pull unchanged; tickets are never mixed or auto-replaced with 墨玉", () => {
  const base = { ink: 10_000, pity: 0, owned: {}, totalPulls: 1, history: [], marks: 0, tierInkPaid: {}, charTickets: 5 };
  const ink1 = settleCharacterPull(base, 1, "ink");
  assert.ok(ink1.ok && ink1.patch.ink - ink1.cards.reduce((n, c) => n + (c.tierInk ?? 0), 0) === 10_000 - COST_ONE);
  assert.ok(ink1.ok && ink1.patch.charTickets === 5);
  const ink10 = settleCharacterPull(base, 10, "ink");
  assert.ok(ink10.ok && ink10.patch.ink - ink10.cards.reduce((n, c) => n + (c.tierInk ?? 0), 0) === 10_000 - COST_TEN);
  // 5 tickets: a ten-pull is refused, 墨玉 untouched (no fallback)
  assert.deepEqual(settleCharacterPull(base, 10, "ticket"), { ok: false, error: "no-tickets" });
  const t1 = settleCharacterPull(base, 1, "ticket");
  assert.ok(t1.ok && t1.patch.charTickets === 4);
  assert.ok(t1.ok && t1.patch.ink - t1.cards.reduce((n, c) => n + (c.tierInk ?? 0), 0) === 10_000);
  assert.deepEqual(settleCharacterPull({ ...base, ink: 0, charTickets: 0 }, 1, "ticket"), { ok: false, error: "no-tickets" });
  // artifact ticket pull: no 墨玉, same pity ledger
  const art = { artifacts: emptyArtifacts(), artifactSummon: emptyArtifactSummon(), ink: 7, m3: { "5": { stars: 1, best: 1 } } };
  const r = summonArtifacts(art, 10, Math.random, 0, "ticket");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.ink, 7);
    assert.equal(r.artifactSummon.total, 10);
    assert.equal(r.artifactSummon.spentInk, 0);
  }
  const paid = summonArtifacts(art, 1);
  assert.equal(paid.ok, false); // 7 墨玉 < 150: ink pull still requires ink
});

test("milestones: 補領 for already-cleared stages, once only", () => {
  assert.equal(MILESTONES.reduce((n, m) => n + m.charTickets, 0), 40);
  assert.equal(MILESTONES.reduce((n, m) => n + m.artifactTickets, 0), 26);
  const m3: Record<string, { stars: number; best: number }> = {};
  for (let i = 1; i <= 12; i++) m3[String(i)] = { stars: 2, best: 100 };
  const prog = { m3, mainStoryPrologueRead: true };
  let b = cleanQuestBook(undefined); // old save
  const got: string[] = [];
  for (const m of MILESTONES) {
    const r = claimMilestone(b, m.id, prog);
    if (r.reward) got.push(m.id);
    b = r.book;
  }
  assert.deepEqual(got, ["prologue", "stage5", "stage10"]);
  for (const m of MILESTONES) assert.equal(claimMilestone(cleanQuestBook(JSON.parse(JSON.stringify(b))), m.id, prog).reward, null);
  // milestones survive daily/weekly resets
  assert.deepEqual(rollQuestBook(b, tpe(2027, 1, 4, 5)).milestones, b.milestones);
});

test("red dot only when something is claimable", () => {
  const prog = { m3: {}, mainStoryPrologueRead: false };
  assert.equal(questClaimable(emptyQuestBook(), ALL, prog, SUN_1200), false);
  const b = fire(emptyQuestBook(), SUN_1200, "LOGIN_COMPLETED");
  assert.equal(questClaimable(b, ALL, prog, SUN_1200), true);
  assert.equal(questClaimable(claimDailyQuest(b, "login", ALL, SUN_1200).book, ALL, prog, SUN_1200), false);
  assert.equal(questClaimable(emptyQuestBook(), ALL, { m3: {}, mainStoryPrologueRead: true }, SUN_1200), true);
});

test("old / junk saves load safely", () => {
  const b = cleanQuestBook({ day: "x", counts: { MATCH3_COMPLETED: -3, LOGIN_COMPLETED: "1" }, claimed: ["login", "evil"], chests: [20, 33], milestones: ["stage5", "stage5", 7] });
  assert.equal(b.day, "");
  assert.equal(b.counts.MATCH3_COMPLETED, 0);
  assert.deepEqual(b.claimed, ["login"]);
  assert.deepEqual(b.chests, [20]);
  assert.deepEqual(b.milestones, ["stage5"]);
});

test("equipment detection uses the 戰隊 vs the equip relation", () => {
  const a = emptyArtifacts();
  const save = { ...a, instances: [{ uid: "m1", eid: "suxin-yuzhui", level: 1, equippedBy: "qin", locked: false }] };
  assert.equal(teamHasArtifact(["qin", "han"], save), true);
  assert.equal(teamHasArtifact(["han"], save), false);
  assert.equal(teamHasArtifact(["han"], a), false);
});

test("t445u 命器養成 = 強化命器一次 (vault open); a 三消 with a 命器 no longer completes it; locked → 1 場三消", () => {
  const q = DAILY_QUESTS.find((x) => x.id === "equip")!;
  assert.equal(q.name, "命器養成");
  assert.equal(q.moyuan, 10);
  // Old event alone (e.g. a stale save) no longer completes it.
  let b = fire(emptyQuestBook(), SUN_1200, "MATCH3_COMPLETED", "EQUIPMENT_MATCH_COMPLETED");
  let v = dailyView(b, ALL).find((x) => x.id === "equip")!;
  assert.equal(v.desc, "強化命器一次");
  assert.equal(v.completed, false);
  assert.equal(v.go, "refine");
  b = fire(b, SUN_1200, "ARTIFACT_ENHANCED");
  v = dailyView(b, ALL).find((x) => x.id === "equip")!;
  assert.equal(v.completed, true);
  assert.equal(claimDailyQuest(b, "equip", ALL, SUN_1200).moyuan, 10);
  // Vault locked: replacement 「完成 1 場三消」.
  const locked = dailyView(fire(emptyQuestBook(), SUN_1200, "MATCH3_COMPLETED"), NONE).find((x) => x.id === "equip")!;
  assert.equal(locked.replaced, true);
  assert.equal(locked.completed, true);
  assert.equal(locked.go, "match3");
  assert.match(locked.desc, /完成 1 場三消/);
  // Resets with the quest-day like every other count.
  const next = rollQuestBook(b, SUN_1200 + 86_400_000);
  assert.equal(next.counts.ARTIFACT_ENHANCED, 0);
  // Survives clean / reload.
  assert.equal(cleanQuestBook(JSON.parse(JSON.stringify(b))).counts.ARTIFACT_ENHANCED, 1);
});
