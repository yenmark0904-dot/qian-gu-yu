import type { Rarity } from "./data.ts";
import { BY_ID } from "./data.ts";
import { NO_ASSIST, resolveAssist, strongestOwned } from "./assist.ts";

/**
 * 固定助陣 (pinned assist). The saved `assist` value means:
 *   null       → 自動推薦: the strongest owned (rarity → 緣分 skill step → copies), the default
 *   "none"     → 不帶助陣
 *   a char id  → 固定助陣: that character helps in EVERY level until the pin is cleared.
 * The pin is stored as soon as it is picked (win or lose does not matter) and survives reloads.
 * If the pinned character is somehow not owned, the level falls back to auto but the pin is kept.
 */
export type AssistMode = "auto" | "pinned" | "none";
export type AssistState = {
  mode: AssistMode;
  /** Who actually helps this level (null = nobody). */
  id: string | null;
  /** The pinned id (even if it currently falls back). */
  pinned: string | null;
  /** The pin is set but cannot be used now, so auto fills in. */
  fallback: boolean;
  /** Who auto would pick (for the "自動推薦" row). */
  strongest: string | null;
};

type Roster = { id: string; rarity: Rarity }[];

export function assistState(chosen: string | null, owned: Record<string, number>, roster: Roster): AssistState {
  const strongest = strongestOwned(roster, owned);
  if (chosen === NO_ASSIST) return { mode: "none", id: null, pinned: null, fallback: false, strongest };
  if (!chosen) return { mode: "auto", id: strongest, pinned: null, fallback: false, strongest };
  const id = resolveAssist(chosen, owned, roster);
  return { mode: "pinned", id, pinned: chosen, fallback: id !== chosen, strongest };
}

/** Sanitize a persisted `assist` value: keep null, "none" or a real character id. */
export function cleanAssist(value: unknown): string | null {
  if (value === NO_ASSIST) return NO_ASSIST;
  if (typeof value === "string" && BY_ID[value]) return value;
  return null;
}

/** The label on the level intro card. */
export function assistBadge(s: AssistState): string {
  if (s.mode === "none") return "不帶助陣";
  if (s.mode === "pinned") return s.fallback ? "固定助陣暫缺 · 改用最強" : "固定助陣";
  return "自動推薦 · 最強";
}
