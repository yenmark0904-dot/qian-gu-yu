import { KINDS, boardFrom, freshBoard, sealsLeft, type Board, type Rng, type Special } from "./match3.ts";

/** 三消 · 50 關 in five 卷. Every level uses all six jades on a 7 × 8 board. */
export const LEVEL_COLS = 7;
export const LEVEL_ROWS = 8;

export type Goal =
  | { type: "score"; target: number }
  | { type: "collect"; kind: number; count: number }
  | { type: "seal" };

export type LevelDef = {
  id: number;
  moves: number;
  goals: Goal[];
  /** 8 strings of 7 chars: "." free, "1" ink seal, "2" ink + ice seal. */
  seal?: string[];
  /** Final-score thresholds for 2★ and 3★ (1★ = cleared). */
  stars: [number, number];
  /** Fixed opening board for tutorial levels. */
  preset?: { rows: string[]; specials?: [number, number, Special][] };
  tip?: string;
};

export const JADE_NAMES = ["青玉璧", "羊脂白玉", "蜜蠟黃玉", "墨玉璜", "紫羅蘭圭", "雞血紅玉印"] as const;

export const CHAPTERS = [
  { from: 1, to: 10, name: "卷一 · 青川" },
  { from: 11, to: 20, name: "卷二 · 墨池" },
  { from: 21, to: 30, name: "卷三 · 赤霄" },
  { from: 31, to: 40, name: "卷四 · 紫闕" },
  { from: 41, to: 50, name: "卷五 · 玉京" },
] as const;

/**
 * 餘步加分: every move left when the goals are met (assist +步 included) turns into
 * 2 × (MOVE_BONUS_BASE + MOVE_BONUS_STEP × (level − 1)) points — 120 on 第 1 關, 200 on 第 21 關, up to 316 on 第 50 關,
 * so finishing early keeps paying as boards get harder.
 */
export const MOVE_BONUS_BASE = 60;
export const MOVE_BONUS_STEP = 2;
export const MOVE_BONUS_MULT = 2;
/** First-clear 墨玉 per star = REWARD_BASE + REWARD_STEP × level. */
export const REWARD_BASE = 40;
export const REWARD_STEP = 4;
/** Replaying a cleared level without improving its stars. */
export const REPLAY_INK = 20;

const S = (target: number): Goal => ({ type: "score", target });
const C = (kind: number, count: number): Goal => ({ type: "collect", kind, count });
const SEAL: Goal = { type: "seal" };

