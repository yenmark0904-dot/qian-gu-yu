// Real Zustand + persistence, isolated fake localStorage; no user data or network.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
test("real v5 hydration, atomic store D, failed persistence rollback, battle/gate policies", async () => {
  const memory = new Map();
  let fail = false;
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => {
      if (fail) throw Error("quota");
      memory.set(k, v);
    },
    removeItem: (k) => memory.delete(k),
  };
  globalThis.window = { localStorage };
  const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  try {
    const { useSave } = await server.ssrLoadModule("/src/game/store.ts");
    const { lockBattleEquipment } = await server.ssrLoadModule("/src/game/quick-equip.ts");
    const raw = {
      owned: { qin: 1, zhouyu: 1, libai: 1 },
      m3: { 5: { stars: 1, best: 1 } },
      ink: 777,
      artifacts: {
        instances: [
          { uid: "a1", eid: "liuhe-xuanxi", equippedBy: "qin", level: 10, locked: true },
          { uid: "a2", eid: "chibi-guqin", equippedBy: "zhouyu", level: 7, locked: false },
        ],
        materials: { jingmosha: 9, zhenejing: 4, tianmingcanyin: 1, suyuanlu: 2 },
        grants: ["vault-gift"],
        serial: 3,
      },
    };
    memory.set("qiangu-yu", JSON.stringify({ version: 5, state: raw }));
    await useSave.persist.rehydrate();
    assert.deepEqual(
      useSave.getState().artifacts,
      raw.artifacts,
      "v5 wearer, level, materials unchanged",
    );
    const initial = useSave.getState().artifacts;
    assert.equal(useSave.getState().equipArtifact("a2", "qin").reason, "needs-confirm");
    assert.equal(useSave.getState().artifacts, initial);
    let commits = 0;
    const unsubscribe = useSave.subscribe((s) => {
      if (s.artifacts !== initial) commits++;
    });
    assert.equal(useSave.getState().equipArtifact("a2", "qin", true).ok, true);
    unsubscribe();
    assert.equal(commits, 1, "D commits exactly once");
    assert.deepEqual(
      useSave.getState().artifacts.instances.map((a) => [a.uid, a.equippedBy, a.level]),
      [
        ["a1", null, 10],
        ["a2", "qin", 7],
      ],
    );
    await useSave.persist.rehydrate();
    assert.equal(useSave.getState().artifacts.instances[1].equippedBy, "qin");
    const before = useSave.getState().artifacts,
      disk = memory.get("qiangu-yu");
    fail = true;
    const failed = useSave.getState().equipArtifact("a1", "libai");
    assert.equal(failed.reason, "save-failed");
    assert.equal(useSave.getState().artifacts, before);
    assert.equal(memory.get("qiangu-yu"), disk);
    assert.equal(useSave.getState().unequipArtifact("a2"), false);
    assert.equal(useSave.getState().artifacts, before);
    fail = false;
    const release = lockBattleEquipment();
    try {
      assert.equal(useSave.getState().equipArtifact("a1", "libai").reason, "battle-active");
      assert.equal(useSave.getState().unequipArtifact("a2"), false);
    } finally {
      release();
    }
    useSave.setState({ m3: { 4: { stars: 3, best: 1 } } });
    assert.equal(useSave.getState().equipArtifact("a1", "libai").reason, "locked");
    assert.equal(useSave.getState().artifacts, before);
    assert.equal(useSave.getState().ink, 777);
  } finally {
    await server.close();
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
