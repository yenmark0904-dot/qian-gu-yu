/** UI projections only. All values come from the existing catalog/engine, never new balance tables. */
import { ARTIFACT_LIMITS, RESONANCE } from "../../game/artifact-engine.ts";
import {
  exclusiveActive,
  exclusivePct,
  scaled,
  type ArtifactDef,
  type ArtifactRule,
} from "../../game/artifacts.ts";

export const pctText = (x: number) => `${Math.round(x * 1000) / 10}%`;
export function generalEffect(def: ArtifactDef, lv: number) {
  const r = def.general.rule;
  return r.kind === "charge"
    ? `裝備者額外蓄勢 +${scaled(r.energy, lv, true)}`
    : `符合條件時得分 +${pctText(scaled(r.pct, lv))}`;
}
export function ruleValue(rule: ArtifactRule, level: number): string {
  return rule.kind === "charge"
    ? `蓄勢 +${scaled(rule.energy, level, true)}`
    : `得分 +${pctText(scaled(rule.pct, level))}`;
}
export function skillBonus(def: ArtifactDef, level: number, wearerId: string | null): number {
  return Math.min(
    RESONANCE.maxSkillPct,
    def.exclusive && exclusiveActive(def, wearerId)
      ? exclusivePct(def.exclusive, level)
      : scaled(RESONANCE.skillPct, level),
  );
}
export function battleRows(def: ArtifactDef, level: number, wearerId: string | null) {
  const rows = [
    {
      key: "resonance",
      label: "共鳴・技能命中增傷",
      value: `+${pctText(skillBonus(def, level, wearerId))}`,
      hint: `裝備者發動自身技能；每場最多 ${RESONANCE.perBattle} 次，間隔 ${RESONANCE.cooldownMoves} 步。無直接傷害的技能不產生額外傷害。`,
    },
  ];
  if (def.general.rule.kind === "charge")
    rows.push({
      key: "charge",
      label: "通用・額外蓄勢",
      value: `+${scaled(def.general.rule.energy, level, true)}`,
      hint: `依下方被動條件觸發；每關前 ${def.general.rule.uses} 次，裝備者每關最多額外 ${ARTIFACT_LIMITS.energyPerStage} 點。`,
    });
  if (def.exclusive?.raidShred)
    rows.push({
      key: "shred",
      label: "命定專屬・護盾削減",
      value: "有限額破盾",
      hint: "僅墨厄討伐；命定者發動自身技能後，於專屬條件觸發時附加。非每次攻擊觸發。",
    });
  return rows;
}