// Seal layouts (8 rows × 7 cols).
const L4 = [".......", ".......", ".1...1.", ".......", ".......", ".1...1.", ".......", "......."];
const L6 = [".......", ".......", ".1...1.", ".......", "...1...", ".......", ".1...1.", "......."];
const L8 = [".......", ".......", "1.....1", ".1...1.", ".1...1.", "1.....1", ".......", "......."];
const L8b = [".......", ".......", ".......", ".11.11.", ".......", ".11.11.", ".......", "......."];
const L10 = [".......", ".......", "..111..", ".......", ".1...1.", ".1...1.", "..111..", "......."];
const L8d = [".......", ".......", "...2...", "..1.1..", ".2...2.", "..1.1..", "...2...", "......."];
const L10d = [".......", ".......", ".......", "2.1.1.2", ".......", "2.1.1.2", ".......", "..1.1.."];
const L6c = [".......", ".......", ".......", ".......", ".......", "1.1.1.1", ".......", "...1..."];
const L12 = [".......", ".......", ".2...2.", "..1.1..", "...2...", "..1.1..", ".2...2.", "...1..."];
const L14 = [".......", ".......", "1.....1", "1.2.2.1", ".......", "1.2.2.1", "1.....1", "......."];
const L12d = [".......", ".......", ".......", ".22.22.", ".1...1.", ".22.22.", ".1...1.", "......."];
const L16 = [".......", ".......", "..2.2..", ".1.1.1.", "2.1.1.2", ".1.1.1.", "..2.2..", "......."];
const L10x = [".......", ".......", "...2...", "...2...", "22...22", "...2...", "...2...", "......."];
const L18 = [".......", ".......", "1.2.2.1", ".1...1.", "2.2.2.2", ".1...1.", "1.2.2.1", "......."];
// 卷四 · 紫闕 / 卷五 · 玉京: denser, more ice.
const L32 = [".......", ".......", "1.....1", ".1.1.1.", "..2.2..", ".1.1.1.", "1.....1", "......."];
const L34 = [".......", ".......", ".1.1.1.", "..2.2..", ".......", "..2.2..", ".1.1.1.", "......."];
const L36 = [".......", ".......", "2.1.1.2", ".1...1.", "1.2.2.1", ".1...1.", "2.1.1.2", "......."];
const L38 = [".......", ".......", "...1...", "..222..", ".22.22.", "..222..", "...1...", "......."];
const L39 = [".......", ".......", "1.1.1.1", ".2.2.2.", ".......", ".2.2.2.", "1.1.1.1", "......."];
const L40 = [".......", ".......", "2.2.2.2", ".1.1.1.", "2.1.1.2", ".1.1.1.", "2.2.2.2", "......."];
const L42 = [".......", ".......", ".2.2.2.", "1.....1", ".2.2.2.", "1.....1", ".2.2.2.", "......."];
const L44 = [".......", ".......", "..2.2..", ".2.1.2.", "2.1.1.2", ".2.1.2.", "..2.2..", "......."];
const L46 = [".......", ".......", "2.2.2.2", "..1.1..", "1.2.2.1", "..1.1..", "2.2.2.2", "......."];
const L48 = [".......", ".......", "1.2.2.1", "2.1.1.2", ".......", "2.1.1.2", "1.2.2.1", "......."];
const L49 = [".......", ".......", ".2.2.2.", "1.2.2.1", ".2.1.2.", "1.2.2.1", ".2.2.2.", "......."];
const L50 = [".......", ".......", "2.2.2.2", ".2.1.2.", "2.1.1.2", ".2.1.2.", "2.2.2.2", "......."];

/**
 * Tutorial openings. Level 2 has a straight 4 waiting; level 3 an L; level 5 a
 * straight 5 plus one of each special already on the board, ready to try.
 */
const PRESET_2 = {
  rows: ["1011221", "1103034", "5240553", "1301004", "1201315", "4325340", "0410421", "0311430"],
};
const PRESET_3 = {
  rows: ["3035513", "4252202", "1020241", "1023411", "4341424", "5140121", "0420103", "5154314"],
};
const PRESET_5 = {
  rows: ["2510135", "2122124", "5101030", "3523100", "0532104", "0043231", "5532004", "2211035"],
  specials: [
    [1, 2, "row"],
    [3, 5, "bomb"],
    [6, 1, "col"],
    [7, 4, "color"],
  ] as [number, number, Special][],
};

