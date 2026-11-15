import { ARTIFACTS, emptyArtifacts } from "../src/game/artifacts.ts";
import { emptyArtifactSummon } from "../src/game/artifact-summon-state.ts";
import { ARTIFACT_SUMMON as C, summonArtifacts } from "../src/game/artifact-summon.ts";
import { writeFileSync } from "node:fs";
let seed = 0x20261107;
const rng = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const simulations = [];
for (const targetRarity of [null, "SS", "SSR"]) {
  let state = {
    artifacts: emptyArtifacts(),
    artifactSummon: emptyArtifactSummon(),
    ink: 1e12,
    m3: { "5": { stars: 3, best: 9000 } },
  };
  const target = ARTIFACTS.find((a) => a.rarity === targetRarity)?.id ?? null;
  state.artifactSummon.target = target;
  const bins = { R: 0, S: 0, SS: 0, SSR: 0 };
  let lastSSR = 0,
    lastSS = 0,
    lastTarget = 0,
    maxSSR = 0,
    maxSS = 0,
    maxTarget = 0,
    bonus = 0;
  const pulls = 100000;
  for (let i = 1; i <= pulls; i++) {
    const r = summonArtifacts(state, 1, rng, 0);
    if (!r.ok) throw Error(r.error);
    state = { ...state, ink: r.ink, artifacts: r.artifacts, artifactSummon: r.artifactSummon };
    for (const card of r.records) {
      bins[card.rarity]++;
      if (card.bonus) bonus++;
      if (card.rarity === "SSR") {
        maxSSR = Math.max(maxSSR, i - lastSSR);
        lastSSR = i;
      }
      if (card.rarity === "SSR" || card.rarity === "SS") {
        maxSS = Math.max(maxSS, i - lastSS);
        lastSS = i;
      }
      if (card.eid === target) {
        maxTarget = Math.max(maxTarget, i - lastTarget);
        lastTarget = i;
      }
    }
    if (
      i - lastSSR >= C.ssrPity ||
      i - lastSS >= C.ssPity ||
      (target && i - lastTarget >= (targetRarity === "SS" ? C.wishSS : C.wishSSR))
    )
      throw Error(`Guarantee violation ${targetRarity} draw ${i}`);
  }
  simulations.push({
    targetRarity,
    pulls,
    bins,
    ratesIncludingGuarantees: Object.fromEntries(
      Object.entries(bins).map(([k, v]) => [k, `${((v / pulls) * 100).toFixed(4)}%`]),
    ),
    maxGapSSR: maxSSR,
    maxGapSSPlus: maxSS,
    maxGapTarget: target ? maxTarget : null,
    freeSupplements: bonus,
    essence: state.artifactSummon.essence,
    inventory: state.artifacts.instances.length,
  });
}
const report = {
  seed: "0x20261107",
  method:
    "Deterministic LCG, 100000 sequential pulls per scenario, checks every pity deadline; rates are simulation, not official base rates",
  config: C,
  simulations,
};
writeFileSync("docs/STAGE_D_SUMMON_SIMULATION.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
