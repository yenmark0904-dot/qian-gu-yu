/**
 * 深宮 · 無盡晉封塔 — pure, dependency-free rules (shared by the client UI, the server functions and the
 * node tests). One floor = one 三消 level on the usual 7 × 8 board; floors never end.
 *
 * Progress = highest floor cleared. Title = rank of that floor (one rank per 10 floors, 皇后 from 81 on).
 * 墨玉: ONLY a one-time reward the first time a player reaches each new title (御女 … 皇后). Clearing a
 * floor, retrying, or replaying never pays — so the mode can never mint unlimited 墨玉.
 *
 * Leaderboard order: highest floor cleared, then the cumulative score (sum of the final score of every
 * floor cleared — each floor counts once, since floors are cleared in order and never resubmitted).
 */
import type { Goal, LevelDef } from "./levels.ts";

export const SG_COLS = 7;
export const SG_ROWS = 8;

export type Rank = { name: string; from: number; to: number | null; reward: number };

/** 唐代內命婦位號, low → high. `reward` = one-time 墨玉 the first time the title is reached. */
export const RANKS: readonly Rank[] = [
  { name: "采女", from: 1, to: 10, reward: 0 },
  { name: "御女", from: 11, to: 20, reward: 600 },
  { name: "寶林", from: 21, to: 30, reward: 1000 },
  { name: "才人", from: 31, to: 40, reward: 1600 },
  { name: "美人", from: 41, to: 50, reward: 2400 },
  { name: "婕妤", from: 51, to: 60, reward: 3200 },
  { name: "昭儀", from: 61, to: 70, reward: 4000 },
  { name: "貴妃", from: 71, to: 80, reward: 5000 },
  { name: "皇后", from: 81, to: null, reward: 6000 },
];

const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0);

/** Rank index for a floor (floor ≤ 0, i.e. nothing cleared yet, still holds the entry title 采女). */
export function rankIndexForFloor(floor: number): number {
  const f = Math.max(1, int(floor));
  return Math.min(RANKS.length - 1, Math.floor((f - 1) / 10));
}

export function rankForFloor(floor: number): Rank {
  return RANKS[rankIndexForFloor(floor)]!;
}

/** Floors still to clear before the next title (null at 皇后). */
export function floorsToNextRank(best: number): { next: Rank; floor: number } | null {
  const i = rankIndexForFloor(best);
  const next = RANKS[i + 1];
  if (!next) return null;
  return { next, floor: next.from };
}

/** Keep only real, unique, reached, paying rank indices (for loading saves / server rows). */
export function cleanRanksPaid(input: unknown, best: number): number[] {
  if (!Array.isArray(input)) return [];
  const top = int(best) > 0 ? rankIndexForFloor(best) : -1;
  return RANKS.map((_, i) => i).filter((i) => i <= top && RANKS[i]!.reward > 0 && input.some((x) => Number(x) === i));
}

/**
 * One-time 墨玉 for titles reached at `best` and not yet paid. Returns the new paid list, the 墨玉 owed and
 * which ranks it was for. Calling it again with the returned list always pays 0.
 */
export function claimRankRewards(best: number, paid: readonly number[]): { paid: number[]; ink: number; ranks: number[] } {
  const done = cleanRanksPaid(paid, best);
  if (int(best) <= 0) return { paid: done, ink: 0, ranks: [] };
  const top = rankIndexForFloor(best);
  const ranks: number[] = [];
  let ink = 0;
  for (let i = 1; i <= top; i++) {
    if (RANKS[i]!.reward > 0 && !done.includes(i)) {
      ranks.push(i);
      ink += RANKS[i]!.reward;
    }
  }
  return { paid: cleanRanksPaid([...done, ...ranks], best), ink, ranks };
}

/* ── floors ─────────────────────────────────────────────────────────────── */

/**
 * The difficulty curve. Every parameter moves one way only (never easier) and plateaus at a cap that
 * the 50 hand-made levels show is still clearable, so every floor stays beatable.
 */
export function difficulty(floor: number) {
  const d = Math.max(0, int(floor) - 1);
  return {
    moves: Math.max(16, 26 - Math.floor(d / 4)),
    seals: Math.min(18, 3 + Math.floor(d / 3)),
    ice: Math.min(8, Math.floor(d / 6)),
    collect: Math.min(18, 10 + Math.floor(d / 4)),
    kinds: d >= 40 ? 3 : d >= 15 ? 2 : 1,
    score: Math.min(2400, 900 + 30 * d),
  };
}