export const LEVELS: LevelDef[] = [
  { id: 1, moves: 25, goals: [S(1000)], stars: [1800, 2000], tip: "滑動交換相鄰的玉，三個一線就消除。" },
  { id: 2, moves: 24, goals: [C(0, 15)], stars: [1600, 1850], preset: PRESET_2, tip: "直排四個會凝成線玉：橫四清一整行，直四清一整列。" },
  { id: 3, moves: 24, goals: [S(1500)], stars: [2050, 2350], preset: PRESET_3, tip: "L 或 T 形五顆會鑲成金鑲玉，引爆周圍 3×3。" },
  { id: 4, moves: 24, goals: [SEAL], seal: L4, stars: [1650, 1800], tip: "墨封的玉不能移動。在它身上或旁邊連線，就能化開墨封。" },
  { id: 5, moves: 23, goals: [C(1, 18)], stars: [2150, 2550], preset: PRESET_5, tip: "直排五個化成龍珠：與任一顆玉交換，同色全消。兩件寶物互換有更大的效果。" },
  { id: 6, moves: 23, goals: [S(1500)], stars: [1950, 2300] },
  { id: 7, moves: 18, goals: [SEAL], seal: L6, stars: [1450, 1650] },
  { id: 8, moves: 22, goals: [C(2, 15), S(1300)], stars: [1900, 2250] },
  { id: 9, moves: 18, goals: [SEAL], seal: L8, stars: [1550, 1800] },
  // 章末關: each 卷's last level is a tougher finale (fewer moves, stacked goals, higher stars).
  { id: 10, moves: 20, goals: [SEAL, C(3, 15), C(4, 15)], seal: L10, stars: [2150, 2550] },
  { id: 11, moves: 21, goals: [S(1550)], stars: [1900, 2350] },
  { id: 12, moves: 16, goals: [SEAL], seal: L8d, stars: [1550, 1800], tip: "冰封墨要化兩次：先破冰，再化墨。" },
  { id: 13, moves: 21, goals: [C(5, 20)], stars: [1900, 2300] },
  { id: 14, moves: 21, goals: [SEAL, S(1600)], seal: L8b, stars: [2050, 2400] },
  { id: 15, moves: 22, goals: [C(0, 16), C(1, 16)], stars: [1800, 2200] },
  { id: 16, moves: 20, goals: [S(1450)], stars: [1850, 2350] },
  { id: 17, moves: 18, goals: [SEAL], seal: L10d, stars: [1900, 2150] },
  { id: 18, moves: 21, goals: [C(2, 18), SEAL], seal: L6c, stars: [2050, 2600] },
  { id: 19, moves: 21, goals: [C(3, 14), C(4, 14), C(5, 14)], stars: [1850, 2200] },
  { id: 20, moves: 22, goals: [SEAL, S(2000), C(2, 16)], seal: L12, stars: [2750, 3150] },
  { id: 21, moves: 19, goals: [S(1400)], stars: [1850, 2350] },
  { id: 22, moves: 14, goals: [SEAL], seal: L10, stars: [1600, 1750] },
  { id: 23, moves: 20, goals: [C(0, 17), C(5, 17)], stars: [1950, 2500] },
  { id: 24, moves: 20, goals: [SEAL, C(1, 16)], seal: L12d, stars: [2350, 2700] },
  { id: 25, moves: 18, goals: [S(1350)], stars: [1800, 2250] },
  { id: 26, moves: 18, goals: [SEAL], seal: L14, stars: [2100, 2350] },
  { id: 27, moves: 19, goals: [C(2, 15), C(3, 15), C(4, 15)], stars: [1800, 2050] },
  { id: 28, moves: 19, goals: [SEAL, S(1500)], seal: L10x, stars: [2150, 2550] },
  { id: 29, moves: 20, goals: [SEAL, C(0, 14), C(5, 14)], seal: L16, stars: [2300, 2700] },
  { id: 30, moves: 21, goals: [SEAL, S(2000), C(1, 16)], seal: L18, stars: [2750, 3200] },
  // 卷四 · 紫闕
  { id: 31, moves: 19, goals: [S(1450)], stars: [1900, 2500] },
  { id: 32, moves: 15, goals: [SEAL], seal: L32, stars: [1750, 2050] },
  { id: 33, moves: 20, goals: [C(1, 17), C(4, 17)], stars: [2000, 2500] },
  { id: 34, moves: 18, goals: [SEAL, C(2, 16)], seal: L34, stars: [2050, 2450] },
  { id: 35, moves: 18, goals: [S(1400)], stars: [1900, 2500] },
  { id: 36, moves: 22, goals: [SEAL], seal: L36, stars: [2750, 3200] },
  { id: 37, moves: 18, goals: [C(0, 15), C(3, 15), C(5, 15)], stars: [1750, 2300] },
  { id: 38, moves: 17, goals: [SEAL, S(1600)], seal: L38, stars: [2000, 2400] },
  { id: 39, moves: 21, goals: [SEAL, C(1, 14), C(4, 14)], seal: L39, stars: [2400, 2950] },
  { id: 40, moves: 23, goals: [SEAL, S(2000), C(3, 15)], seal: L40, stars: [3000, 3700] },
  // 卷五 · 玉京
  { id: 41, moves: 18, goals: [S(1450)], stars: [2000, 2550] },
  { id: 42, moves: 16, goals: [SEAL], seal: L42, stars: [2200, 2600] },
  { id: 43, moves: 19, goals: [C(2, 17), C(5, 17)], stars: [2050, 2450] },
  { id: 44, moves: 20, goals: [SEAL, C(0, 16)], seal: L44, stars: [2600, 2850] },
  { id: 45, moves: 17, goals: [S(1400)], stars: [1950, 2500] },
  { id: 46, moves: 21, goals: [SEAL], seal: L46, stars: [2650, 3200] },
  { id: 47, moves: 18, goals: [C(1, 14), C(2, 14), C(4, 14)], stars: [1900, 2350] },
  { id: 48, moves: 20, goals: [SEAL, S(1700)], seal: L48, stars: [2700, 3200] },
  { id: 49, moves: 22, goals: [SEAL, C(3, 15), C(5, 15)], seal: L49, stars: [2850, 3350] },
  { id: 50, moves: 23, goals: [SEAL, S(2000), C(0, 15)], seal: L50, stars: [3200, 4100] },
];

