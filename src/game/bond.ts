import type { Character, Rarity } from "./data.ts";

/** 墨玉 per bond tier-up (mirrors logic.ts TIER_UP_INK; kept here to avoid a bond⇄logic import cycle). */
export const TIER_UP_INK_REWARD = 500;

/**
 * 緣分 (bond). Every copy after the first is a duplicate; every 5 duplicates
 * raise the bond one tier, for all rarities, up to tier 6 (定情).
 *   copies 1 → tier 0 · copies 6 → tier 1 · … · copies 31 → tier 6
 */
export const DUPES_PER_TIER = 5;
export const MAX_BOND = 6;
export const MAX_DUPES = DUPES_PER_TIER * MAX_BOND;

export const BOND_TIER_NAMES = ["初見", "再逢", "相知", "入心", "難忘", "傾心", "定情"] as const;
export const TIER_NUMERALS = ["零", "一", "二", "三", "四", "五", "六"] as const;

export function bondLevel(copies: number): number {
  if (copies <= 1) return 0;
  return Math.min(MAX_BOND, Math.floor((copies - 1) / DUPES_PER_TIER));
}

export function bondTitle(copies: number): string {
  if (copies <= 0) return "未逢";
  return BOND_TIER_NAMES[bondLevel(copies)]!;
}

/** "緣分二階解鎖" */
export function tierRequirement(tier: number): string {
  return `緣分${TIER_NUMERALS[tier]}階解鎖`;
}

/** Progress towards the next tier: how many duplicates are banked and needed. */
export function bondProgress(copies: number): { level: number; have: number; need: number; max: boolean } {
  const level = bondLevel(copies);
  if (level >= MAX_BOND) return { level, have: DUPES_PER_TIER, need: DUPES_PER_TIER, max: true };
  const dupes = Math.max(0, copies - 1);
  return { level, have: dupes - level * DUPES_PER_TIER, need: DUPES_PER_TIER, max: false };
}

/* ---------------- story chapters ---------------- */

/**
 * Story chapters by rarity. Chapter 0 is the existing first-meeting story
 * (`eroticStory` in data.ts, unlocked when you own the character). R has none.
 * Extra chapters 1…n unlock only through bond tiers and read their text from
 * `stories-extra.ts`.
 */
export const CHAPTER_TIERS: Record<Rarity, number[]> = {
  R: [3],
  S: [3],
  SS: [2, 4],
  SSR: [2, 4, 6],
};

/** 情話 · 其二 (`love` in stories-extra.ts): R open it one tier earlier, at 二階. */
export const LOVE_TIER: Record<Rarity, number> = { R: 2, S: 3, SS: 3, SSR: 3 };

/** SSR also unlock an exclusive CG at this tier. */
export const CG_TIER = 6;

export function storyLabel(rarity: Rarity): string {
  return rarity === "SSR" ? "天命書" : "專屬物語";
}

export const CHAPTER_NUMERALS = ["初章", "其二", "其三", "其四", "其五"] as const;

export type ChapterState = "locked" | "empty" | "open";
export type ChapterView = {
  index: number;
  /** Bond tier needed (0 = owning the card). */
  tier: number;
  label: string;
  title: string;
  state: ChapterState;
  text: string;
  requirement: string;
};

export type ExtraSource = (id: string, index: number) => { title?: string; text: string } | undefined;