/** Small deterministic PRNG so a floor looks the same for everyone (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Symmetric seal layout (rows 2–7) with `count` seals, `ice` of them iced. */
export function sealLayout(count: number, ice: number, rng: () => number): string[] {
  const grid = Array.from({ length: SG_ROWS }, () => new Array<string>(SG_COLS).fill("."));
  const slots: [number, number][] = [];
  for (let r = 2; r < SG_ROWS; r++) for (let c = 0; c <= 3; c++) slots.push([r, c]);
  // shuffle
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  let left = Math.min(count, 4 * 6 * 2 - 6);
  let iceLeft = Math.min(ice, left);
  for (const [r, c] of slots) {
    if (left <= 0) break;
    const mirror = c < 3;
    if (mirror && left < 2) continue;
    const ch = iceLeft >= (mirror ? 2 : 1) ? "2" : "1";
    grid[r]![c] = ch;
    if (mirror) grid[r]![SG_COLS - 1 - c] = ch;
    if (ch === "2") iceLeft -= mirror ? 2 : 1;
    left -= mirror ? 2 : 1;
  }
  return grid.map((row) => row.join(""));
}

export function sealCells(seal: readonly string[] | undefined) {
  return (seal ?? []).join("").replace(/\./g, "").length;
}

/** 晉封試煉: the last floor of each title (10, 20, …) stacks every goal type. */
export function isTrialFloor(floor: number) {
  return int(floor) > 0 && int(floor) % 10 === 0;
}

/**
 * Floor N as a normal LevelDef (id = floor, so the 餘步加分 grows with height as on the map).
 * Goal pattern cycles score → collect → seal → seal+collect → score+collect, with a stacked trial every
 * 10th floor; all amounts come from `difficulty`, so the curve never dips.
 */
export function floorDef(floor: number): LevelDef {
  const f = Math.max(1, int(floor));
  const p = difficulty(f);
  const rng = seeded(0x5e9e + f * 7919);
  const kinds: number[] = [];
  while (kinds.length < p.kinds) {
    const k = Math.floor(rng() * 6);
    if (!kinds.includes(k)) kinds.push(k);
  }
  const collect = (n: number): Goal[] => kinds.slice(0, n).map((kind) => ({ type: "collect", kind, count: p.collect }));
  const score: Goal = { type: "score", target: p.score };
  const seal = sealLayout(p.seals, p.ice, rng);
  let goals: Goal[];
  let withSeal = false;
  if (isTrialFloor(f)) {
    goals = [{ type: "seal" }, score, ...collect(1)];
    withSeal = true;
  } else {
    switch ((f - 1) % 5) {
      case 0:
        goals = [score];
        break;
      case 1:
        goals = collect(p.kinds);
        break;
      case 2:
        goals = [{ type: "seal" }];
        withSeal = true;
        break;
      case 3:
        goals = [{ type: "seal" }, ...collect(1)];
        withSeal = true;
        break;
      default:
        goals = [score, ...collect(Math.max(1, p.kinds - 1))];
    }
  }
  const target = Math.max(p.score, 1200);
  return {
    id: f,
    moves: p.moves,
    goals,
    seal: withSeal ? seal : undefined,
    stars: [Math.round(target * 1.25), Math.round(target * 1.5)],
  };
}

/* ── submissions (server-side anti-cheat) ───────────────────────────────── */

/** Generous ceiling per move (big 龍珠 combos land ~1000) and the most extra moves assists can add. */
export const MAX_POINTS_PER_MOVE = 1500;
export const MAX_ASSIST_MOVES = 12;
/** A floor cannot be cleared faster than this (also the per-device submit gap). */
export const MIN_SUBMIT_GAP_MS = 4000;
/** Per-IP cap in a 10-minute window (stops a script cycling fresh device ids). */
export const SUBMIT_IP_MAX = 120;
export const SUBMIT_WINDOW_MS = 10 * 60 * 1000;

/** Plausible final score (board score + 餘步加分) for clearing floor N. */
export function scoreBounds(floor: number): { min: number; max: number } {
  const def = floorDef(floor);
  const moves = def.moves + MAX_ASSIST_MOVES;
  const per = 2 * (60 + 2 * (def.id - 1)); // = moveBonusPer(id), duplicated to keep this module standalone
  // Structural submit-data floor only: defeating 墨厄, not the old score goal, clears a floor.
  const min = 30;
  return { min, max: moves * MAX_POINTS_PER_MOVE + moves * per };
}