/** 章末關: the last level of each 卷 (10, 20, 30, 40, 50). */
export function isChapterFinale(id: number) {
  return CHAPTERS.some((c) => c.to === id);
}

export function levelById(id: number) {
  return LEVELS.find((l) => l.id === id) ?? null;
}

export function sealGrid(def: Pick<LevelDef, "seal">): number[][] {
  const rows = def.seal ?? Array.from({ length: LEVEL_ROWS }, () => ".".repeat(LEVEL_COLS));
  return rows.map((line) => [...line].map((ch) => (ch === "2" ? 2 : ch === "1" ? 1 : 0)));
}

export function startBoard(def: LevelDef, rng: Rng = Math.random): Board {
  if (def.preset) return boardFrom(def.preset.rows, def.preset.specials ?? [], sealGrid(def));
  return freshBoard(LEVEL_ROWS, LEVEL_COLS, sealGrid(def), rng);
}

export type Progress = { score: number; collected: number[]; sealsLeft: number; sealsTotal: number };

export function startProgress(board: Board): Progress {
  const n = sealsLeft(board);
  return { score: 0, collected: new Array<number>(KINDS).fill(0), sealsLeft: n, sealsTotal: n };
}

export function goalStatus(goal: Goal, p: Progress): { have: number; need: number; done: boolean } {
  if (goal.type === "score") return { have: p.score, need: goal.target, done: p.score >= goal.target };
  if (goal.type === "collect") {
    const have = p.collected[goal.kind] ?? 0;
    return { have, need: goal.count, done: have >= goal.count };
  }
  const have = p.sealsTotal - p.sealsLeft;
  return { have, need: p.sealsTotal, done: p.sealsLeft === 0 };
}

export function goalsMet(def: Pick<LevelDef, "goals">, p: Progress) {
  return def.goals.every((g) => goalStatus(g, p).done);
}

/** Points per remaining move on level `id`. */
export function moveBonusPer(id: number) {
  return MOVE_BONUS_MULT * (MOVE_BONUS_BASE + MOVE_BONUS_STEP * (Math.max(1, Math.floor(id)) - 1));
}

/** The whole 餘步加分 for `movesLeft` unused moves on level `id`. */
export function moveBonus(id: number, movesLeft: number) {
  return Math.max(0, Math.floor(movesLeft)) * moveBonusPer(id);
}

/** Saved / best / star score: the board score plus the remaining-move bonus. */
export function finalScore(score: number, movesLeft: number, id: number) {
  return score + moveBonus(id, movesLeft);
}

