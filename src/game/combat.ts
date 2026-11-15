/**
 * 共用戰鬥引擎 (V2 戰鬥改版): every match-3 mode — 主線 50 關、深宮、劇情三消 — fights a visible 墨厄
 * on top of its original goals. Stars, 墨玉, 深宮 score and story unlocks are decided exactly as before;
 * the 墨厄 adds HP / 護盾 / 倒數 / 技能, up to three assists, 墨痕共鳴・天命共鳴 and 破厄.
 *
 * Pure (no React, no store) so tests, the UI and balance scripts share one implementation.
 * Defeating the 墨厄 (破厄) never changes score, so 深宮 anti-cheat bounds stay valid.
 */
import { HEAL_KIND, cloneBoard, hasMove, reshuffle, type Board, type Pos, type Rng, type Wave } from "./match3.ts";
import type { Goal, LevelDef } from "./levels.ts";

export const COMBAT = {
  jadeDamage: 27,
  chainBonus: 0.25,
  maxChainBonus: 2,
  specialDamage: 65,
  sealDamage: 24,
  shieldPerJade: 10,
  /** Base skill hit; + a share of max HP so late enemies still feel the cast. */
  skillDamage: 90,
  skillHpShare: 0.05,
  duoDamage: 240,
  duoHpShare: 0.06,
  trioDamage: 520,
  trioHpShare: 0.1,
  duoShred: 100,
  trioShred: 220,
  /** Casts chain while no more than this many player moves pass between them. */
  comboWindowMoves: 1,
  comboWindowMs: 20000,
  /** Team: most assists, energy one player action can add to each. */
  teamMax: 3,
  energyPerMoveCap: 22,
  /** Enemy seals never pile past this many sealed cells on the board. */
  sealCap: 6,
  /** 墨紋延伸: the 墨厄's own creeping 墨紋 (spread cells) never exceed this many on the board. */
  veinCap: 6,
  drainShare: 0.25,
  /** 破厄 gift: every assist's ring is topped up by this share once. */
  defeatCharge: 0.5,
} as const;

/* ── player 氣血 (replaces the move count) ──────────────────────────────── */

/**
 * The player's life. `def.moves` stays as a hidden balance number: max HP = moves × 40 (rounded to 50),
 * every 墨厄 attack hurts, 粉心玉（粉色愛心補血石） and support skills heal (never past max). HP 0 = 氣血耗盡 (loss).
 */
export const PLAYER = {
  hpPerMove: 40,
  /** 墨厄 attack: base damage, ×boss, ×phase 2 (they stack). */
  attackDamage: 140,
  bossMult: 1.25,
  phase2Mult: 1.2,
  /** HP per 粉心玉（粉色愛心補血石） cleared. */
  healPerJade: 45,
} as const;

export function playerMaxHp(moves: number): number {
  return Math.max(50, Math.round((Math.max(1, moves) * PLAYER.hpPerMove) / 50) * 50);
}
/** Clamp HP to 0…max (no overheal). */
export const clampHp = (hp: number, max: number) => Math.max(0, Math.min(max, Math.round(hp)));
export function healHp(hp: number, max: number, amount: number): number {
  return clampHp(hp + Math.max(0, amount), max);
}
/** HP restored by the 粉心玉（粉色愛心補血石） in a wave / a whole move's tallies. Green 青玉璧 does not heal. */
export function jadeHeal(collected: readonly number[]): number {
  return (collected[HEAL_KIND] ?? 0) * PLAYER.healPerJade;
}

/** True while any 墨封 (layer 1) or 冰封 (layer 2) remains on the board. */
export function boardHasSeal(board: { seal: readonly (readonly number[])[] }): boolean {
  for (const row of board.seal) {
    for (const n of row) if ((n ?? 0) > 0) return true;
  }
  return false;
}
/** Damage one 墨厄 attack deals to the player. */
export function attackDamage(def: Pick<EnemyDef, "boss">, phase: 1 | 2): number {
  return Math.round(PLAYER.attackDamage * (def.boss ? PLAYER.bossMult : 1) * (phase === 2 ? PLAYER.phase2Mult : 1));
}
/**
 * 餘血加分: remaining life converted back into "unused moves" for the old leftover bonus,
 * floor(hpLeft / maxHp × moves), never more than `moves` (so the bonus never exceeds moves × per).
 */
