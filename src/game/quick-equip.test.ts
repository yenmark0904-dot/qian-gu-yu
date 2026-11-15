import test from "node:test";
import assert from "node:assert/strict";
import { emptyArtifacts, cleanArtifacts, ARTIFACT_BY_ID } from "./artifacts.ts";
import {
  equipTransaction,
  unequipTransaction,
  sortedEquipment,
  equipmentStatus,
  lockBattleEquipment,
  equipmentBattleActive,
  emptyEquipmentTeam,
  type EquipState,
} from "./quick-equip.ts";
import { startArtifactRun, slotsFor, artifactCast } from "./artifact-engine.ts";

function fixture(): EquipState {
  return {
    owned: { qin: 1, zhouyu: 1, libai: 1 },
    m3: { "5": { stars: 1, best: 1 } },
    artifacts: {
      ...emptyArtifacts(),
      serial: 4,
      instances: [
        { uid: "a1", eid: "liuhe-xuanxi", level: 10, equippedBy: "qin", locked: true },
        { uid: "a2", eid: "chibi-guqin", level: 7, equippedBy: "zhouyu", locked: false },
        { uid: "a3", eid: "chibi-guqin", level: 3, equippedBy: null, locked: false },
      ],
    },
  };
}
function equip(s: EquipState, uid: string, target: string, confirmed = false) {
  return equipTransaction(s, uid, target, confirmed, (a) => {
    s.artifacts = a;
  });
}
for (const [label, target, uid, needConfirm] of [
  ["A", "libai", "a3", false],
  ["B", "qin", "a3", true],
  ["C", "libai", "a2", true],
  ["D", "qin", "a2", true],
] as const) {
  test(`case ${label}: atomic equip, no swap, no loss, growth retained`, () => {
    const s = fixture(),
      before = structuredClone(s),
      ref = s.artifacts;
    const r = equip(s, uid, target);
    assert.equal(r.ok, !needConfirm);
    if (needConfirm) {
      assert.equal(s.artifacts, ref);
      assert.equal(equip(s, uid, target, true).ok, true);
    }
    assert.equal(s.artifacts.instances.find((a) => a.uid === uid)?.equippedBy, target);
    assert.equal(s.artifacts.instances.length, before.artifacts.instances.length);
    const wearers = s.artifacts.instances.map((a) => a.equippedBy).filter(Boolean);
    assert.equal(new Set(wearers).size, wearers.length);
    for (const a of s.artifacts.instances) {
      const old = before.artifacts.instances.find((x) => x.uid === a.uid)!;
      assert.deepEqual({ ...a, equippedBy: null }, { ...old, equippedBy: null });
    }
    assert.deepEqual(s.artifacts.materials, before.artifacts.materials);
    if (target === "qin")
      assert.equal(s.artifacts.instances[0]!.equippedBy, null, "replaced returns to vault");
    if (uid === "a2")
      assert.ok(
        !s.artifacts.instances.some((a) => a.equippedBy === "zhouyu"),
        "source becomes empty, never swap",
      );
  });
}
test("unequip preserves every instance and growth, can equip again", () => {
  const s = fixture(),
    prev = s.artifacts;
  assert.equal(
    unequipTransaction(s, "a1", (a) => {
      s.artifacts = a;
    }),
    true,
  );
  assert.deepEqual(s.artifacts.instances[0], { ...prev.instances[0], equippedBy: null });
  assert.equal(equip(s, "a1", "libai").ok, true);
});
test("locked until exact stage 5 clears; failures do not change reference", () => {
  const s = fixture();
  s.m3 = { "6": { stars: 3, best: 1 } };
  const prev = s.artifacts;
  assert.deepEqual(equip(s, "a3", "libai"), { ok: false, reason: "locked" });
  assert.equal(
    unequipTransaction(s, "a1", () => assert.fail("must not commit")),
    false,
  );
  assert.equal(s.artifacts, prev);
  s.m3 = fixture().m3;
  for (const [uid, target] of [
    ["missing", "libai"],
    ["a3", "missing"],
    ["a3", "sima"],
  ])
    assert.equal(equip(s, uid!, target!).ok, false);
  assert.equal(s.artifacts, prev);
});
test("battle locks every entry for all modes and unlocks after cleanup", () => {
  const s = fixture(),
    release = lockBattleEquipment();
  try {
    assert.ok(equipmentBattleActive());
    assert.deepEqual(equip(s, "a3", "libai"), { ok: false, reason: "battle-active" });
    assert.equal(
      unequipTransaction(s, "a1", () => assert.fail()),
      false,
    );
  } finally {
    release();
  }
  assert.equal(equip(s, "a3", "libai").ok, true);
});
test("persistence failure rolls back original reference and all growth", () => {
  const s = fixture(),
    prev = s.artifacts;
  let calls = 0;
  const r = equipTransaction(s, "a2", "qin", true, (a) => {
    s.artifacts = a;
    calls++;
    throw Error("quota");
  });
  assert.deepEqual(r, { ok: false, reason: "save-failed" });
  assert.equal(s.artifacts, prev);
  assert.equal(calls, 2);
  assert.equal(
    unequipTransaction(s, "a1", (a) => {
      s.artifacts = a;
      throw Error("quota");
    }),
    false,
  );
  assert.equal(s.artifacts, prev);
});
test("old v5 artifact saves load without clearing wearer/refine; sorting and filters", () => {
  const s = fixture();
  assert.deepEqual(cleanArtifacts(s.artifacts, s.owned), s.artifacts);
  assert.deepEqual(
    sortedEquipment(s.artifacts.instances, "zhouyu").map((a) => a.uid),
    ["a2", "a3", "a1"],
  );
  assert.equal(sortedEquipment(s.artifacts.instances, "libai", "destined").length, 0);
  assert.deepEqual(
    sortedEquipment(s.artifacts.instances, "libai", "free").map((a) => a.uid),
    ["a3"],
  );
});
test("exclusive UI is honest about stage 30; non-owner never gets exclusive or awakened effect", () => {
  const s = fixture(),
    inst = s.artifacts.instances[1]!;
  assert.match(equipmentStatus(inst, "zhouyu", false), /共鳴尚未解鎖/);
  assert.equal(equipmentStatus(inst, "zhouyu", true), "命定共鳴 · 已啟動");
  assert.equal(equipmentStatus(inst, "libai", true), "通用效果生效，專屬效果未啟動");
  assert.equal(equip(s, "a2", "libai", true).ok, true);
  const stage = { mode: "raid", hasSeal: true, hasMilestone: false, hasGoal: false };
  const run = startArtifactRun(slotsFor(s.artifacts, ["libai"]), stage, true);
  assert.equal(run.slots[0]!.exclusive, false);
  const cast = artifactCast(run, "libai", ARTIFACT_BY_ID["chibi-guqin"]!.exclusive!.skillId);
  assert.equal(cast.armed.length, 0);
});

test("reminder derives only from unlocked live selected team, hidden before 5 or fully equipped", () => {
  const s = fixture();
  const team = ["qin", "zhouyu", "libai"];
  assert.deepEqual(emptyEquipmentTeam(s.m3, s.artifacts, team), ["libai"]);
  assert.deepEqual(emptyEquipmentTeam({}, s.artifacts, team), []);
  assert.equal(equip(s, "a3", "libai").ok, true);
  assert.deepEqual(emptyEquipmentTeam(s.m3, s.artifacts, team), []);
  assert.deepEqual(emptyEquipmentTeam(s.m3, s.artifacts, ["qin", "zhouyu"]), []);
});
