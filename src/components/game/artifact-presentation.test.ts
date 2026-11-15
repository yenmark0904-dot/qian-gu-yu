import test from "node:test";
import assert from "node:assert/strict";
import { ARTIFACTS, exclusivePct, scaled } from "../../game/artifacts.ts";
import { artifactCast, startArtifactRun } from "../../game/artifact-engine.ts";
import { battleRows, generalEffect, pctText, skillBonus } from "./artifact-presentation.ts";

test("all 27 artifact UI skill bonuses exactly match the live resonance engine at Lv.1–10, with/without destiny", () => {
  assert.equal(ARTIFACTS.length, 27);
  for (const def of ARTIFACTS)
    for (let level = 1; level <= 10; level++) {
      for (const wearerId of [def.exclusiveCharacterId ?? "libai", "non-owner"]) {
        const skillId =
          def.exclusive && wearerId === def.exclusiveCharacterId ? def.exclusive.skillId : wearerId;
        const run = startArtifactRun(
          [{ wearerId, uid: "fixture", eid: def.id, level }],
          { mode: "raid", hasSeal: true, hasGoal: true, hasMilestone: true },
          true,
        );
        const fire = artifactCast(run, wearerId, skillId).resonance[0]!;
        assert.equal(
          skillBonus(def, level, wearerId),
          fire.skillPct,
          `${def.id} Lv.${level} ${wearerId}`,
        );
        assert.equal(battleRows(def, level, wearerId)[0]!.value, `+${pctText(fire.skillPct)}`);
      }
    }
});

test("only real charge and shield-shred fields become combat benefits; score passive numbers stay exact", () => {
  for (const def of ARTIFACTS)
    for (const level of [1, 5, 9, 10]) {
      const rows = battleRows(def, level, null);
      const r = def.general.rule;
      assert.equal(
        rows.some((row) => row.key === "charge"),
        r.kind === "charge",
      );
      assert.equal(
        rows.some((row) => row.key === "shred"),
        !!def.exclusive?.raidShred,
      );
      assert.ok(!rows.some((row) => /治療|護盾生成|灼燒/.test(row.label)));
      if (r.kind === "charge")
        assert.ok(generalEffect(def, level).includes(String(scaled(r.energy, level, true))));
      else assert.ok(generalEffect(def, level).includes(pctText(scaled(r.pct, level))));
      if (def.exclusive)
        assert.equal(
          skillBonus(def, level, def.exclusiveCharacterId),
          exclusivePct(def.exclusive, level),
        );
    }
});
