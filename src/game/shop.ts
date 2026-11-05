import type { Rarity } from "./data.ts";
import { MAX_DUPES } from "./bond.ts";

/** 墨寶閣 prices in 墨痕. */
export const CHARACTER_PRICE: Record<Rarity, number> = { R: 40, S: 150, SS: 500, SSR: 1500 };

export type CosmeticKind = "frame" | "backdrop";
export type Cosmetic = { id: string; kind: CosmeticKind; name: string; price: number; note: string };

export const DEFAULT_FRAME = "frame-plain";
export const DEFAULT_BACKDROP = "bg-ink";

export const COSMETICS: Cosmetic[] = [
  { id: DEFAULT_FRAME, kind: "frame", name: "松煙", price: 0, note: "素墨細邊，預設" },
  { id: "frame-gilt", kind: "frame", name: "鎏金", price: 120, note: "雙線金邊與角飾" },
  { id: "frame-cinnabar", kind: "frame", name: "朱砂", price: 160, note: "朱紅漆框，四角印泥" },
  { id: "frame-celadon", kind: "frame", name: "青綠", price: 220, note: "青綠山水色的玉框" },
  { id: DEFAULT_BACKDROP, kind: "backdrop", name: "夜墨", price: 0, note: "原本的山水窗景" },
  { id: "bg-moon", kind: "backdrop", name: "月白", price: 180, note: "清冷月色籠罩窗景" },
  { id: "bg-dusk", kind: "backdrop", name: "赤霄", price: 240, note: "晚霞染紅遠山" },
  { id: "bg-snow", kind: "backdrop", name: "寒江", price: 300, note: "雪色與青灰" },
];

export const COSMETIC_BY_ID: Record<string, Cosmetic> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export type ShopState = { marks: number; owned: Record<string, number>; cosmetics: string[] };

export type BuyResult<T> = { ok: true; state: T; price: number } | { ok: false; reason: "unknown" | "broke" | "maxed" | "owned" };

/**
 * Buy one copy of a character. It counts like a draw (new card or +1 duplicate
 * toward the bond) but pays back no 墨玉 and no 墨痕, so nothing loops.
 * Not sold once the bond is at tier 6.
 */
export function buyCharacter<T extends ShopState>(state: T, id: string, rarity: Rarity | undefined): BuyResult<T> {
  if (!rarity) return { ok: false, reason: "unknown" };
  const copies = state.owned[id] ?? 0;
  if (copies - 1 >= MAX_DUPES) return { ok: false, reason: "maxed" };
  const price = CHARACTER_PRICE[rarity];
  if (state.marks < price) return { ok: false, reason: "broke" };
  return { ok: true, price, state: { ...state, marks: state.marks - price, owned: { ...state.owned, [id]: copies + 1 } } };
}

export function ownsCosmetic(cosmetics: string[], id: string) {
  return id === DEFAULT_FRAME || id === DEFAULT_BACKDROP || cosmetics.includes(id);
}

export function buyCosmetic<T extends ShopState>(state: T, id: string): BuyResult<T> {
  const item = COSMETIC_BY_ID[id];
  if (!item) return { ok: false, reason: "unknown" };
  if (ownsCosmetic(state.cosmetics, id)) return { ok: false, reason: "owned" };
  if (state.marks < item.price) return { ok: false, reason: "broke" };
  return { ok: true, price: item.price, state: { ...state, marks: state.marks - item.price, cosmetics: [...state.cosmetics, id] } };
}