export function chapterList(character: Character, copies: number, extra: ExtraSource, firstText: string | null): ChapterView[] {
  const label = storyLabel(character.rarity);
  const level = bondLevel(copies);
  const owned = copies > 0;
  const out: ChapterView[] = [];
  if (character.rarity !== "R") {
    const text = firstText ?? "";
    out.push({
      index: 0,
      tier: 0,
      label,
      title: character.eroticTitle?.trim() || CHAPTER_NUMERALS[0],
      state: !owned ? "locked" : text.trim() ? "open" : "empty",
      text: owned ? text : "",
      requirement: "召喚相逢後解鎖",
    });
  }
  CHAPTER_TIERS[character.rarity].forEach((tier, i) => {
    const index = i + 1;
    const entry = extra(character.id, index);
    const text = entry?.text ?? "";
    const unlocked = owned && level >= tier;
    const numeral = character.rarity === "R" ? CHAPTER_NUMERALS[0] : CHAPTER_NUMERALS[index]!;
    out.push({
      index,
      tier,
      label,
      title: entry?.title?.trim() || numeral,
      state: !unlocked ? "locked" : text.trim() ? "open" : "empty",
      text: unlocked ? text : "",
      requirement: tierRequirement(tier),
    });
  });
  return out;
}

/* ---------------- tier rewards ---------------- */

export type Skin = "base" | "gilt" | "ink" | "vow";
export const SKINS: { id: Skin; name: string; tier: number }[] = [
  { id: "base", name: "本相", tier: 0 },
  { id: "gilt", name: "金絲", tier: 2 },
  { id: "ink", name: "墨染", tier: 4 },
  { id: "vow", name: "定情", tier: 6 },
];

export function skinUnlocked(skin: Skin, copies: number) {
  const def = SKINS.find((s) => s.id === skin);
  return !!def && copies > 0 && bondLevel(copies) >= def.tier;
}

/** The skin a card shows: the chosen one if unlocked, else the best unlocked. */
export function shownSkin(copies: number, chosen?: Skin): Skin {
  if (chosen && skinUnlocked(chosen, copies)) return chosen;
  let best: Skin = "base";
  for (const s of SKINS) if (skinUnlocked(s.id, copies)) best = s.id;
  return best;
}

export type TierReward = { tier: number; items: string[] };

/** What each tier unlocks for a rarity (for the codex table). */
export function tierRewards(rarity: Rarity): TierReward[] {
  const label = storyLabel(rarity);
  const out: TierReward[] = [];
  for (let tier = 1; tier <= MAX_BOND; tier++) {
    const items: string[] = [`墨玉 ×${TIER_UP_INK_REWARD}`];
    if (tier === 2) items.push("卡面「金絲」");
    if (tier === LOVE_TIER[rarity]) items.push("情話 · 其二");
    if (tier === 4) items.push("卡面「墨染」");
    if (tier === 6) items.push("定情卡面");
    const ci = CHAPTER_TIERS[rarity].indexOf(tier);
    if (ci >= 0) items.push(`《${label}》${rarity === "R" ? CHAPTER_NUMERALS[0] : CHAPTER_NUMERALS[ci + 1]}`);
    if (rarity === "SSR" && tier === CG_TIER) items.push("專屬 CG");
    out.push({ tier, items });
  }
  return out;
}

/* ---------------- 墨痕 ---------------- */

/** Small 墨痕 trickle for every duplicate while the bond is still growing. */
export const MARK_TRICKLE: Record<Rarity, number> = { R: 1, S: 2, SS: 5, SSR: 10 };
/** Full conversion for every duplicate after tier 6. */
export const MARK_OVERFLOW: Record<Rarity, number> = { R: 10, S: 30, SS: 80, SSR: 200 };

export type DupOutcome = { level: number; prevLevel: number; levelUp: boolean; marks: number; overflow: boolean };

/** What a newly drawn copy does, given how many copies were owned before it. */
export function dupOutcome(rarity: Rarity, prevCopies: number): DupOutcome {
  const prevLevel = prevCopies > 0 ? bondLevel(prevCopies) : 0;
  const copies = prevCopies + 1;
  const level = bondLevel(copies);
  if (prevCopies <= 0) return { level, prevLevel, levelUp: false, marks: 0, overflow: false };
  const overflow = prevCopies - 1 >= MAX_DUPES;
  return { level, prevLevel, levelUp: level > prevLevel, marks: overflow ? MARK_OVERFLOW[rarity] : MARK_TRICKLE[rarity], overflow };
}
