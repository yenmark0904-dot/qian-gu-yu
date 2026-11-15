import { ARTIFACT_SUMMON as C } from "./artifact-summon-config.ts";
/** Additive, independent 命器 summon ledger. No character rewards or bond data. */
export type ArtifactPullRecord = {
  uid: string;
  bonus?: boolean;
  essence?: number;
  eid: string;
  rarity: "SSR" | "SS" | "S" | "R";
  isNew: boolean;
  at: number;
  pull: number;
  reason: "random" | "ss-pity" | "ssr-pity" | "wish";
};
export type ArtifactSummonState = {
  sinceSS: number;
  sinceSSR: number;
  wishSSR: number;
  wishSS: number;
  target: string | null;
  essence: number;
  total: number;
  spentInk: number;
  history: ArtifactPullRecord[];
};
export const emptyArtifactSummon = (): ArtifactSummonState => ({
  sinceSS: 0,
  sinceSSR: 0,
  wishSSR: 0,
  wishSS: 0,
  target: null,
  essence: 0,
  total: 0,
  spentInk: 0,
  history: [],
});
export function cleanArtifactSummon(raw: unknown): ArtifactSummonState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ArtifactSummonState>;
  const n = (v: unknown, max = Number.MAX_SAFE_INTEGER) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
  return {
    sinceSS: n(r.sinceSS, C.ssPity - 1),
    sinceSSR: n(r.sinceSSR, C.ssrPity - 1),
    wishSSR: n(r.wishSSR, C.wishSSR - 1),
    wishSS: n(r.wishSS, C.wishSS - 1),
    target: typeof r.target === "string" ? r.target : null,
    essence: n(r.essence),
    total: n(r.total),
    spentInk: n(r.spentInk),
    history: Array.isArray(r.history)
      ? r.history
          .filter(
            (x) =>
              x &&
              typeof x.uid === "string" &&
              typeof x.eid === "string" &&
              ["SSR", "SS", "S", "R"].includes(x.rarity) &&
              Number.isFinite(x.at) &&
              Number.isInteger(x.pull),
          )
          .slice(-C.historyLimit)
          .map((x) => ({
            uid: x.uid,
            eid: x.eid,
            rarity: x.rarity,
            isNew: x.isNew === true,
            at: n(x.at),
            pull: n(x.pull),
            reason: ["random", "ss-pity", "ssr-pity", "wish"].includes(x.reason)
              ? x.reason
              : "random",
            ...(x.essence !== undefined ? { essence: n(x.essence) } : {}),
            ...(x.bonus ? { bonus: true } : {}),
          }))
      : [],
  };
}