export function hpEquivMoves(hpLeft: number, maxHp: number, moves: number): number {
  if (maxHp <= 0 || hpLeft <= 0) return 0;
  return Math.max(0, Math.min(moves, Math.floor((Math.min(hpLeft, maxHp) / maxHp) * moves)));
}

/**
 * 過關條件 (主線 / 深宮 / 劇情三消): the ONLY win is 破厄 (enemy HP 0). Score / collect / seal goals never
 * end or gate a fight. Loss: 氣血 0 while the 墨厄 still stands; story 燈火 (lamp) at 0 is also a loss.
 * Returns null while the fight goes on.
 */
export function fightOutcome(s: { defeated: boolean; hp: number; lamp?: number | null }): "win" | "lose" | null {
  if (s.lamp != null && s.lamp <= 0) return "lose";
  if (s.defeated) return "win";
  if (s.hp <= 0) return "lose";
  return null;
}

export type EnemySkill = "ink" | "ice" | "drain" | "shield" | "dim";
export type EnemyArt = "shade" | "moth" | "crow" | "beast" | "mirage" | "lord" | "lamp";

export type EnemyDef = {
  id: string;
  name: string;
  /** e.g. "卷一 · 章末首領" */
  title: string;
  hp: number;
  /** Shield gained on each attack. */
  shield: number;
  attackEvery: number;
  skills: EnemySkill[];
  ink: number;
  ice: number;
  /** 墨紋延伸: cells the ink veins creep onto per attack (orthogonal neighbours of sealed cells). 0 = none. */
  spread?: number;
  /** Lamp loss per attack (story 燈火守護 only). */
  dim: number;
  /** Phase 2 under this HP share: attacks one move sooner and add ice. */
  phaseAt: number;
  boss: boolean;
  art: EnemyArt;
  /** Optional illustration for the big 墨厄 panel (see ENEMY_IMAGES); the code-drawn ink body is the fallback. */
  image?: string;
  /** Damage taken per jade kind (墨厄抗性). 1 = normal; missing = 1. */
  resist?: Partial<Record<number, number>>;
  traits: string[];
};

export type EnemyState = {
  hp: number;
  maxHp: number;
  shield: number;
  countdown: number;
  phase: 1 | 2;
  defeated: boolean;
  damage: number;
  attacks: number;
  /** Cells sealed by the 墨厄 (cleared on 破厄). */
  placed: string[];
  /** Story 燈火 (0–100); null outside 燈火守護. */
  lamp: number | null;
};

export type AttackOutcome = {
  state: EnemyState;
  board: Board;
  sealed: Pos[];
  drain: number;
  dimmed: number;
  shield: number;
  /** Damage dealt to the player's 氣血. */
  hurt: number;
  label: string;
};

const key = (p: Pos) => `${p.r},${p.c}`;
const clampInt = (n: number) => Math.max(0, Math.round(n));

/* ── roster ─────────────────────────────────────────────────────────────── */

const MINIONS: { name: string; art: EnemyArt; trait: string }[] = [
  { name: "墨魅", art: "shade", trait: "墨封：封住玉石" },
  { name: "噬墨蠹", art: "moth", trait: "出手傷你的氣血" },
  { name: "墨鴉", art: "crow", trait: "墨封：封住玉石" },
  { name: "濁墨傀", art: "beast", trait: "護盾：攻擊後立盾" },
  { name: "墨蜃", art: "mirage", trait: "出手傷你的氣血" },
];

const BOSSES: Record<number, { name: string; art: EnemyArt }> = {
  10: { name: "青川墨蛟", art: "beast" },
  20: { name: "墨池硯魔", art: "shade" },
  30: { name: "赤霄墨狻", art: "beast" },
  40: { name: "紫闕墨蜃", art: "mirage" },
  50: { name: "玉京墨君", art: "lord" },
};

const VOLUME_NAMES = ["卷一", "卷二", "卷三", "卷四", "卷五"] as const;

