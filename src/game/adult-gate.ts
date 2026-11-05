/**
 * 18+ gate for explicit chapters. Asked once per device; the answer lives in localStorage
 * (separate from the save so a save reset/migration never skips or repeats the question).
 *
 * Explicit content (reviewed 2026-11-02): every SSR text — the opening 天命書 (eroticStory,
 * chapter 0) and 緣分 chapters 1–3. SS/S/R stories and chapters are romantic only (at most a
 * kiss) and are not gated.
 */
import type { Rarity } from "./data.ts";

export const ADULT_KEY = "qiangu-yu-adult18";
export const ADULT_PROMPT = "以下內容含成人情節，僅限 18 歲以上閱讀。你已年滿 18 歲嗎？";
export const ADULT_YES = "我已年滿 18 歲";
export const ADULT_NO = "返回";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (s?: Store | null): Store | null => {
  if (s !== undefined) return s;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** Is chapter `index` (0 = opening story) of a character of this rarity explicit? */
export function isExplicit(rarity: Rarity, _index = 0): boolean {
  return rarity === "SSR";
}

export function adultConfirmed(s?: Store | null): boolean {
  try {
    return store(s)?.getItem(ADULT_KEY) === "1";
  } catch {
    return false;
  }
}

export function confirmAdult(s?: Store | null): void {
  try {
    store(s)?.setItem(ADULT_KEY, "1");
  } catch {
    /* private mode: the gate simply asks again next time */
  }
}

export function resetAdult(s?: Store | null): void {
  try {
    store(s)?.removeItem(ADULT_KEY);
  } catch {
    /* ignore */
  }
}

/** Must the gate be shown before revealing this text? */
export function needsAdultGate(rarity: Rarity, index = 0, s?: Store | null): boolean {
  return isExplicit(rarity, index) && !adultConfirmed(s);
}
