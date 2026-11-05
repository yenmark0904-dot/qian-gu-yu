import {
  CHARACTERS,
  RARITY_ORDER,
  WEIGHTS,
  type Character,
  type Rarity,
} from "./data.ts";
import { bondLevel, MAX_BOND, TIER_UP_INK_REWARD } from "./bond.ts";

export const PITY = 50;
export const COST_ONE = 160;
export const COST_TEN = 1440;
export const START_INK = 8000;
export const DAILY_INK = 800;

export const DUP_REFUND: Record<Rarity, number> = {
  R: 20,
  S: 80,
  SS: 360,
  SSR: 600,
};

export const RANK: Record<Rarity, number> = {
  R: 0,
  S: 1,
  SS: 2,
  SSR: 3,
};

export type PullCard = {
  character: Character;
  isNew: boolean;
  count: number;
  refund: number;
  /** Bond tier after this copy. */
  bond?: number;
  /** This copy raised the bond tier. */
  bondUp?: boolean;
  /** 墨痕 gained from this copy. */
  marks?: number;
  /** 墨玉 paid for the bond tier(s) this copy raised (TIER_UP_INK each, once per tier per character). */
  tierInk?: number;
};

/* ---------------- 緣分升階 墨玉 ---------------- */

/** 墨玉 granted for every bond tier-up (tiers 1–6, all rarities), once per tier per character. */
export const TIER_UP_INK = TIER_UP_INK_REWARD;

/**
 * Pay the tier-up 墨玉 when a copy moves a character's bond from prevLevel to level.
 * `paid` is the persisted high-water mark (highest tier already settled per character), so a
 * tier is never paid twice — not after a reload, a migration, or a cloud restore that lowers
 * and re-raises the copy count. Tiers at or below prevLevel are never paid either.
 */
export function payTierUp(
  paid: Record<string, number>,
  id: string,
  prevLevel: number,
  level: number,
): { ink: number; paid: Record<string, number> } {
  const floor = Math.max(paid[id] ?? 0, prevLevel, 0);
  const top = Math.min(level, MAX_BOND);
  if (top <= floor) return { ink: 0, paid };
  return { ink: (top - floor) * TIER_UP_INK, paid: { ...paid, [id]: top } };
}

/**
 * Settle tiers a save already has without paying them (no back-pay): every owned character's
 * mark is raised to its current tier. Junk keys/values are dropped. Idempotent.
 */
export function settleTierPaid(owned: Record<string, number> | undefined, paid: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (paid && typeof paid === "object" && !Array.isArray(paid)) {
    for (const [id, v] of Object.entries(paid as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[id] = Math.min(Math.floor(v), MAX_BOND);
    }
  }
  for (const [id, n] of Object.entries(owned ?? {})) {
    if (typeof n !== "number" || n <= 0) continue;
    const lv = Math.min(bondLevel(n), MAX_BOND);
    if (lv > (out[id] ?? 0)) out[id] = lv;
  }
  return out;
}

export function rateLabel(rarity: Rarity) {
  return `${WEIGHTS[rarity] / 100}%`;
}

export function rollRarity(pity: number, rng: () => number): Rarity {
  if (pity + 1 >= PITY) return "SSR";
  let ticket = rng() * 10000;
  for (const rarity of RARITY_ORDER) {
    ticket -= WEIGHTS[rarity];
    if (ticket < 0) return rarity;
  }
  return "R";
}

export function pickOf(rarity: Rarity, rng: () => number): Character {
  const pool = CHARACTERS.filter((c) => c.rarity === rarity);
  const index = Math.floor(rng() * pool.length);
  return pool[index] ?? pool[0]!;
}

export function pullMany(
  pity: number,
  n: number,
  firstGift: boolean,
  rng: () => number = Math.random,
): { cards: Character[]; pity: number } {
  const cards: Character[] = [];
  let nextPity = pity;
  for (let i = 0; i < n; i++) {
    let rarity = rollRarity(nextPity, rng);
    const isLast = i === n - 1;
    const alreadyHigh = cards.some((c) => RANK[c.rarity] >= RANK.SS);
    if (firstGift && isLast && !alreadyHigh && RANK[rarity] < RANK.SS) {
      rarity = "SS";
    }
    cards.push(pickOf(rarity, rng));
    nextPity = rarity === "SSR" ? 0 : nextPity + 1;
  }
  if (n === 10 && !cards.some((c) => RANK[c.rarity] >= RANK.S)) {
    let idx = 0;
    cards.forEach((c, i) => {
      if (RANK[c.rarity] <= RANK[cards[idx]!.rarity]) idx = i;
    });
    cards[idx] = pickOf("S", rng);
  }
  return { cards, pity: nextPity };
}

export function bestIndex(cards: { character: Character }[]) {
  let idx = 0;
  cards.forEach((c, i) => {
    if (RANK[c.character.rarity] > RANK[cards[idx]!.character.rarity]) idx = i;
  });
  return idx;
}

export { bondTitle as bondName } from "./bond.ts";

export function localDay() {
  const now = new Date();
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}
