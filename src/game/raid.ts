/**
 * Independent raid rules. The map/tower score and reward rules never enter this module.
 *
 * 鎮厄司 (階段 H / I): three encounter tiers fought with the SHARED HP combat (combat.ts, via the Match3 Game
 * in raid mode) — 普通討伐 (第 10 關), 精英討伐 (第 20 關), 首領封印 (第 40 關). Every win drops 命器
 * materials (never 墨玉); the first win of each tier adds a one-time material bonus (sticky marker).
 * The older move-based helpers below (startRaid / raidSwap / raidSkill) are kept only for the legacy tests.
 */
import { BY_ID } from "./data.ts";
import type { EnemyDef } from "./combat.ts";
import type { LevelDef } from "./levels.ts";
import type { MaterialId, UnlockKey } from "./artifacts.ts";
import { activateSkill, chargeCost, waveEnergy } from "./assist.ts";
import { raidMoves, skillFx, skillOf } from "./skills.ts";
import {
  cloneBoard,
  freshBoard,
  hasMove,
  reshuffle,
  trySwap,
  type Board,
  type Pos,
  type Rng,
  type Wave,
} from "./match3.ts";

export type BossDef = {
  id: string;
  name: string;
  hp: number;
  moves: number;
  attackEvery: number;
  phaseAt: number;
  ink: number;
  ice: number;
  shield: number;
  reward: number;
  traits: string[];
  recommended: string;
};
export const RAID_BOSSES: BossDef[] = [
  {
    id: "ink-shadow",
    name: "噬墨之影",
    hp: 5000,
    moves: 20,
    attackEvery: 3,
    phaseAt: 0.5,
    ink: 2,
    ice: 1,
    shield: 95,
    reward: 300,
    traits: [
      "每三次有效移動：墨封與護盾",
      "生命低於一半：追加冰封",
      "消除可削減護盾；鄰近消除可破封",
    ],
    recommended: "破封、特殊玉、加步；任意稀有度皆能連攜",
  },
];
export const RAID_RULES = {
  jadeDamage: 27,
  chainBonus: 0.25,
  maxChainBonus: 2,
  specialDamage: 65,
  sealDamage: 24,
  skillDamage: 90,
  shieldPerJade: 10,
  duoDamage: 240,
  trioDamage: 520,
  duoShred: 100,
  trioShred: 220,
  comboWindowMs: 20000,
  comboWindowMoves: 1,
  energyPerMoveCap: 22,
  bonusMovesCap: 12,
  sealCap: 10,
  rewardBonusCap: 0.5,
} as const;
export type RaidRecord = {
  cleared: boolean;
  /** Legacy one-time 墨玉 first-win marker (噬墨之影 only; sticky). */
  rewardClaimed: boolean;
  bestMoves: number;
  /** Wins of this encounter (additive; old saves → 0 / derived from `cleared`). */
  clears?: number;
  /** One-time first-clear material bonus paid (sticky). */
  firstDrop?: boolean;
  /** 鎮厄司 lobby (t470): fights started here (win or loss). Additive, display-only (「開始／再次討伐」). */
  tries?: number;
};
export type RaidSave = { team: string[]; records: Record<string, RaidRecord> };
export const emptyRaid = (): RaidSave => ({ team: [], records: {} });
export function cleanRaidTeam(raw: unknown, owned: Record<string, number>): string[] {
  return Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter(
            (id): id is string =>
              typeof id === "string" && !!BY_ID[id] && !!skillOf(id) && (owned[id] ?? 0) > 0,
          ),
        ),
      ].slice(0, 3)
    : [];
}
export function cleanRaid(raw: unknown, owned: Record<string, number>): RaidSave {
  const r = raw && typeof raw === "object" ? (raw as Partial<RaidSave>) : {};
  const records: RaidSave["records"] = {};
  for (const e of RAID_ENCOUNTERS) {
    const v = r.records?.[e.id];
    if (!v || typeof v !== "object") continue;
    const cleared = v.cleared === true;
    const clears = Number.isFinite(v.clears) ? Math.max(0, Math.min(99_999, Math.floor(v.clears as number))) : 0;
    records[e.id] = {
      cleared,
      rewardClaimed: v.rewardClaimed === true,
      bestMoves: Number.isFinite(v.bestMoves) ? Math.max(0, Math.min(999, Math.floor(v.bestMoves))) : 0,
      clears: Math.max(clears, cleared ? 1 : 0),
      // An old save that already won 噬墨之影 under the 墨玉 first-win reward still gets the material bonus once.
      firstDrop: v.firstDrop === true,
    };
    const tries = Number.isFinite(v.tries) ? Math.max(0, Math.min(99_999, Math.floor(v.tries as number))) : 0;
    if (tries > 0) records[e.id]!.tries = tries;
  }
  return { team: cleanRaidTeam(r.team, owned), records };
}
/** Sticky claim markers prevent an older cloud/local snapshot paying a second time. */
export function mergeRaid(local: RaidSave, incoming: RaidSave): RaidSave {
  const records = { ...local.records };
  for (const [id, r] of Object.entries(incoming.records)) {
    const old = records[id];
    records[id] = {
      cleared: r.cleared || !!old?.cleared,
      rewardClaimed: r.rewardClaimed || !!old?.rewardClaimed,
      bestMoves: Math.max(r.bestMoves, old?.bestMoves ?? 0),
      clears: Math.max(r.clears ?? 0, old?.clears ?? 0),
      firstDrop: !!r.firstDrop || !!old?.firstDrop,
    };
    const tries = Math.max(r.tries ?? 0, old?.tries ?? 0);
    if (tries > 0) records[id]!.tries = tries;
  }
  return { team: incoming.team, records };
}
export function recordRaidWin(save: RaidSave, boss: BossDef, moves: number, bonus = 0) {
  const old = save.records[boss.id];
  const reward = old?.rewardClaimed
    ? 0
    : Math.round(boss.reward * (1 + Math.max(0, Math.min(RAID_RULES.rewardBonusCap, bonus))));
  return {
    reward,
    raid: {
      ...save,
      records: {
        ...save.records,
        [boss.id]: {
          cleared: true,
          rewardClaimed: true,
          bestMoves: Math.max(old?.bestMoves ?? 0, moves),
        },
      },
    },
  };
}
export type Fighter = { id: string; copies: number; energy: number; cost: number; uses: number };
export type RaidState = {
  bossId: string;
  board: Board;
  hp: number;
  shield: number;
  phase: 1 | 2;
  moves: number;
  turns: number;
  bonusMoves: number;
  fighters: Fighter[];
  buff: number;
  rewardBuff: number;
  chain: { ids: string[]; at: number; turn: number };
  status: "play" | "won" | "lost";
  damage: number;
};
export type RaidEvent = {
  kind: "hit" | "special" | "skill" | "duo" | "trio" | "attack" | "shuffle";
  damage: number;
  ids?: string[];
  wave?: Wave;
};
export type RaidTransition = { state: RaidState; events: RaidEvent[] };
export function startRaid(
  boss: BossDef,
  team: string[],
  owned: Record<string, number>,
  rng: Rng = Math.random,
): RaidState {
  const ids = cleanRaidTeam(team, owned);
  if (!ids.length) throw new Error("請選擇至少一位已相逢的助陣");
  return {
    bossId: boss.id,
    board: freshBoard(8, 7, undefined, rng),
    hp: boss.hp,
    shield: 0,
    phase: 1,
    moves: boss.moves,
    turns: 0,
    bonusMoves: 0,
    fighters: ids.map((id) => ({
      id,
      copies: owned[id]!,
      energy: 0,
      cost: chargeCost(BY_ID[id]!.rarity, owned[id]!),
      uses: 0,
    })),
    buff: 1,
    rewardBuff: 0,
    chain: { ids: [], at: 0, turn: 0 },
    status: "play",
    damage: 0,
  };
}
export function waveDamage(
  w: Pick<Wave, "removed" | "effects" | "sealHits">,
  index: number,
  mult = 1,
): number {
  return Math.round(
    (w.removed.length *
      RAID_RULES.jadeDamage *
      (1 + Math.min(RAID_RULES.maxChainBonus, index * RAID_RULES.chainBonus)) +
      w.effects.length * RAID_RULES.specialDamage +
      w.sealHits.length * RAID_RULES.sealDamage) *
      mult,
  );
}
function hurt(s: RaidState, amount: number, shred = 0): RaidState {
  const shield = Math.max(0, s.shield - shred);
  const absorbed = Math.min(shield, amount);
  const dealt = Math.min(s.hp, Math.max(0, amount - absorbed));
  return {
    ...s,
    hp: s.hp - dealt,
    damage: s.damage + dealt,
    shield: shield - absorbed,
    status: s.hp - dealt <= 0 ? "won" : s.status,
  };
}
function applyWaves(s: RaidState, waves: Wave[], events: RaidEvent[]): RaidState {
  for (const [i, w] of waves.entries()) {
    const before = s.hp;
    s = hurt(s, waveDamage(w, i, s.buff), w.removed.length * RAID_RULES.shieldPerJade);
    events.push({ kind: w.effects.length ? "special" : "hit", damage: before - s.hp, wave: w });
    if (s.status === "won") break;
  }
  return s;
}
/** A safe recovery even for pathological old/custom boards whose seals block every swap. */
export function ensureRaidMove(board: Board, rng: Rng = Math.random): Board {
  if (hasMove(board)) return board;
  let next = reshuffle(board, rng);
  if (hasMove(next)) return next;
  next = cloneBoard(next);
  next.seal = next.seal.map((row) => row.map(() => 0));
  return reshuffle(next, rng);
}
export function bossAttack(state: RaidState, boss: BossDef, rng: Rng = Math.random): RaidState {
  let board = cloneBoard(state.board);
  const phase = state.hp < boss.hp * boss.phaseAt ? 2 : state.phase;
  const spots = board.cells
    .flatMap((row, r) => row.map((_, c) => ({ r, c })))
    .filter((p) => !board.seal[p.r]![p.c]);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j]!, spots[i]!];
  }
  const count = board.seal.flat().filter(Boolean).length;
  const capacity = Math.max(0, RAID_RULES.sealCap - count);
  const wanted = [...Array(boss.ink).fill(1), ...Array(phase === 2 ? boss.ice : 0).fill(2)].slice(
    0,
    capacity,
  );
  for (const [i, layer] of wanted.entries()) {
    const p = spots[i];
    if (!p) break;
    board.seal[p.r]![p.c] = layer;
    // Never seal the final available move: rollback that individual seal.
    if (!hasMove(board)) board.seal[p.r]![p.c] = 0;
  }
  board = ensureRaidMove(board, rng);
  return { ...state, phase, board, shield: Math.max(state.shield, boss.shield) };
}
export function raidSwap(
  s: RaidState,
  a: Pos,
  b: Pos,
  boss: BossDef,
  rng: Rng = Math.random,
): RaidTransition {
  if (
    s.status !== "play" ||
    s.moves <= 0 ||
    b.r < 0 ||
    b.c < 0 ||
    b.r >= s.board.rows ||
    b.c >= s.board.cols
  )
    return { state: s, events: [] };
  const res = trySwap(s.board, a, b, rng);
  if (!res.ok) return { state: s, events: [] };
  const energy = Math.min(
    RAID_RULES.energyPerMoveCap,
    res.waves.reduce((n, w, i) => n + waveEnergy(w, i), 0),
  );
  const events: RaidEvent[] = [];
  let next: RaidState = {
    ...s,
    board: res.board,
    moves: s.moves - 1,
    turns: s.turns + 1,
    fighters: s.fighters.map((f) => ({ ...f, energy: Math.min(f.cost, f.energy + energy) })),
  };
  next = applyWaves(next, res.waves, events);
  next.phase = next.hp < boss.hp * boss.phaseAt ? 2 : next.phase;
  if (next.status !== "won" && next.moves <= 0) next.status = "lost";
  if (next.status === "play" && next.turns % boss.attackEvery === 0) {
    next = bossAttack(next, boss, rng);
    events.push({ kind: "attack", damage: 0 });
  }
  if (res.reshuffled) events.push({ kind: "shuffle", damage: 0 });
  return { state: next, events };
}
export function raidSkill(
  s: RaidState,
  id: string,
  boss: BossDef,
  now: number,
  rng: Rng = Math.random,
): RaidTransition {
  const f = s.fighters.find((f) => f.id === id);
  if (!f || f.energy < f.cost || s.status !== "play" || s.moves <= 0)
    return { state: s, events: [] };
  const fx = skillFx(id, f.copies)!;
  const act = activateSkill(s.board, fx, rng);
  // 討伐 keeps 步: a skill's 氣血 heal is paid out as +步 here (70 血 = 1 步), under the run cap.
  const bonus = Math.max(0, Math.min(raidMoves(fx), RAID_RULES.bonusMovesCap - s.bonusMoves));
  let next: RaidState = {
    ...s,
    board: ensureRaidMove(act.board, rng),
    moves: s.moves + bonus,
    bonusMoves: s.bonusMoves + bonus,
    // Strongest persistent buff wins; never multiply repeated casts or three characters together.
    buff: Math.max(s.buff, fx.mult),
    rewardBuff: Math.max(s.rewardBuff, fx.reward),
    fighters: s.fighters.map((x) => (x.id === id ? { ...x, energy: 0, uses: x.uses + 1 } : x)),
  };
  const events: RaidEvent[] = [{ kind: "skill", damage: 0, ids: [id] }];
  // Skill-generated clears and combo effects NEVER produce charge for anyone.
  if (act.strike) next = applyWaves(next, act.strike.waves, events);
  const before = next.hp;
  next = hurt(next, RAID_RULES.skillDamage + act.crackHits.length * RAID_RULES.sealDamage);
  events[0]!.damage = before - next.hp;
  const valid =
    now - s.chain.at <= RAID_RULES.comboWindowMs &&
    s.turns - s.chain.turn <= RAID_RULES.comboWindowMoves &&
    !s.chain.ids.includes(id) &&
    s.chain.ids.length < 3;
  const ids = valid ? [...s.chain.ids, id] : [id];
  next.chain = {
    ids,
    at: ids.length === 1 ? now : s.chain.at,
    turn: ids.length === 1 ? s.turns : s.chain.turn,
  };
  if (ids.length >= 2 && next.status !== "won") {
    const trio = ids.length === 3;
    const hp = next.hp;
    next = hurt(
      next,
      trio ? RAID_RULES.trioDamage : RAID_RULES.duoDamage,
      trio ? RAID_RULES.trioShred : RAID_RULES.duoShred,
    );
    events.push({ kind: trio ? "trio" : "duo", damage: hp - next.hp, ids });
  }
  next.phase = next.hp < boss.hp * boss.phaseAt ? 2 : next.phase;
  return { state: next, events };
}