/** Expected per-move damage of a plain greedy player; calibrated by scripts/combat-balance.mjs. */
export const HP_PER_MOVE = 150;

function hasSealGoal(goals: readonly Goal[]) {
  return goals.some((g) => g.type === "seal");
}

/**
 * 墨紋延伸 (t438u, corrected t439u): 「到40關 沒弄掉墨紋墨紋會延伸」. 主線 1–39 never creep (the 墨厄 may still
 * drop isolated locks). From 第 40 關: 1 cell per trigger; 首領 (40, 50) +1. A trigger is every player move that
 * leaves a 墨紋 standing, and every 墨厄 attack.
 */
export const SPREAD_FROM = 40;
export function spreadForLevel(id: number, boss: boolean): number {
  if (id < SPREAD_FROM) return 0;
  return 1 + (boss ? 1 : 0);
}

/** 深宮: the same rule — floors 40+ creep 1 cell per trigger; 試煉首領 +1. */
export function spreadForFloor(floor: number, boss: boolean): number {
  if (floor < SPREAD_FROM) return 0;
  return 1 + (boss ? 1 : 0);
}

/**
 * The 墨厄 for 主線 第 N 關. HP grows gently with the level and the 章末關 holds a 首領
 * (more HP, 護盾, two phases). A level with a 破封 goal never gets enemy seals (so the goal
 * still counts only the stage's own seals); its 墨厄 still deals HP damage.
 */
export function enemyForLevel(def: Pick<LevelDef, "id" | "moves" | "goals">): EnemyDef {
  const id = def.id;
  const vol = Math.min(4, Math.floor((id - 1) / 10));
  const boss = id % 10 === 0;
  const growth = 0.78 + 0.008 * (id - 1); // 0.78 → 1.17
  const hp = Math.round((def.moves * HP_PER_MOVE * growth * (boss ? 1.18 : 1)) / 50) * 50;
  // 破封 goals, and triple-collect boards, get no enemy seals so goals stay as designed.
  const sealGoal = hasSealGoal(def.goals) || def.goals.filter((g) => g.type === "collect").length >= 3;
  const m = MINIONS[(id - 1) % MINIONS.length]!;
  const skills: EnemySkill[] = [];
  if (!sealGoal) skills.push("ink");
  if (sealGoal || m.art === "moth" || m.art === "mirage" || boss) skills.push("drain");
  if (boss || m.art === "beast" || id > 20) skills.push("shield");
  const attackEvery = boss ? 3 : id > 30 ? 3 : 4;
  // Light touch: one ink seal per attack (two for 首領 / 卷四+), ice only from a 首領 in phase 2,
  // so the 墨厄 never meaningfully lowers the plain clear rate (see scripts/combat-balance.mjs).
  const ink = sealGoal ? 0 : boss || vol >= 3 ? 2 : 1;
  const ice = !sealGoal && boss ? 1 : 0;
  const shield = skills.includes("shield") ? Math.round((boss ? 80 : 40) + vol * 15) : 0;
  const b = boss ? BOSSES[id]! : null;
  return {
    id: `lv-${id}`,
    name: b ? b.name : m.name,
    title: `${VOLUME_NAMES[vol]} · ${boss ? "章末首領" : "墨厄"}`,
    hp,
    shield,
    attackEvery,
    skills,
    ink,
    ice,
    spread: spreadForLevel(id, boss),
    dim: 0,
    phaseAt: boss ? 0.5 : 0,
    boss,
    art: b ? b.art : m.art,
    traits: describeSkills(skills, attackEvery, boss, spreadForLevel(id, boss)),
  };
}

