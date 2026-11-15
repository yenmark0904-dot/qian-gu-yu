import type { Character, Rarity } from "./data.ts";
import {
  BOND_TIER_NAMES,
  CG_TIER,
  CHAPTER_NUMERALS,
  CHAPTER_TIERS,
  DUPES_PER_TIER,
  LOVE_TIER,
  MARK_OVERFLOW,
  MAX_BOND,
  MAX_DUPES,
  SKINS,
  TIER_NUMERALS,
  TIER_UP_INK_REWARD,
  bondLevel,
  hasExclusiveCg,
  storyLabel,
  type Skin,
} from "./bond.ts";
import { STEP_NAMES, STEP_TIERS } from "./skills.ts";
import { rankUpLine } from "./rankup-lines.ts";

/**
 * 緣分 feedback between ranks (pure, shared by the 召喚結果 screen, 墨寶閣 and the 圖鑑 table).
 * Nothing here gates a reward: it only describes the existing bond.ts rules more clearly.
 */

export type UnlockKind = "skin" | "love" | "story" | "cg" | "skill" | "ink";
export type Unlock = { kind: UnlockKind; label: string; skin?: Skin };

/** Copies needed to reach a bond tier (tier 0 = the first copy). */
export const copiesForTier = (tier: number) => (tier <= 0 ? 1 : tier * DUPES_PER_TIER + 1);

/** Every unlock a tier brings, typed so the UI can split 外觀／故事 from 技能. */
export function tierUnlocks(rarity: Rarity, tier: number): Unlock[] {
  const out: Unlock[] = [];
  if (tier < 1 || tier > MAX_BOND) return out;
  const skin = SKINS.find((s) => s.tier === tier && s.id !== "base");
  if (skin) out.push({ kind: "skin", label: skin.id === "vow" ? "定情卡面" : `卡面「${skin.name}」`, skin: skin.id });
  if (tier === LOVE_TIER[rarity]) out.push({ kind: "love", label: "情話 · 其二" });
  const ci = CHAPTER_TIERS[rarity].indexOf(tier);
  if (ci >= 0) out.push({ kind: "story", label: `《${storyLabel(rarity)}》${rarity === "R" ? CHAPTER_NUMERALS[0] : CHAPTER_NUMERALS[ci + 1]}` });
  if (hasExclusiveCg(rarity) && tier === CG_TIER) out.push({ kind: "cg", label: "專屬 CG" });
  const step = STEP_TIERS.indexOf(tier as (typeof STEP_TIERS)[number]);
  if (step > 0) out.push({ kind: "skill", label: `助陣技能升至「${STEP_NAMES[step]}」段` });
  out.push({ kind: "ink", label: `墨玉 ×${TIER_UP_INK_REWARD}` });
  return out;
}

const isLook = (u: Unlock) => u.kind === "skin" || u.kind === "love" || u.kind === "story" || u.kind === "cg";

/** First tier above `level` with a new card art / story / 情話 / CG (null if none left). */
export function nextLookTier(rarity: Rarity, level: number): number | null {
  for (let t = level + 1; t <= MAX_BOND; t++) if (tierUnlocks(rarity, t).some(isLook)) return t;
  return null;
}

/** First tier above `level` where the 助陣 skill steps up (三階 → 貳, 六階 → 參). */
export function nextSkillTier(level: number): number | null {
  for (const t of STEP_TIERS) if (t > level) return t;
  return null;
}

export type RewardRow = {
  tier: number;
  name: string;
  copies: number;
  look: string[];
  skill: string[];
  ink: string;
  /** This row is the next 外觀／故事 unlock, or the next 技能強化, for the given copies. */
  nextLook: boolean;
  nextSkill: boolean;
  reached: boolean;
};