export type PlayerRecord = {
  deviceId: string;
  nickname: string | null;
  floor: number;
  total: number;
  lastScore: number;
  ranksPaid: number[];
  updatedAt: number;
};

export type SubmitInput = { deviceId: string; floor: number; score: number };
export type SubmitError = "invalid" | "sequence" | "score" | "rate_limited";

const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function validDeviceId(id: unknown): id is string {
  return typeof id === "string" && DEVICE_RE.test(id);
}

/**
 * Check one floor clear against the stored record. Floors must be sequential per device (N+1 only after N),
 * the score must sit in the floor's plausible band, and a device may not submit faster than MIN_SUBMIT_GAP_MS.
 */
export function validateSubmission(
  prev: Pick<PlayerRecord, "floor" | "updatedAt"> | null,
  raw: unknown,
  now: number,
): { ok: true; value: SubmitInput } | { ok: false; error: SubmitError; expected?: number } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid" };
  const r = raw as Record<string, unknown>;
  if (!validDeviceId(r.deviceId)) return { ok: false, error: "invalid" };
  const floor = r.floor;
  const score = r.score;
  if (typeof floor !== "number" || !Number.isInteger(floor) || floor < 1 || floor > 100000) return { ok: false, error: "invalid" };
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0) return { ok: false, error: "invalid" };
  const expected = (prev?.floor ?? 0) + 1;
  if (floor !== expected) return { ok: false, error: "sequence", expected };
  if (prev && now - prev.updatedAt < MIN_SUBMIT_GAP_MS) return { ok: false, error: "rate_limited" };
  const { min, max } = scoreBounds(floor);
  if (score < min || score > max) return { ok: false, error: "score" };
  return { ok: true, value: { deviceId: r.deviceId as string, floor, score } };
}

/** Apply a validated clear: new floor, cumulative score, and any titles paid (server-side, once each). */
export function applySubmission(prev: PlayerRecord | null, input: SubmitInput, now: number) {
  const base: PlayerRecord = prev ?? { deviceId: input.deviceId, nickname: null, floor: 0, total: 0, lastScore: 0, ranksPaid: [], updatedAt: 0 };
  const claim = claimRankRewards(input.floor, base.ranksPaid);
  const next: PlayerRecord = {
    ...base,
    floor: input.floor,
    total: base.total + input.score,
    lastScore: input.score,
    ranksPaid: claim.paid,
    updatedAt: now,
  };
  return { record: next, newRanks: claim.ranks, ink: claim.ink };
}

/* ── nicknames ──────────────────────────────────────────────────────────── */

export const NICK_MIN = 2;
export const NICK_MAX = 12;
const BAD_WORDS = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "nigger", "nigga", "asshole", "slut", "whore",
  "幹你", "幹妳", "操你", "操妳", "肏", "屌", "雞巴", "鸡巴", "婊子", "賤人", "贱人", "傻逼", "傻屄", "煞筆", "他媽的", "他妈的", "你媽", "你妈", "靠北", "機掰", "雞掰", "王八蛋", "去死",
];

/**
 * Nickname: tags and control / bidi chars stripped, markup symbols removed, whitespace collapsed, trimmed,
 * basic profanity masked with ＊. Returns null unless 2–12 characters remain (masks excluded).
 */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  let s = raw
    .replace(/<[^>]*>?/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
    .replace(/[<>&"'`\\/{}[\]$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const w of BAD_WORDS) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    s = s.replace(re, (m) => "＊".repeat(Array.from(m).length));
  }
  const chars = Array.from(s);
  const real = chars.filter((c) => c !== "＊" && c !== " ").length;
  if (chars.length < NICK_MIN || chars.length > NICK_MAX || real < NICK_MIN) return null;
  return s;
}

/* ── leaderboard ────────────────────────────────────────────────────────── */

export const BOARD_SIZE = 50;

/** Sort key: floor first, cumulative score second (bigger = better). Fits a double exactly up to floor 900k. */
export function boardScore(floor: number, total: number) {
  return int(floor) * 1e10 + Math.min(1e10 - 1, Math.max(0, int(total)));
}

export function compareEntries(a: Pick<PlayerRecord, "floor" | "total" | "updatedAt">, b: Pick<PlayerRecord, "floor" | "total" | "updatedAt">) {
  return b.floor - a.floor || b.total - a.total || a.updatedAt - b.updatedAt;
}

export type BoardRow = { position: number; nickname: string; title: string; floor: number; total: number; me?: boolean };