/** 深宮 第 N 層: the same family, scaling with height; every 10th (試煉) floor is a 首領. */
export function enemyForFloor(floor: number, def: Pick<LevelDef, "moves" | "goals">): EnemyDef {
  const f = Math.max(1, Math.floor(floor));
  const boss = f % 10 === 0;
  const growth = Math.min(1.4, 0.72 + 0.01 * (f - 1));
  const hp = Math.round((def.moves * HP_PER_MOVE * growth * (boss ? 1.2 : 1)) / 50) * 50;
  const sealGoal = hasSealGoal(def.goals);
  const m = MINIONS[(f + 2) % MINIONS.length]!;
  const skills: EnemySkill[] = [];
  if (!sealGoal) skills.push("ink");
  if (sealGoal || boss || f > 15) skills.push("drain");
  if (boss || f > 8) skills.push("shield");
  const attackEvery = boss || f > 25 ? 3 : 4;
  return {
    id: `sg-${f}`,
    name: boss ? "宮闈墨魘" : `深宮${m.name}`,
    title: boss ? `第 ${f} 層 · 試煉首領` : `第 ${f} 層 · 墨厄`,
    hp,
    shield: skills.includes("shield") ? Math.min(220, 40 + f * 3) : 0,
    attackEvery,
    skills,
    ink: sealGoal ? 0 : Math.min(2, 1 + Math.floor(f / 30)),
    ice: !sealGoal && boss ? 1 : 0,
    spread: spreadForFloor(f, boss),
    dim: 0,
    phaseAt: boss ? 0.5 : 0,
    boss,
    art: boss ? "lord" : m.art,
    traits: describeSkills(skills, attackEvery, boss, spreadForFloor(f, boss)),
  };
}

function describeSkills(skills: EnemySkill[], every: number, boss: boolean, spread = 0): string[] {
  const t = [`每 ${every} 回出手一次，傷你的氣血`];
  if (skills.includes("ink")) t.push("墨封：封住玉石（破厄後化開）");
  if (spread > 0) t.push(`墨紋延伸：墨紋沒化開，每回與每次出手都會向相鄰延伸 ${spread} 顆；化開方式與墨封相同`);
  if (skills.includes("shield")) t.push("護盾：出手後立盾，消除可削盾");
  if (skills.includes("dim")) t.push("吞燈：熄滅燈火");
  if (boss) t.push("生命低於一半：出手更快並追加冰封");
  return t;
}

/* ── state ──────────────────────────────────────────────────────────────── */

export function startEnemy(def: EnemyDef, lamp: number | null = null): EnemyState {
  return {
    hp: def.hp,
    maxHp: def.hp,
    shield: 0,
    countdown: def.attackEvery,
    phase: 1,
    defeated: false,
    damage: 0,
    attacks: 0,
    placed: [],
    lamp,
  };
}

export function waveDamage(def: Pick<EnemyDef, "resist">, w: Pick<Wave, "removed" | "effects" | "sealHits" | "collected">, index: number, mult = 1): number {
  const counted = w.collected.reduce((a, b) => a + b, 0);
  let jades = Math.max(0, w.removed.length - counted);
  w.collected.forEach((n, k) => (jades += n * (def.resist?.[k] ?? 1)));
  const chain = 1 + Math.min(COMBAT.maxChainBonus, index * COMBAT.chainBonus);
  return Math.round(
    (jades * COMBAT.jadeDamage * chain + w.effects.length * COMBAT.specialDamage + w.sealHits.length * COMBAT.sealDamage) * mult,
  );
}

/** Damage after the shield (shred first, then the shield soaks). */
export function hurt(s: EnemyState, amount: number, shred = 0): { state: EnemyState; dealt: number } {
  if (s.defeated) return { state: s, dealt: 0 };
  const shield = Math.max(0, s.shield - shred);
  const absorbed = Math.min(shield, Math.max(0, amount));
  const dealt = Math.min(s.hp, Math.max(0, amount - absorbed));
  const hp = s.hp - dealt;
  return {
    state: { ...s, hp, shield: shield - absorbed, damage: s.damage + dealt, defeated: hp <= 0 },
    dealt,
  };
}

/** t507: `startIndex` = cascade index of `waves[0]` (a caller playing one wave at a time passes its real index). */
export function hitWithWaves(def: EnemyDef, s: EnemyState, waves: Pick<Wave, "removed" | "effects" | "sealHits" | "collected">[], mult = 1, startIndex = 0, board?: { seal: readonly (readonly number[])[] }) {
  if (board && boardHasSeal(board)) {
    return { state: s, hits: waves.map(() => 0) };
  }
  let state = s;
  const hits: number[] = [];
  waves.forEach((w, i) => {
    const r = hurt(state, waveDamage(def, w, startIndex + i, mult), w.removed.length * COMBAT.shieldPerJade);
    state = r.state;
    hits.push(r.dealt);
  });
  return { state: withPhase(def, state), hits };
}