/* ───────────────────────── 鎮厄司 encounters (shared HP combat) ───────────────────────── */

export type RaidTier = "normal" | "elite" | "sovereign";
export const RAID_TIER_NAME: Record<RaidTier, string> = { normal: "普通討伐", elite: "精英討伐", sovereign: "首領封印" };
export type MatDrop = Partial<Record<MaterialId, number>>;

export type RaidEncounter = {
  id: string;
  tier: RaidTier;
  /** Stage gate (artifacts.UNLOCK_AT): raid 10 / elite 20 / sovereign 40. */
  unlock: UnlockKey;
  /** Hidden balance number: player 氣血 = playerMaxHp(def.moves), same as every 三消 mode. */
  def: LevelDef;
  enemy: EnemyDef;
  /** Every win (repeatable). Materials only — never 墨玉. */
  drops: MatDrop;
  /** Extra, once, on the first win. */
  firstDrops: MatDrop;
  recommended: string;
};

const raidDef = (id: number, moves: number, tip: string): LevelDef => ({ id, moves, goals: [], stars: [1, 1], tip });

/** 數值 = 第一版測試值; all drops in one table. */
export const RAID_ENCOUNTERS: RaidEncounter[] = [
  {
    id: "ink-shadow",
    tier: "normal",
    unlock: "raid",
    def: raidDef(9101, 28, "消除即可削盾；墨封在旁邊連線即可化開。"),
    enemy: {
      id: "raid-ink-shadow",
      name: "噬墨之影",
      title: "鎮厄司 · 普通討伐",
      hp: 4200,
      shield: 95,
      attackEvery: 3,
      skills: ["ink", "shield"],
      ink: 2,
      ice: 1,
      dim: 0,
      phaseAt: 0.5,
      boss: false,
      art: "shade",
      traits: ["每 3 回出手：墨封與護盾，傷你的氣血", "生命低於一半：出手更快並追加冰封", "消除可削減護盾；鄰近消除可破封"],
    },
    drops: { jingmosha: 12 },
    firstDrops: { jingmosha: 20 },
    recommended: "破封、特殊玉、回春；任意稀有度皆能連攜",
  },
  {
    id: "elite-ink-colossus",
    tier: "elite",
    unlock: "elite",
    def: raidDef(9102, 30, "精英護盾更厚、墨紋會延伸；先削盾再集火。"),
    enemy: {
      id: "raid-elite-colossus",
      name: "濁墨巨傀",
      title: "鎮厄司 · 精英討伐",
      hp: 5400,
      shield: 150,
      attackEvery: 3,
      skills: ["ink", "drain", "shield"],
      ink: 2,
      ice: 1,
      spread: 1,
      dim: 0,
      phaseAt: 0.5,
      boss: true,
      art: "beast",
      traits: [
        "每 3 回出手：墨封與厚盾，傷你的氣血",
        "墨紋延伸：沒化開的墨紋每回向相鄰延伸 1 顆",
        "生命低於一半：出手更快並追加冰封",
      ],
    },
    drops: { zhenejing: 3, jingmosha: 8 },
    firstDrops: { zhenejing: 6 },
    recommended: "削盾（連攜）、破封與回春並重",
  },
  {
    id: "sovereign-ink-abyss",
    tier: "sovereign",
    unlock: "sovereign",
    def: raidDef(9103, 32, "首領封印：護盾最厚、墨紋延伸最快，倒數更短。善用天命連攜。"),
    enemy: {
      id: "raid-sovereign-abyss",
      name: "墨淵厄主",
      title: "鎮厄司 · 首領封印",
      hp: 6600,
      shield: 210,
      attackEvery: 3,
      skills: ["ink", "drain", "shield"],
      ink: 2,
      ice: 1,
      spread: 2,
      dim: 0,
      phaseAt: 0.5,
      boss: true,
      art: "lord",
      traits: [
        "每 3 回出手：墨封與重盾，傷你的氣血",
        "墨紋延伸：沒化開的墨紋每回向相鄰延伸 2 顆",
        "生命低於一半：每 2 回出手並追加冰封",
      ],
    },
    drops: { tianmingcanyin: 1, zhenejing: 2, jingmosha: 10 },
    firstDrops: { tianmingcanyin: 2 },
    recommended: "三人天命共鳴削盾；帶回春與破封技能",
  },
];
export const RAID_ENCOUNTER_BY_ID: Record<string, RaidEncounter> = Object.fromEntries(RAID_ENCOUNTERS.map((e) => [e.id, e]));

