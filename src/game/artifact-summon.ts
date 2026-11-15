import {
  ARTIFACTS,
  ARTIFACT_BY_ID,
  addInstance,
  artifactUnlocks,
  type ArtifactSave,
  type ArtifactRarity,
  type ArtifactDef,
} from "./artifacts.ts";
import {
  cleanArtifactSummon,
  type ArtifactPullRecord,
  type ArtifactSummonState,
} from "./artifact-summon-state.ts";
import { ARTIFACT_SUMMON } from "./artifact-summon-config.ts";
export { ARTIFACT_SUMMON } from "./artifact-summon-config.ts";
export const WISH_ARTIFACTS = ARTIFACTS.filter((a) => a.rarity === "SSR" || a.rarity === "SS");
export function setArtifactWish(
  state: ArtifactSummonState,
  eid: string | null,
): ArtifactSummonState {
  if (eid !== null && !WISH_ARTIFACTS.some((a) => a.id === eid)) return state;
  return { ...state, target: eid }; // Switching never erases either rarity's progress.
}
export function cleanSummon(raw: unknown): ArtifactSummonState {
  const s = cleanArtifactSummon(raw);
  return {
    ...s,
    target: WISH_ARTIFACTS.some((a) => a.id === s.target) ? s.target : null,
    history: s.history.filter((x) => ARTIFACT_BY_ID[x.eid]),
  };
}
const roll = (rng: () => number) => Math.max(0, Math.min(0.999999999999, rng()));
export function rollArtifactRarity(rng: () => number): ArtifactRarity {
  const x = roll(rng);
  const p = ARTIFACT_SUMMON.rates;
  return x < p.SSR ? "SSR" : x < p.SSR + p.SS ? "SS" : x < p.SSR + p.SS + p.S ? "S" : "R";
}
/** Atomic pure transaction: ink, instances, pity and ledger settle together BEFORE any animation. */
export function summonArtifacts(
  input: {
    artifacts: ArtifactSave;
    artifactSummon: ArtifactSummonState;
    ink: number;
    m3: Parameters<typeof artifactUnlocks>[0];
  },
  count: 1 | 10,
  rng = Math.random,
  now = Date.now(),
  /** "ticket": 命器召喚券 pays (the caller checks/spends tickets); same pool, rates and pity, no 墨玉. */
  pay: "ink" | "ticket" = "ink",
) {
  if (count !== 1 && count !== 10) return { ok: false as const, error: "invalid" };
  if (!artifactUnlocks(input.m3).vault) return { ok: false as const, error: "locked" };
  const cost = pay === "ticket" ? 0 : count === 10 ? ARTIFACT_SUMMON.ten : ARTIFACT_SUMMON.one;
  if (input.ink < cost) return { ok: false as const, error: "broke" };
  let artifacts = input.artifacts;
  const s = { ...input.artifactSummon };
  const records: ArtifactPullRecord[] = [];
  const target = s.target ? ARTIFACT_BY_ID[s.target] : null;
  const settle = (def: ArtifactDef, reason: ArtifactPullRecord["reason"], bonus = false) => {
    const isNew = !artifacts.instances.some((x) => x.eid === def.id);
    const essence = isNew ? 0 : ARTIFACT_SUMMON.essencePerDuplicate;
    let uid = `mq-pull-${s.total}${bonus ? "-wish" : ""}`;
    if (isNew) {
      const added = addInstance(artifacts, def.id);
      if (!added.instance) return false;
      artifacts = added.save;
      uid = added.instance.uid;
    }
    s.essence += essence;
    records.push({
      uid,
      essence,
      eid: def.id,
      rarity: def.rarity,
      isNew,
      at: now,
      pull: s.total,
      reason,
      ...(bonus ? { bonus: true } : {}),
    });
    return true;
  };
  for (let i = 0; i < count; i++) {
    let rarity = rollArtifactRarity(rng);
    let reason: ArtifactPullRecord["reason"] = "random";
    // Resolve SS wish one pull early before a simultaneous SSR deadline, preserving BOTH guarantees.
    const ssWish =
      target?.rarity === "SS" &&
      (s.wishSS >= ARTIFACT_SUMMON.wishSS - 1 ||
        (s.wishSS >= ARTIFACT_SUMMON.wishSS - 2 && s.sinceSSR === ARTIFACT_SUMMON.ssrPity - 2));
    const ssrWish = target?.rarity === "SSR" && s.wishSSR >= ARTIFACT_SUMMON.wishSSR - 1;
    let forcedTarget = false;
    if (ssrWish) {
      rarity = "SSR";
      reason = "wish";
      forcedTarget = true;
    } else if (ssWish && s.sinceSSR < ARTIFACT_SUMMON.ssrPity - 1) {
      rarity = "SS";
      reason = "wish";
      forcedTarget = true;
    } else if (s.sinceSSR >= ARTIFACT_SUMMON.ssrPity - 1) {
      rarity = "SSR";
      reason = "ssr-pity";
    } else if (s.sinceSS >= ARTIFACT_SUMMON.ssPity - 1 && rarity !== "SSR" && rarity !== "SS") {
      rarity = "SS";
      reason = "ss-pity";
    }
    const pool = ARTIFACTS.filter((a) => a.rarity === rarity);
    const def = forcedTarget && target ? target : pool[Math.floor(roll(rng) * pool.length)]!;
    s.total++;
    if (!settle(def, reason)) return { ok: false as const, error: "capacity" };
    // A target switch at the exact two deadlines cannot be solved by moving either deadline.
    // Preserve BOTH promises with a free target supplement; this is not a paid pull or extra pity tick.
    const wishSupplement =
      ssWish && s.wishSS >= ARTIFACT_SUMMON.wishSS - 1 && rarity === "SSR" && !!target;
    if (wishSupplement && !settle(target!, "wish", true))
      return { ok: false as const, error: "capacity" };
    s.sinceSS = rarity === "SS" || rarity === "SSR" ? 0 : s.sinceSS + 1;
    s.sinceSSR = rarity === "SSR" ? 0 : s.sinceSSR + 1;
    if (target?.rarity === "SSR") s.wishSSR = def.id === target.id ? 0 : s.wishSSR + 1;
    if (target?.rarity === "SS")
      s.wishSS = def.id === target.id || wishSupplement ? 0 : s.wishSS + 1;
  }
  s.spentInk += cost;
  s.history = [...s.history, ...records].slice(-ARTIFACT_SUMMON.historyLimit);
  return { ok: true as const, artifacts, artifactSummon: s, ink: input.ink - cost, records };
}