export function skillHit(def: EnemyDef, s: EnemyState, crackHits = 0, board?: { seal: readonly (readonly number[])[] }) {
  if (board && boardHasSeal(board)) return { state: withPhase(def, s), dealt: 0 };
  const amount = COMBAT.skillDamage + def.hp * COMBAT.skillHpShare + crackHits * COMBAT.sealDamage;
  const r = hurt(s, Math.round(amount));
  return { state: withPhase(def, r.state), dealt: r.dealt };
}

export function comboHit(def: EnemyDef, s: EnemyState, combo: "duo" | "trio", board?: { seal: readonly (readonly number[])[] }) {
  if (board && boardHasSeal(board)) return { state: withPhase(def, s), dealt: 0 };
  const trio = combo === "trio";
  const amount = trio ? COMBAT.trioDamage + def.hp * COMBAT.trioHpShare : COMBAT.duoDamage + def.hp * COMBAT.duoHpShare;
  const r = hurt(s, Math.round(amount), trio ? COMBAT.trioShred : COMBAT.duoShred);
  return { state: withPhase(def, r.state), dealt: r.dealt };
}

function withPhase(def: EnemyDef, s: EnemyState): EnemyState {
  if (s.phase === 1 && def.phaseAt > 0 && s.hp > 0 && s.hp < def.hp * def.phaseAt) {
    return { ...s, phase: 2, countdown: Math.min(s.countdown, Math.max(1, def.attackEvery - 1)) };
  }
  return s;
}

/** Story 燈火: clearing the lamp's jade feeds it (capped at 100). */
export function feedLamp(s: EnemyState, amount: number): EnemyState {
  if (s.lamp === null || amount <= 0) return s;
  return { ...s, lamp: Math.min(100, s.lamp + amount) };
}

/** One player move passed: count down; at zero the 墨厄 acts. Defeated enemies never act. */
export function enemyTurn(def: EnemyDef, s: EnemyState, board: Board, rng: Rng = Math.random): AttackOutcome | { state: EnemyState; board: Board; attacked: false } {
  if (s.defeated) return { state: s, board, attacked: false };
  const countdown = s.countdown - 1;
  if (countdown > 0) return { state: { ...s, countdown }, board, attacked: false };
  return enemyAttack(def, s, board, rng);
}

export function enemyAttack(def: EnemyDef, s: EnemyState, board: Board, rng: Rng = Math.random): AttackOutcome {
  const phase2 = s.phase === 2;
  let b = cloneBoard(board);
  const sealed: Pos[] = [];
  const parts: string[] = [];
  if (def.skills.includes("ink") && (def.ink > 0 || (phase2 && def.ice > 0))) {
    const spots: Pos[] = [];
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (!b.seal[r]![c]) spots.push({ r, c });
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [spots[i], spots[j]] = [spots[j]!, spots[i]!];
    }
    const count = b.seal.flat().filter(Boolean).length;
    const room = Math.max(0, COMBAT.sealCap - count);
    const layers = [...Array(def.ink).fill(1), ...Array(phase2 || def.boss === false ? def.ice : 0).fill(2)].slice(0, room);
    for (const layer of layers) {
      const p = spots.shift();
      if (!p) break;
      b.seal[p.r]![p.c] = layer;
      // never seal the last legal move
      if (!hasMove(b)) b.seal[p.r]![p.c] = 0;
      else sealed.push(p);
    }
    if (!hasMove(b)) b = reshuffle(b, rng);
    if (sealed.length) parts.push(`墨封 ×${sealed.length}`);
  }
  const spreadOut = (def.spread ?? 0) > 0 ? spreadVeins(b, def.spread ?? 0, [...s.placed, ...sealed.map(key)], rng, true) : { board: b, cells: [] };
  if (spreadOut.cells.length) {
    b = spreadOut.board;
    sealed.push(...spreadOut.cells);
    parts.push(`墨紋延伸 ×${spreadOut.cells.length}`);
  }
  const drain = 0; // Enemy attacks never spend the team's charge.
  const shield = def.skills.includes("shield") ? Math.round(def.shield * (phase2 ? 1.3 : 1)) : 0;
  if (shield) parts.push(`護盾 ${shield}`);
  const dimmed = def.skills.includes("dim") && s.lamp !== null ? Math.round(def.dim * (phase2 ? 1.25 : 1)) : 0;
  if (dimmed) parts.push(`燈火 −${dimmed}`);
  const placed = [...new Set([...s.placed, ...sealed.map(key)])];
  const hurt = attackDamage(def, s.phase);
  parts.unshift(`傷害 ${hurt}`);
  return {
    state: {
      ...s,
      countdown: phase2 ? Math.max(1, def.attackEvery - 1) : def.attackEvery,
      shield: Math.max(s.shield, shield),
      attacks: s.attacks + 1,
      placed,
      lamp: s.lamp === null ? null : Math.max(0, s.lamp - dimmed),
    },
    board: b,
    sealed,
    drain,
    dimmed,
    shield,
    hurt,
    label: `${def.name}出手 · ${parts.join("、")}`,
  };
}