/** Running totals for the result count-up: entry i is the total after i + 1 moves are cashed in. */
export function bonusTally(score: number, movesLeft: number, id: number): number[] {
  const per = moveBonusPer(id);
  return Array.from({ length: Math.max(0, Math.floor(movesLeft)) }, (_, i) => score + per * (i + 1));
}

/** 1★ for clearing, 2★/3★ by final score (score + remaining-move bonus). */
export function starsFor(def: Pick<LevelDef, "stars">, final: number): 1 | 2 | 3 {
  if (final >= def.stars[1]) return 3;
  if (final >= def.stars[0]) return 2;
  return 1;
}

export function rewardPerStar(id: number) {
  return REWARD_BASE + REWARD_STEP * id;
}

/**
 * 墨玉 for a clear: the first clear pays per star; a later clear with more stars
 * pays only the new stars; any other replay pays REPLAY_INK.
 */
export function levelReward(id: number, prevStars: number, stars: number) {
  const per = rewardPerStar(id);
  if (prevStars <= 0) return per * stars;
  if (stars > prevStars) return per * (stars - prevStars);
  return REPLAY_INK;
}

export type LevelRecord = { stars: number; best: number };

export function isUnlocked(id: number, progress: Record<string, LevelRecord>) {
  return id === 1 || (progress[String(id - 1)]?.stars ?? 0) > 0;
}

export const MAX_STARS = LEVELS.length * 3;

/** Stars collected on the real levels (each capped at 3; unknown ids ignored). */
export function totalStars(progress: Record<string, LevelRecord>) {
  return LEVELS.reduce((n, l) => n + Math.min(3, Math.max(0, Math.floor(progress[String(l.id)]?.stars ?? 0))), 0);
}

/* ── 成就 · 卷滿: every 卷 pays 2000 墨玉 once, when all its stars (10 levels × 3) are in ── */
export const VOLUME_AWARD_INK = 2000;
/** 卷 id = 1-based position in CHAPTERS (卷一 = 1). Stored in the save as claimed ids. */
export const VOLUME_IDS = CHAPTERS.map((_, i) => i + 1);

const starsOf = (progress: Record<string, LevelRecord>, id: number) =>
  Math.min(3, Math.max(0, Math.floor(progress[String(id)]?.stars ?? 0)));

/** Stars collected / possible in one 卷. Unknown volume → 0/0. */
export function volumeStars(progress: Record<string, LevelRecord>, volume: number) {
  const ch = CHAPTERS[volume - 1];
  if (!ch) return { got: 0, max: 0 };
  let got = 0;
  for (let id = ch.from; id <= ch.to; id++) got += starsOf(progress, id);
  return { got, max: (ch.to - ch.from + 1) * 3 };
}

/** Keep only real, unique volume ids (for loading saves / cloud rows). */
export function cleanVolumeAwards(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  return VOLUME_IDS.filter((v) => input.some((x) => Number(x) === v));
}

export function volumeAwardReady(progress: Record<string, LevelRecord>, claimed: readonly number[], volume: number) {
  const { got, max } = volumeStars(progress, volume);
  return max > 0 && got >= max && !claimed.includes(volume);
}

/** Volumes that are full and not yet paid, in order. */
export function readyVolumes(progress: Record<string, LevelRecord>, claimed: readonly number[]) {
  return VOLUME_IDS.filter((v) => volumeAwardReady(progress, claimed, v));
}

/** Pay one 卷 once. Returns the new ink / claimed list and what was paid (0 = not full or already claimed). */
export function claimVolumeAward(state: { ink: number; m3: Record<string, LevelRecord>; volumeAwards: readonly number[] }, volume: number) {
  const claimed = cleanVolumeAwards(state.volumeAwards);
  if (!volumeAwardReady(state.m3, claimed, volume)) return { ink: state.ink, volumeAwards: claimed, paid: 0 };
  return { ink: state.ink + VOLUME_AWARD_INK, volumeAwards: cleanVolumeAwards([...claimed, volume]), paid: VOLUME_AWARD_INK };
}