/** The 圖鑑 緣分階梯, with the next 外觀／故事 and next 技能強化 rows marked. */
export function rewardRows(rarity: Rarity, copies: number): RewardRow[] {
  const owned = copies > 0;
  const level = owned ? bondLevel(copies) : -1;
  const lookAt = owned ? nextLookTier(rarity, level) : nextLookTier(rarity, 0);
  const skillAt = owned ? nextSkillTier(level) : nextSkillTier(0);
  const rows: RewardRow[] = [];
  for (let tier = 1; tier <= MAX_BOND; tier++) {
    const u = tierUnlocks(rarity, tier);
    rows.push({
      tier,
      name: BOND_TIER_NAMES[tier]!,
      copies: copiesForTier(tier),
      look: u.filter(isLook).map((x) => x.label),
      skill: u.filter((x) => x.kind === "skill").map((x) => x.label),
      ink: u.find((x) => x.kind === "ink")!.label,
      nextLook: tier === lookAt,
      nextSkill: tier === skillAt,
      reached: owned && level >= tier,
    });
  }
  return rows;
}

/** 「再得 N 張，即可進入相知」 — null at max. */
export function progressCopy(copies: number): string | null {
  if (copies <= 0) return `初次相逢後，緣分自「${BOND_TIER_NAMES[0]}」起`;
  const level = bondLevel(copies);
  if (level >= MAX_BOND) return null;
  const need = copiesForTier(level + 1) - copies;
  return `再得 ${need} 張，即可進入${BOND_TIER_NAMES[level + 1]}`;
}

export function copiesToNext(copies: number): number {
  const level = bondLevel(copies);
  if (copies <= 0) return 1;
  if (level >= MAX_BOND) return 0;
  return copiesForTier(level + 1) - copies;
}

/** Result-screen line when this copy is past 定情: the bond is complete, the copy became 墨痕. */
export function maxedCopy(rarity: Rarity): string {
  return `緣分已圓滿（六階 · 定情），本張化為墨痕 ×${MARK_OVERFLOW[rarity]}`;
}

export type DupeFeedback =
  | { kind: "new" }
  | { kind: "progress"; text: string; need: number }
  | { kind: "near"; text: string; need: 1; nextTier: number; nextName: string; previewSkin: Skin | null; teaser: string[] }
  | { kind: "rankup"; tier: number; tierName: string; line: string; unlocks: Unlock[]; after: string | null }
  | { kind: "max"; text: string; marks: number };

/**
 * What the result screen says about one drawn / bought copy.
 * `count` = copies owned after it; `bondUp` = this copy raised the tier; `overflow` = it was past 定情.
 */
export function dupeFeedback(character: Pick<Character, "id" | "name" | "rarity">, count: number, bondUp: boolean, overflow: boolean): DupeFeedback {
  if (count <= 1) return { kind: "new" };
  if (overflow || count - 1 > MAX_DUPES) return { kind: "max", text: maxedCopy(character.rarity), marks: MARK_OVERFLOW[character.rarity] };
  const level = bondLevel(count);
  if (bondUp) {
    const after =
      level >= MAX_BOND
        ? `緣分已至頂。之後再遇，每張整張化為墨痕 ×${MARK_OVERFLOW[character.rarity]}`
        : progressCopy(count);
    return {
      kind: "rankup",
      tier: level,
      tierName: BOND_TIER_NAMES[level]!,
      line: rankUpLine(character, level),
      unlocks: tierUnlocks(character.rarity, level),
      after,
    };
  }
  const need = copiesToNext(count);
  const text = progressCopy(count)!;
  if (need === 1) {
    const nextTier = level + 1;
    const u = tierUnlocks(character.rarity, nextTier);
    const skin = u.find((x) => x.kind === "skin")?.skin ?? null;
    return {
      kind: "near",
      text,
      need: 1,
      nextTier,
      nextName: BOND_TIER_NAMES[nextTier]!,
      previewSkin: skin,
      teaser: u.filter((x) => x.kind !== "skin").map((x) => x.label),
    };
  }
  return { kind: "progress", text, need };
}

/** 「二階 · 相知」 */
export const tierLabel = (tier: number) => `${TIER_NUMERALS[tier]}階 · ${BOND_TIER_NAMES[tier]}`;