/**
 * 墨紋延伸: the 墨厄's own 墨紋 (`veins`, "r,c" keys of enemy-placed seals) creep onto orthogonal unsealed
 * neighbours, one cell at a time so they grow as one vein. Stage 墨封 never creep. With no 墨紋 left and
 * `seed` set (a 墨厄 attack), one random cell is seeded first. Never seals the last legal move; at most
 * COMBAT.veinCap 墨厄 cells. Unlocking is the plain 墨封 rule: a line on the cell or beside it.
 */
export function spreadVeins(board: Board, n: number, veins: string[], rng: Rng = Math.random, seed = false): { board: Board; cells: Pos[] } {
  const live = veins.filter((k) => {
    const [r, c] = k.split(",").map(Number) as [number, number];
    return (board.seal[r]?.[c] ?? 0) > 0;
  });
  const room = Math.min(n, Math.max(0, COMBAT.veinCap - live.length));
  if (room <= 0 || (!live.length && !seed)) return { board, cells: [] };
  const b = cloneBoard(board);
  const cells: Pos[] = [];
  const src = live.map((k) => k.split(",").map(Number) as [number, number]);
  const banned = new Set<string>();
  const sealedAt = (r: number, c: number) => (b.seal[r]?.[c] ?? 0) > 0;
  for (let i = 0; i < room; i++) {
    const frontier: Pos[] = [];
    const seen = new Set<string>();
    for (const [r, c] of src)
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const q = { r: r + dr, c: c + dc };
        const k = key(q);
        if (q.r < 0 || q.c < 0 || q.r >= b.rows || q.c >= b.cols || sealedAt(q.r, q.c) || seen.has(k) || banned.has(k)) continue;
        seen.add(k);
        frontier.push(q);
      }
    let pool = frontier;
    if (!src.length) {
      for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (!sealedAt(r, c) && !banned.has(key({ r, c }))) pool.push({ r, c });
    }
    let placed = false;
    while (pool.length && !placed) {
      const j = Math.floor(rng() * pool.length);
      const p = pool[j]!;
      pool = [...pool.slice(0, j), ...pool.slice(j + 1)];
      b.seal[p.r]![p.c] = 1;
      if (hasMove(b)) {
        cells.push(p);
        src.push([p.r, p.c]);
        placed = true;
      } else {
        b.seal[p.r]![p.c] = 0;
        banned.add(key(p));
      }
    }
    if (!placed) break;
  }
  return { board: cells.length ? b : board, cells };
}

/** 「沒弄掉就會延伸」: after a player move, any 墨紋 still standing creeps (from 第 40 關 / 深宮 40 層). */
export function creepAfterMove(def: Pick<EnemyDef, "spread">, s: EnemyState, board: Board, rng: Rng = Math.random): { state: EnemyState; board: Board; cells: Pos[] } {
  const n = def.spread ?? 0;
  if (n <= 0 || s.defeated || !s.placed.length) return { state: s, board, cells: [] };
  const out = spreadVeins(board, n, s.placed, rng, false);
  if (!out.cells.length) return { state: s, board, cells: [] };
  return { state: { ...s, placed: [...new Set([...s.placed, ...out.cells.map(key)])] }, board: out.board, cells: out.cells };
}

