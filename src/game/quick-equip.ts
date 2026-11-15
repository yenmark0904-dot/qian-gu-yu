/** Equipment UI/transaction policy. No inventory or combat values live here. */
import {
  ARTIFACT_BY_ID,
  artifactUnlocks,
  equippedOn,
  equipArtifact,
  exclusiveActive,
  unequipArtifact,
  type ArtifactSave,
  type ArtifactInstance,
  type EquipResult,
} from "./artifacts.ts";
import type { LevelRecord } from "./levels.ts";

// Ephemeral, deliberately NOT part of qiangu-yu persistence. All battle modes use Game.
const battles = new Set<symbol>();
export function lockBattleEquipment() {
  const token = Symbol("battle");
  battles.add(token);
  return () => {
    battles.delete(token);
  };
}
export const equipmentBattleActive = () => battles.size > 0;
export const equipmentBlock = (m3: Record<string, LevelRecord>) =>
  equipmentBattleActive() ? "battle-active" : !artifactUnlocks(m3).vault ? "locked" : null;

export type EquipState = {
  artifacts: ArtifactSave;
  owned: Record<string, number>;
  m3: Record<string, LevelRecord>;
};
/** Uses the original pure rule (including atomic D), then one commit. Failed persistence restores memory. */
export function equipTransaction(
  before: EquipState,
  uid: string,
  charId: string,
  confirmed: boolean,
  commit: (a: ArtifactSave) => void,
): EquipResult {
  const original = before.artifacts;
  const block = equipmentBlock(before.m3);
  if (block) return { ok: false, reason: block };
  const result = equipArtifact(before.artifacts, uid, charId, before.owned, confirmed);
  if (!result.ok) return result;
  if (result.replaced && !confirmed)
    return { ok: false, reason: "needs-replace-confirm", from: charId };
  if (result.save === before.artifacts) return result;
  try {
    commit(result.save);
  } catch {
    try {
      commit(original);
    } catch {
      /* Zustand memory is restored before persist throws. */
    }
    return { ok: false, reason: "save-failed" };
  }
  return result;
}
export function unequipTransaction(
  before: EquipState,
  uid: string,
  commit: (a: ArtifactSave) => void,
): boolean {
  const original = before.artifacts;
  if (equipmentBlock(before.m3)) return false;
  const next = unequipArtifact(before.artifacts, uid);
  if (next === before.artifacts) return true;
  try {
    commit(next);
    return true;
  } catch {
    try {
      commit(original);
    } catch {
      /* restore memory */
    }
    return false;
  }
}
export function sortedEquipment(
  instances: ArtifactInstance[],
  charId: string,
  filter: "all" | "free" | "destined" = "all",
) {
  const destined = (a: ArtifactInstance) => ARTIFACT_BY_ID[a.eid]?.exclusiveCharacterId === charId;
  const priority = (a: ArtifactInstance) =>
    destined(a) ? 0 : !a.equippedBy || a.equippedBy === charId ? 1 : 2;
  return instances
    .filter((a) => filter === "all" || (filter === "free" ? !a.equippedBy : destined(a)))
    .slice()
    .sort((a, b) => priority(a) - priority(b));
}
/** Exclusive score layer is owner-gated, NOT stage-30-gated. Damage resonance is a separate unlock. */
export function equipmentStatus(inst: ArtifactInstance, charId: string, resonance: boolean) {
  const def = ARTIFACT_BY_ID[inst.eid];
  if (!def?.exclusive) return `通用效果生效${resonance ? " · 共鳴已解鎖" : " · 共鳴第 30 關解鎖"}`;
  if (!exclusiveActive(def, charId)) return "通用效果生效，專屬效果未啟動";
  return resonance ? "命定共鳴 · 已啟動" : "命定專屬已啟動 · 共鳴尚未解鎖（第 30 關）";
}
export { equippedOn };

export function emptyEquipmentTeam(
  m3: Record<string, LevelRecord>,
  artifacts: ArtifactSave,
  team: string[],
) {
  return artifactUnlocks(m3).vault ? team.filter((id) => !equippedOn(artifacts, id)) : [];
}
