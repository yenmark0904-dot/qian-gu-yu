import { BY_ID } from "./data.ts";
import type { QinChoiceId } from "./qin-vn.ts";
export type BondStoryPlay = { beat: number; done: boolean; choice?: QinChoiceId };
/** Additive v5 cursor map; old saves keep every unrelated field. Reject corrupt keys/cursors. */
export function cleanBondStoryPlay(raw: unknown): Record<string, BondStoryPlay> {
  const out: Record<string, BondStoryPlay> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const [id, index] = key.split(":");
    const c = BY_ID[id];
    if (!Object.hasOwn(BY_ID, id) || !c || !/^[0-3]$/.test(index) || key !== `${id}:${index}`) continue;
    const max = c.rarity === "SSR" ? 3 : c.rarity === "SS" ? 2 : 1;
    if (Number(index) > max || (c.rarity === "R" && index === "0")) continue;
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    if (!Number.isInteger(row.beat) || (row.beat as number) < 0 || (row.beat as number) > 20000) continue;
    out[key] = { beat: row.beat as number, done: row.done === true, ...(["A", "B", "C"].includes(String(row.choice)) ? { choice: row.choice as QinChoiceId } : {}) };
  }
  return out;
}
