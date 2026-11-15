/**
 * 命器淬鍊 (t447u / t448u) — the ONE place every upgrade cost lives (like rates / pity).
 *
 * Hard rules encoded here:
 *  - Max Lv.10. Each step spends ONLY 鎮厄司 materials (淨墨砂 / 鎮厄晶 / 天命殘印).
 *  - Never spends 墨玉, character cards, 緣分, or other 命器 instances; never destroys, unequips or unlocks
 *    the instance being refined (equippedBy / locked stay as they were).
 *  - Lv.9 → 10 is 覺醒: it also needs 第 50 關 cleared (artifactUnlocks.awaken).
 *  - Not enough materials → refused (nothing charged, nothing substituted).
 *
 * 數值 = 第一版測試值（使用者未指定確切數字，採保守曲線；集中於此可一次調整）。
 */
import { ARTIFACT_BY_ID, ARTIFACT_MAX_LEVEL, MATERIALS, type ArtifactInstance, type ArtifactSave, type MaterialId } from "./artifacts.ts";

export type RefineCost = Partial<Record<MaterialId, number>>;

/** Cost to go from Lv.N (key) to Lv.N+1. */
export const REFINE_COSTS: Readonly<Record<number, RefineCost>> = {
  1: { jingmosha: 8 },
  2: { jingmosha: 12 },
  3: { jingmosha: 18 },
  4: { jingmosha: 24, zhenejing: 2 }, // Lv.5 進階
  5: { jingmosha: 20, zhenejing: 4 },
  6: { jingmosha: 24, zhenejing: 6 },
  7: { jingmosha: 30, zhenejing: 8 },
  8: { jingmosha: 36, zhenejing: 10 },
  9: { jingmosha: 40, zhenejing: 12, tianmingcanyin: 3 }, // Lv.10 覺醒（另需第 50 關通關）
};
/** The step whose result is 覺醒 (Lv.9 → 10). */
export const AWAKEN_FROM = ARTIFACT_MAX_LEVEL - 1;
export const REFINE_STEP_NAME = (from: number) => (from + 1 >= ARTIFACT_MAX_LEVEL ? "覺醒" : from + 1 === 5 ? "進階" : "淬鍊");

export const refineCost = (level: number): RefineCost | null =>
  level >= 1 && level < ARTIFACT_MAX_LEVEL ? (REFINE_COSTS[Math.floor(level)] ?? null) : null;

const MAT_NAME = Object.fromEntries(MATERIALS.map((m) => [m.id, m.name])) as Record<MaterialId, string>;
export const costText = (c: RefineCost) =>
  (Object.entries(c) as [MaterialId, number][]).map(([id, n]) => `${MAT_NAME[id]} ×${n}`).join("、");

export type RefineBlock = "unknown-instance" | "max-level" | "awaken-locked" | "materials";
export type RefineCheck =
  | { ok: true; inst: ArtifactInstance; cost: RefineCost; to: number }
  | { ok: false; reason: RefineBlock; inst?: ArtifactInstance; cost?: RefineCost; missing?: RefineCost };

/** What it would take to refine `uid` once (no side effects). */
export function refineCheck(save: ArtifactSave, uid: string, unlocks: { awaken: boolean }): RefineCheck {
  const inst = save.instances.find((i) => i.uid === uid);
  if (!inst || !ARTIFACT_BY_ID[inst.eid]) return { ok: false, reason: "unknown-instance" };
  const cost = refineCost(inst.level);
  if (!cost) return { ok: false, reason: "max-level", inst };
  if (inst.level >= AWAKEN_FROM && !unlocks.awaken) return { ok: false, reason: "awaken-locked", inst, cost };
  const missing: RefineCost = {};
  for (const [id, n] of Object.entries(cost) as [MaterialId, number][]) {
    const have = save.materials[id] ?? 0;
    if (have < n) missing[id] = n - have;
  }
  if (Object.keys(missing).length) return { ok: false, reason: "materials", inst, cost, missing };
  return { ok: true, inst, cost, to: inst.level + 1 };
}

export type RefineResult =
  | { ok: true; save: ArtifactSave; from: number; to: number; cost: RefineCost; awakened: boolean }
  | { ok: false; reason: RefineBlock; missing?: RefineCost };

/** Refine once: deduct the step's materials, level +1. Nothing else on the save changes. */
export function refineArtifact(save: ArtifactSave, uid: string, unlocks: { awaken: boolean }): RefineResult {
  const chk = refineCheck(save, uid, unlocks);
  if (!chk.ok) return { ok: false, reason: chk.reason, missing: chk.missing };
  const materials = { ...save.materials };
  for (const [id, n] of Object.entries(chk.cost) as [MaterialId, number][]) materials[id] = Math.max(0, materials[id] - n);
  const instances = save.instances.map((i) => (i.uid === uid ? { ...i, level: chk.to } : i));
  return { ok: true, save: { ...save, instances, materials }, from: chk.inst.level, to: chk.to, cost: chk.cost, awakened: chk.to >= ARTIFACT_MAX_LEVEL };
}

export const REFINE_BLOCK_TEXT: Record<RefineBlock, string> = {
  "unknown-instance": "找不到這件命器。",
  "max-level": "已達 Lv.10 覺醒，無需再淬鍊。",
  "awaken-locked": "覺醒需通關主線第 50 關後開放。",
  materials: "材料不足，請前往鎮厄司討伐取得。",
};
