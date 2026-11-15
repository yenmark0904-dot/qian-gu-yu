import type { Rarity } from "./data.ts";
import { RANK } from "./logic.ts";
import { crackSeals, hasMove, reshuffle, seedSpecials, skillStrike, type Board, type Pos, type Rng, type SwapResult, type Wave } from "./match3.ts";
import { skillOf, skillStep, type AssistFx } from "./skills.ts";

/**
 * 助陣 (assist) rules for a level — pure, so the UI and tests share them.
 * The skill is MANUAL and runs on ENERGY: clearing jades fills a ring around the
 * assist's portrait button (bigger matches, specials and chains fill faster);
 * when the ring is full the button glows and a tap 發動s the skill, emptying the
 * ring to charge again. Everything the skill does happens on that tap.
 */

type Roster = { id: string; rarity: Rarity }[];

/**
 * The player's strongest owned character with a skill: rarity first, then the
 * higher 緣分 skill step, then more copies, then roster order (stable).
 */
export function strongestOwned(roster: Roster, owned: Record<string, number>): string | null {
  let best: { id: string; key: number[] } | null = null;
  roster.forEach((c, i) => {
    const n = owned[c.id] ?? 0;
    if (n <= 0 || !skillOf(c.id)) return;
    const key = [RANK[c.rarity], skillStep(n), n, -i];
    if (!best || lexGreater(key, best.key)) best = { id: c.id, key };
  });
  return best ? (best as { id: string }).id : null;
}

function lexGreater(a: number[], b: number[]): boolean {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k]! > b[k]!;
  return false;
}

/**
 * Who actually helps in a level: the picked assist if still owned, otherwise
 * the strongest owned character (so a fresh player always has a skill).
 * `chosen === NO_ASSIST` is an explicit "不帶助陣" and is honoured.
 */
export const NO_ASSIST = "none";
export function resolveAssist(chosen: string | null, owned: Record<string, number>, roster: Roster): string | null {
  if (chosen === NO_ASSIST) return null;
  if (chosen && (owned[chosen] ?? 0) > 0 && skillOf(chosen)) return chosen;
  return strongestOwned(roster, owned);
}

/* ---------- energy ---------- */

/** Energy per cleared jade, per special set off, per special forged, per cascade step. */
export const ENERGY = { jade: 1, effect: 3, forged: 2, chain: 2 } as const;

/** Energy a wave (one clear + its cascade index, 0 = the swap itself) yields. */
export function waveEnergy(w: Pick<Wave, "removed" | "effects" | "created">, chain: number): number {
  return w.removed.length * ENERGY.jade + w.effects.length * ENERGY.effect + w.created.length * ENERGY.forged + chain * ENERGY.chain;
}

/**
 * Energy needed for one 發動. Rarer skills hit harder but take longer to charge;
 * 緣分 shortens the charge (貳 −8%, 參 −16%).
 */
export const CHARGE_BASE: Record<Rarity, number> = { R: 55, S: 65, SS: 75, SSR: 75 };
export const CHARGE_STEP = [1, 0.92, 0.84] as const;
export function chargeCost(rarity: Rarity, copies: number): number {
  return Math.round(CHARGE_BASE[rarity] * CHARGE_STEP[skillStep(copies)]);
}

/** Scheme C: only a fresh fight grants starting energy; spending still empties the ring. */
export const startEnergy = (rarity?: Rarity): number => (rarity === "SSR" ? 20 : rarity === "SS" ? 10 : 0);
export type Charge = { energy: number; cost: number; uses: number };
export const freshCharge = (cost: number, rarity?: Rarity): Charge => ({ energy: Math.min(cost, startEnergy(rarity)), cost, uses: 0 });
export function addEnergy(c: Charge, amount: number): Charge {
  if (amount <= 0 || c.energy >= c.cost) return c;
  return { ...c, energy: Math.min(c.cost, c.energy + amount) };
}
export const isFull = (c: Charge) => c.cost > 0 && c.energy >= c.cost;
/** 0..1 for the ring. */
export const chargeRatio = (c: Charge) => (c.cost > 0 ? Math.min(1, c.energy / c.cost) : 0);
/** `alive` = the player's 氣血 (or, in 討伐, steps) left — no casting once it is gone. */
export function canActivate(c: Charge, phase: string, fx: AssistFx | null, alive: number): boolean {
  return !!fx && isFull(c) && phase === "play" && alive > 0;
}
/** After 發動: the ring empties and starts charging again. */
export const spend = (c: Charge): Charge => ({ ...c, energy: 0, uses: c.uses + 1 });

export type Activation = {
  /** The board after everything (strike cascades, then gifts, then seal cracks). */
  board: Board;
  /** Strike (sweep / burn) resolution, played as waves on the board; null if none. */
  strike: Extract<SwapResult, { ok: true }> | null;
  /** Board after the strike but before the gifts land (for the drop-in animation). */
  beforeGifts: Board;
  /** Board right after the gifts land (before seals crack). */
  afterGifts: Board;
  /** Cells that became special jades. */
  gifts: Pos[];
  /** Seal layers cracked by the skill itself (not counting strike cascades). */
  cracked: number;
  crackHits: Pos[];
  /** 氣血 to restore (the caller caps it at max HP). */
  heal: number;
};

/** Apply a skill now. Order: strike → special jades drop in → seals crack → heal. */
export function activateSkill(board: Board, fx: AssistFx, rng: Rng = Math.random): Activation {
  let b = board;
  let strike: Activation["strike"] = null;
  if (fx.sweep || fx.burn) {
    strike = skillStrike(b, fx.sweep ? { kind: "sweep" } : { kind: "burn", rows: fx.burn }, rng);
    if (strike) b = strike.board;
  }
  const beforeGifts = b;
  const seeded = seedSpecials(b, fx, rng);
  const gifts: Pos[] = [];
  for (let r = 0; r < seeded.rows; r++)
    for (let c = 0; c < seeded.cols; c++) {
      const was = b.cells[r]![c]!;
      const now = seeded.cells[r]![c]!;
      if (now.special && (!was.special || was.special !== now.special)) gifts.push({ r, c });
    }
  b = seeded;
  const afterGifts = b;
  let cracked = 0;
  let crackHits: Pos[] = [];
  if (fx.seals) {
    const c = crackSeals(b, fx.seals, rng);
    b = c.board;
    cracked = c.broken;
    crackHits = c.hits;
  }
  if (!hasMove(b)) b = reshuffle(b, rng);
  return { board: b, strike, beforeGifts, afterGifts, gifts, cracked, crackHits, heal: fx.heal };
}

/** Short labels for what a tap did, shown as floating text. */
export function activationLabels(fx: AssistFx): string[] {
  const out: string[] = [];
  if (fx.heal) out.push(`+${fx.heal} 血`);
  if (fx.mult > 1) out.push(`得分 ×${fx.mult.toFixed(2)}`);
  if (fx.reward) out.push(`星賞 +${Math.round(fx.reward * 100)}%`);
  return out;
}
