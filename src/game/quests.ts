/**
 * 修行簿 (V2.0): 今日修行 / 七日修行 / 旅途饋贈 — pure rules, no React, no storage.
 *
 * Clock: Asia/Taipei (UTC+8, no DST). Daily reset 04:00, weekly reset Monday 04:00.
 * This clock is ONLY for 修行簿; the 每日領取 800 墨玉 keeps its own localDay() schedule.
 *
 * Note: progress lives in the local save, so it cannot stop someone editing the save or the device clock.
 */
import type { LevelRecord } from "./levels.ts";
import type { ArtifactSave, MaterialId } from "./artifacts.ts";

/* ───────────────────────── clock ───────────────────────── */

export const QUEST_TZ_OFFSET_MS = 8 * 3600_000; // Asia/Taipei
export const QUEST_RESET_HOUR = 4;
const DAY_MS = 86_400_000;
/** Shift so that "Taipei 04:00" becomes 00:00 UTC of the quest-day. */
const shifted = (now: number) => now + QUEST_TZ_OFFSET_MS - QUEST_RESET_HOUR * 3600_000;

/** Quest-day id, e.g. "2026-11-08" — the Taipei date whose 04:00 began the current period. */
export function questDay(now: number): string {
  return new Date(Math.floor(shifted(now) / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}
/** Quest-week id = the quest-day id of that week's Monday. */
export function questWeek(now: number): string {
  const dayIndex = Math.floor(shifted(now) / DAY_MS);
  const dow = (new Date(dayIndex * DAY_MS).getUTCDay() + 6) % 7; // Monday = 0
  return new Date((dayIndex - dow) * DAY_MS).toISOString().slice(0, 10);
}
/** Epoch ms of the next daily reset (next Taipei 04:00). */
export function nextDailyReset(now: number): number {
  const dayIndex = Math.floor(shifted(now) / DAY_MS);
  return (dayIndex + 1) * DAY_MS - QUEST_TZ_OFFSET_MS + QUEST_RESET_HOUR * 3600_000;
}
/** Epoch ms of the next weekly reset (next Monday Taipei 04:00). */
export function nextWeeklyReset(now: number): number {
  const dayIndex = Math.floor(shifted(now) / DAY_MS);
  const dow = (new Date(dayIndex * DAY_MS).getUTCDay() + 6) % 7;
  return (dayIndex - dow + 7) * DAY_MS - QUEST_TZ_OFFSET_MS + QUEST_RESET_HOUR * 3600_000;
}
/** 「12 小時 03 分」 / 「3 天 4 小時」 style countdown. */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} 天 ${h} 小時`;
  if (h > 0) return `${h} 小時 ${String(m).padStart(2, "0")} 分`;
  return `${m} 分 ${String(sec).padStart(2, "0")} 秒`;
}

/* ───────────────────────── events / save ───────────────────────── */

export type QuestEvent =
  | "LOGIN_COMPLETED"
  | "MATCH3_COMPLETED"
  | "CHARACTER_STORY_READ"
  | "MAIN_STORY_READ"
  | "EQUIPMENT_MATCH_COMPLETED"
  | "BOSS_BATTLE_WON"
  | "DAILY_FREE_SUMMON_COMPLETED"
  /** 命器淬鍊 / 強化 succeeded once (t445u: 命器養成改成強化一次). */
  | "ARTIFACT_ENHANCED";

export const QUEST_EVENTS: QuestEvent[] = [
  "LOGIN_COMPLETED",
  "MATCH3_COMPLETED",
  "CHARACTER_STORY_READ",
  "MAIN_STORY_READ",
  "EQUIPMENT_MATCH_COMPLETED",
  "BOSS_BATTLE_WON",
  "DAILY_FREE_SUMMON_COMPLETED",
  "ARTIFACT_ENHANCED",
];

export type QuestBook = {
  /** Quest-day these daily fields belong to ("" = never). */
  day: string;
  /** Today's event counts. */
  counts: Record<QuestEvent, number>;
  /** Daily quest ids whose 墨緣值 was claimed today. */
  claimed: string[];
  /** Daily 墨緣 chest thresholds claimed today. */
  chests: number[];
  /** Quest-week (Monday id) these weekly fields belong to. */
  week: string;
  /** Quest-days this week whose 墨緣值 reached 100 (unique). */
  weekDays: string[];
  weekRaids: number;
  weekMatch3: number;
  /** Weekly quest ids claimed this week. */
  weekClaimed: string[];
  /** 旅途饋贈 milestone ids claimed (one-time, never reset). */
  milestones: string[];
};

const zeroCounts = (): Record<QuestEvent, number> =>
  Object.fromEntries(QUEST_EVENTS.map((e) => [e, 0])) as Record<QuestEvent, number>;

export const emptyQuestBook = (): QuestBook => ({
  day: "",
  counts: zeroCounts(),
  claimed: [],
  chests: [],
  week: "",
  weekDays: [],
  weekRaids: 0,
  weekMatch3: 0,
  weekClaimed: [],
  milestones: [],
});

const COUNT_CAP = 999;
const int = (v: unknown, max = COUNT_CAP) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
const strList = (v: unknown, ok: (s: string) => boolean) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ok(x)))] : [];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Clean any persisted value (old saves: undefined → empty). Never throws. */
export function cleanQuestBook(raw: unknown): QuestBook {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const c = r.counts && typeof r.counts === "object" ? (r.counts as Record<string, unknown>) : {};
  const counts = zeroCounts();
  for (const e of QUEST_EVENTS) counts[e] = int(c[e]);
  return {
    day: typeof r.day === "string" && DAY_RE.test(r.day) ? r.day : "",
    counts,
    claimed: strList(r.claimed, (s) => DAILY_IDS.includes(s)),
    chests: Array.isArray(r.chests)
      ? [...new Set(r.chests.filter((x): x is number => CHEST_STEPS.includes(x as number)))]
      : [],
    week: typeof r.week === "string" && DAY_RE.test(r.week) ? r.week : "",
    weekDays: strList(r.weekDays, (s) => DAY_RE.test(s)).slice(0, 7),
    weekRaids: int(r.weekRaids),
    weekMatch3: int(r.weekMatch3),
    weekClaimed: strList(r.weekClaimed, (s) => WEEKLY_IDS.includes(s)),
    milestones: strList(r.milestones, (s) => MILESTONE_IDS.includes(s)),
  };
}

export const cleanTickets = (v: unknown) => int(v, 99_999);

/**
 * Bring the book to `now`'s period. A new quest-day wipes daily progress, claims and chests —
 * anything left unclaimed simply expires (no back-pay). A new week wipes weekly fields the same way.
 * Milestones never reset.
 */
export function rollQuestBook(book: QuestBook, now: number): QuestBook {
  const day = questDay(now);
  const week = questWeek(now);
  let next = book;
  if (book.day !== day) next = { ...next, day, counts: zeroCounts(), claimed: [], chests: [] };
  if (book.week !== week)
    next = { ...next, week, weekDays: [], weekRaids: 0, weekMatch3: 0, weekClaimed: [] };
  return next;
}

/* ───────────────────────── context ───────────────────────── */

export type QuestCtx = {
  /** 命器閣 open (第 5 關). */
  vault: boolean;
  /** 鎮厄司 open (第 10 關). */
  raid: boolean;
};

/* ───────────────────────── daily quests ───────────────────────── */

export type GoTarget = "none" | "match3" | "codex" | "artifacts" | "refine" | "raid" | "story" | "free-summon";

export type DailyDef = {
  id: string;
  name: string;
  moyuan: number;
};

export const DAILY_QUESTS: DailyDef[] = [
  { id: "login", name: "初入墨境", moyuan: 10 },
  { id: "match1", name: "玉局初成", moyuan: 10 },
  { id: "match3", name: "玉局精進", moyuan: 15 },
  { id: "story", name: "情牽一念", moyuan: 15 },
  { id: "equip", name: "命器養成", moyuan: 10 },
  { id: "raid", name: "鎮厄巡行", moyuan: 15 },
  { id: "mainstory", name: "墨卷重溫", moyuan: 15 },
  { id: "free", name: "每日緣起", moyuan: 10 },
];
const DAILY_IDS = DAILY_QUESTS.map((q) => q.id);
export const DAILY_MAX = 100;

export type DailyView = DailyDef & {
  desc: string;
  have: number;
  need: number;
  completed: boolean;
  claimed: boolean;
  /** Replacement task in use (system not yet unlocked). */
  replaced: boolean;
  go: GoTarget;
};

export function dailyView(book: QuestBook, ctx: QuestCtx): DailyView[] {
  const c = book.counts;
  return DAILY_QUESTS.map((q) => {
    let desc = "";
    let have = 0;
    let need = 1;
    let replaced = false;
    let go: GoTarget = "none";
    switch (q.id) {
      case "login":
        desc = "今日首次進入千古遇";
        have = c.LOGIN_COMPLETED;
        break;
      case "match1":
        desc = "完成 1 場主線或無盡塔三消";
        have = c.MATCH3_COMPLETED;
        go = "match3";
        break;
      case "match3":
        desc = "累計完成 3 場主線或無盡塔三消";
        have = c.MATCH3_COMPLETED;
        need = 3;
        go = "match3";
        break;
      case "story":
        desc = "閱讀 1 段已解鎖的情話、專屬物語或天命書（重溫亦可）";
        have = c.CHARACTER_STORY_READ;
        go = "codex";
        break;
      case "equip":
        if (ctx.vault) {
          // t445u: 命器養成 = 強化（淬鍊）命器一次; 「前往」 opens 命器閣 · 命器淬鍊.
          desc = "強化命器一次";
          have = c.ARTIFACT_ENHANCED;
          go = "refine";
        } else {
          desc = "完成 1 場三消（命器閣開放後改為命器任務）";
          have = c.MATCH3_COMPLETED;
          replaced = true;
          go = "match3";
        }
        break;
      case "raid":
        if (ctx.raid) {
          desc = "完成 1 場鎮厄司討伐";
          have = c.BOSS_BATTLE_WON;
          go = "raid";
        } else {
          desc = "完成 1 場主線或無盡塔三消（鎮厄司開放後改為討伐）";
          have = c.MATCH3_COMPLETED;
          replaced = true;
          go = "match3";
        }
        break;
      case "mainstory":
        desc = "閱讀或重溫 1 段已解鎖的主線劇情";
        have = c.MAIN_STORY_READ;
        go = "story";
        break;
      case "free":
        desc = "完成今日免費角色單抽";
        have = c.DAILY_FREE_SUMMON_COMPLETED;
        go = "free-summon";
        break;
    }
    const completed = have >= need;
    return {
      ...q,
      desc,
      have: Math.min(have, need),
      need,
      completed,
      claimed: book.claimed.includes(q.id),
      replaced,
      go,
    };
  });
}

/** 墨緣值 earned today = sum of claimed daily quests. */
export function dailyMoyuan(book: QuestBook): number {
  return DAILY_QUESTS.filter((q) => book.claimed.includes(q.id)).reduce((n, q) => n + q.moyuan, 0);
}

/** Record one event. Only the current period is touched; counts are capped. */
export function applyQuestEvent(book: QuestBook, event: QuestEvent, now: number, n = 1): QuestBook {
  const b = rollQuestBook(book, now);
  const add = Math.max(0, Math.floor(n));
  if (!add) return b;
  const counts = { ...b.counts };
  if (event === "LOGIN_COMPLETED" || event === "DAILY_FREE_SUMMON_COMPLETED") counts[event] = 1;
  else counts[event] = Math.min(COUNT_CAP, counts[event] + add);
  let { weekRaids, weekMatch3 } = b;
  if (event === "BOSS_BATTLE_WON") weekRaids = Math.min(COUNT_CAP, weekRaids + add);
  if (event === "MATCH3_COMPLETED") weekMatch3 = Math.min(COUNT_CAP, weekMatch3 + add);
  return { ...b, counts, weekRaids, weekMatch3 };
}

/** Claim one daily quest's 墨緣值. Returns gained 墨緣 (0 = not claimable). */
export function claimDailyQuest(book: QuestBook, id: string, ctx: QuestCtx, now: number) {
  const b = rollQuestBook(book, now);
  const q = dailyView(b, ctx).find((x) => x.id === id);
  if (!q || !q.completed || q.claimed) return { book: b, moyuan: 0 };
  const claimed = [...b.claimed, id];
  let next: QuestBook = { ...b, claimed };
  if (dailyMoyuan(next) >= DAILY_MAX && !next.weekDays.includes(next.day))
    next = { ...next, weekDays: [...next.weekDays, next.day] };
  return { book: next, moyuan: q.moyuan };
}

/* ───────────────────────── daily chests ───────────────────────── */

export const CHEST_STEPS = [20, 40, 60, 80, 100];

export type Reward = { ink?: number; material?: { id: MaterialId; name: string; n: number }; charTickets?: number; artifactTickets?: number };

export function chestReward(step: number, ctx: QuestCtx): Reward {
  switch (step) {
    case 20:
      return { ink: 20 };
    case 40:
      return ctx.vault ? { material: { id: "jingmosha", name: "淨墨砂", n: 10 } } : { ink: 20 };
    case 60:
      return { ink: 30 };
    case 80:
      return { ink: 30 };
    case 100:
      return { ink: 50 };
    default:
      return {};
  }
}

export function chestState(book: QuestBook, step: number): "locked" | "ready" | "claimed" {
  if (book.chests.includes(step)) return "claimed";
  return dailyMoyuan(book) >= step ? "ready" : "locked";
}

export function claimChest(book: QuestBook, step: number, ctx: QuestCtx, now: number) {
  const b = rollQuestBook(book, now);
  if (!CHEST_STEPS.includes(step) || chestState(b, step) !== "ready") return { book: b, reward: null };
  return { book: { ...b, chests: [...b.chests, step] }, reward: chestReward(step, ctx) };
}

/* ───────────────────────── free summon ───────────────────────── */

export const freeSummonUsed = (book: QuestBook, now: number) =>
  rollQuestBook(book, now).counts.DAILY_FREE_SUMMON_COMPLETED > 0;

/* ───────────────────────── weekly ───────────────────────── */

export const WEEKLY_DAYS_NEED = 5;
export type WeeklyView = {
  id: string;
  name: string;
  desc: string;
  have: number;
  need: number;
  completed: boolean;
  claimed: boolean;
  replaced: boolean;
  reward: Reward;
  rewardText: string;
  go: GoTarget;
};
const WEEKLY_IDS = ["diligent", "raid3"];

export function weeklyView(book: QuestBook, ctx: QuestCtx): WeeklyView[] {
  const raid = ctx.raid
    ? { desc: "本週完成 3 場鎮厄司討伐", have: book.weekRaids, need: 3, replaced: false, go: "raid" as GoTarget }
    : {
        desc: "本週完成 6 場主線或無盡塔三消（鎮厄司開放後改為討伐）",
        have: book.weekMatch3,
        need: 6,
        replaced: true,
        go: "match3" as GoTarget,
      };
  const rows = [
    {
      id: "diligent",
      name: "七日勤修",
      desc: "本週有 5 個不同日子的墨緣值達到 100",
      have: book.weekDays.length,
      need: WEEKLY_DAYS_NEED,
      replaced: false,
      reward: { charTickets: 3 },
      rewardText: "千古召喚券 ×3",
      go: "none" as GoTarget,
    },
    { id: "raid3", name: "鎮厄有功", ...raid, reward: { artifactTickets: 2 }, rewardText: "命器召喚券 ×2" },
  ];
  return rows.map((r) => ({
    ...r,
    have: Math.min(r.have, r.need),
    completed: r.have >= r.need,
    claimed: book.weekClaimed.includes(r.id),
  }));
}

export function claimWeekly(book: QuestBook, id: string, ctx: QuestCtx, now: number) {
  const b = rollQuestBook(book, now);
  const w = weeklyView(b, ctx).find((x) => x.id === id);
  if (!w || !w.completed || w.claimed) return { book: b, reward: null };
  return { book: { ...b, weekClaimed: [...b.weekClaimed, id] }, reward: w.reward };
}

/* ───────────────────────── 旅途饋贈 milestones ───────────────────────── */

export type MilestoneDef = { id: string; name: string; stage: number | null; charTickets: number; artifactTickets: number };
export const MILESTONES: MilestoneDef[] = [
  { id: "prologue", name: "完成序章", stage: null, charTickets: 10, artifactTickets: 0 },
  { id: "stage5", name: "通關第 5 關", stage: 5, charTickets: 5, artifactTickets: 10 },
  { id: "stage10", name: "通關第 10 關", stage: 10, charTickets: 5, artifactTickets: 5 },
  { id: "stage20", name: "通關第 20 關", stage: 20, charTickets: 5, artifactTickets: 3 },
  { id: "stage30", name: "通關第 30 關", stage: 30, charTickets: 5, artifactTickets: 3 },
  { id: "stage50", name: "通關第 50 關", stage: 50, charTickets: 10, artifactTickets: 5 },
];
const MILESTONE_IDS = MILESTONES.map((m) => m.id);

export type MilestoneProgress = { m3: Record<string, LevelRecord>; mainStoryPrologueRead: boolean };
export function milestoneReached(m: MilestoneDef, s: MilestoneProgress): boolean {
  if (m.stage === null) return s.mainStoryPrologueRead === true;
  return (s.m3[String(m.stage)]?.stars ?? 0) > 0;
}
export function milestoneState(book: QuestBook, m: MilestoneDef, s: MilestoneProgress): "locked" | "ready" | "claimed" {
  if (book.milestones.includes(m.id)) return "claimed";
  return milestoneReached(m, s) ? "ready" : "locked";
}
export function claimMilestone(book: QuestBook, id: string, s: MilestoneProgress) {
  const m = MILESTONES.find((x) => x.id === id);
  if (!m || milestoneState(book, m, s) !== "ready") return { book, reward: null };
  return {
    book: { ...book, milestones: [...book.milestones, id] },
    reward: { charTickets: m.charTickets, artifactTickets: m.artifactTickets } as Reward,
  };
}

/* ───────────────────────── rewards / red dot ───────────────────────── */

/** Apply a reward to the currencies it touches (tickets, 墨玉, existing 命器 materials map). */
export function grantReward<
  S extends { ink: number; charTickets: number; artifactTickets: number; artifacts: ArtifactSave },
>(s: S, r: Reward): Pick<S, "ink" | "charTickets" | "artifactTickets" | "artifacts"> {
  const artifacts = r.material
    ? {
        ...s.artifacts,
        materials: {
          ...s.artifacts.materials,
          [r.material.id]: Math.min(999_999, (s.artifacts.materials[r.material.id] ?? 0) + r.material.n),
        },
      }
    : s.artifacts;
  return {
    ink: s.ink + Math.max(0, r.ink ?? 0),
    charTickets: Math.min(99_999, s.charTickets + Math.max(0, r.charTickets ?? 0)),
    artifactTickets: Math.min(99_999, s.artifactTickets + Math.max(0, r.artifactTickets ?? 0)),
    artifacts,
  };
}

export function rewardText(r: Reward): string {
  const out: string[] = [];
  if (r.ink) out.push(`墨玉 ×${r.ink}`);
  if (r.material) out.push(`${r.material.name} ×${r.material.n}`);
  if (r.charTickets) out.push(`千古召喚券 ×${r.charTickets}`);
  if (r.artifactTickets) out.push(`命器召喚券 ×${r.artifactTickets}`);
  return out.join("、");
}

/** Anything claimable right now (daily 墨緣, chest, weekly, milestone)? */
export function questClaimable(book: QuestBook, ctx: QuestCtx, s: MilestoneProgress, now: number): boolean {
  const b = rollQuestBook(book, now);
  if (dailyView(b, ctx).some((q) => q.completed && !q.claimed)) return true;
  if (CHEST_STEPS.some((st) => chestState(b, st) === "ready")) return true;
  if (weeklyView(b, ctx).some((w) => w.completed && !w.claimed)) return true;
  return MILESTONES.some((m) => milestoneState(b, m, s) === "ready");
}

/** Does the given 三人戰隊 include someone wearing a 命器? */
export function teamHasArtifact(team: readonly string[], artifacts: ArtifactSave): boolean {
  return artifacts.instances.some((i) => i.equippedBy !== null && team.includes(i.equippedBy));
}