/** The one legacy 墨玉 first-win reward (噬墨之影, from RAID V1; sticky `rewardClaimed`). Repeats never pay 墨玉. */
export const LEGACY_FIRST_INK: Record<string, number> = { "ink-shadow": 300 };

export type RaidClear = {
  raid: RaidSave;
  /** Materials gained this win (repeat drop + first-clear bonus). Never contains 墨玉. */
  drops: MatDrop;
  first: boolean;
  /** Legacy one-time 墨玉 (only 噬墨之影, only once ever). */
  ink: number;
};

export const addDrops = (a: MatDrop, b: MatDrop): MatDrop => {
  const out: MatDrop = { ...a };
  for (const [k, n] of Object.entries(b) as [MaterialId, number][]) out[k] = (out[k] ?? 0) + n;
  return out;
};

/** Record a win: repeat drop every time; first-clear bonus once (sticky). */
export function recordRaidClear(save: RaidSave, enc: RaidEncounter): RaidClear {
  const old = save.records[enc.id];
  const first = !old?.firstDrop;
  const drops = first ? addDrops(enc.drops, enc.firstDrops) : { ...enc.drops };
  const ink = old?.rewardClaimed ? 0 : (LEGACY_FIRST_INK[enc.id] ?? 0);
  return {
    first,
    drops,
    ink,
    raid: {
      ...save,
      records: {
        ...save.records,
        [enc.id]: {
          cleared: true,
          rewardClaimed: (old?.rewardClaimed ?? false) || ink > 0,
          bestMoves: old?.bestMoves ?? 0,
          clears: Math.min(99_999, (old?.clears ?? (old?.cleared ? 1 : 0)) + 1),
          firstDrop: true,
          ...(old?.tries ? { tries: old.tries } : {}),
        },
      },
    },
  };
}

/** Add drops to the artifact materials map (capped like every other material grant). */
export function applyDrops(materials: Record<MaterialId, number>, drops: MatDrop): Record<MaterialId, number> {
  const out = { ...materials };
  for (const [k, n] of Object.entries(drops) as [MaterialId, number][]) out[k] = Math.min(999_999, (out[k] ?? 0) + Math.max(0, n));
  return out;
}

/**
 * 鎮厄司 lobby (t470): count one started fight for 「再次討伐」. Display-only — never pays, never touches
 * cleared / clears / firstDrop / rewardClaimed (so a try-only record still gets its first-win bonus).
 */
export function markRaidTry(save: RaidSave, encId: string): RaidSave {
  if (!RAID_ENCOUNTER_BY_ID[encId]) return save;
  const old = save.records[encId];
  return {
    ...save,
    records: {
      ...save.records,
      [encId]: {
        cleared: old?.cleared ?? false,
        rewardClaimed: old?.rewardClaimed ?? false,
        bestMoves: old?.bestMoves ?? 0,
        clears: old?.clears ?? (old?.cleared ? 1 : 0),
        firstDrop: old?.firstDrop ?? false,
        tries: Math.min(99_999, (old?.tries ?? 0) + 1),
      },
    },
  };
}