/** 破厄: the 墨厄's own seals melt away (stage seals stay). */
export function purgeEnemySeals(s: EnemyState, board: Board): { board: Board; cleared: Pos[] } {
  if (!s.placed.length) return { board, cleared: [] };
  const b = cloneBoard(board);
  const cleared: Pos[] = [];
  for (const k of s.placed) {
    const [r, c] = k.split(",").map(Number) as [number, number];
    if (b.seal[r]?.[c]) {
      b.seal[r]![c] = 0;
      cleared.push({ r, c });
    }
  }
  return { board: b, cleared };
}

/** Enemy seals broken by the player no longer belong to the 墨厄. */
export function forgetBroken(s: EnemyState, board: Board): EnemyState {
  const placed = s.placed.filter((k) => {
    const [r, c] = k.split(",").map(Number) as [number, number];
    return (board.seal[r]?.[c] ?? 0) > 0;
  });
  return placed.length === s.placed.length ? s : { ...s, placed };
}

/* ── team & 天命連攜 ─────────────────────────────────────────────────────── */

export type ChainState = { ids: string[]; turn: number; at: number };
export const freshChain = (): ChainState => ({ ids: [], turn: -99, at: 0 });

/**
 * A cast joins the chain when a different assist cast within one player move (and 20 s).
 * Two in a row → 墨痕共鳴, three → 天命共鳴; the chain then resets, so it can never loop.
 */
export function chainCast(chain: ChainState, id: string, turn: number, now: number): { chain: ChainState; combo: "duo" | "trio" | null; ids: string[] } {
  const joins =
    chain.ids.length > 0 &&
    chain.ids.length < 3 &&
    !chain.ids.includes(id) &&
    turn - chain.turn <= COMBAT.comboWindowMoves &&
    now - chain.at <= COMBAT.comboWindowMs;
  const ids = joins ? [...chain.ids, id] : [id];
  const combo = ids.length === 3 ? "trio" : ids.length === 2 ? "duo" : null;
  return { chain: { ids: combo === "trio" ? [] : ids, turn, at: now }, combo, ids };
}

export const COMBO_NAME = { duo: "墨痕共鳴", trio: "天命共鳴" } as const;

/** Team for a run: up to three distinct owned ids; falls back to the single (pinned/auto) assist. */
export function combatTeam(team: readonly string[] | undefined, owned: Record<string, number>, fallback: string | null, hasSkill: (id: string) => boolean): string[] {
  const ids = [...new Set((team ?? []).filter((id) => (owned[id] ?? 0) > 0 && hasSkill(id)))].slice(0, COMBAT.teamMax);
  if (ids.length) return ids;
  return fallback ? [fallback] : [];
}

/** Energy one player move gives each assist: uncapped for a lone assist (V1 feel), capped for a team. */
export function moveEnergy(perWave: number[], teamSize: number): number {
  const total = perWave.reduce((a, b) => a + b, 0);
  return teamSize > 1 ? Math.min(COMBAT.energyPerMoveCap, total) : total;
}


export const hpRatio = (s: EnemyState) => (s.maxHp > 0 ? Math.max(0, s.hp / s.maxHp) : 0);
export { clampInt };

/**
 * 墨厄插圖: drop a picture in /public/enemies/ and map it here — by enemy id (e.g. "lv-10", "sg-3"),
 * by name (e.g. "墨魅", "青川墨蛟") or by art kind ("shade" | "moth" | "crow" | "beast" | "mirage" | "lord" | "lamp").
 * The big 墨厄 panel shows it (object-fit: contain) instead of the code-drawn ink body.
 */
export const ENEMY_IMAGES: Record<string, string> = {};
export function enemyImage(def: Pick<EnemyDef, "id" | "name" | "art" | "image">, images: Record<string, string> = ENEMY_IMAGES): string | null {
  return def.image ?? images[def.id] ?? images[def.name] ?? images[def.art] ?? null;
}
