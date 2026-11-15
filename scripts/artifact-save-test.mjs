// Local fixture only: real store hydration for V2.0 命器 — no user storage, no network.
import { createServer } from "vite";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage };
const server = await createServer({ configFile: false, resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { useSave } = await server.ssrLoadModule("/src/game/store.ts");
  const { sanitizeSnapshot, SNAPSHOT_KEYS } = await server.ssrLoadModule("/src/game/cloud-save.ts");
  const m3 = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), { stars: 3, best: 5000 + i }]));
  // A pre-V2 save (no artifacts field at all), version 4 and older.
  const old = {
    ink: 9876, pity: 12, owned: { zhouyu: 7, libai: 2, machao: 31 }, totalPulls: 80, history: ["zhouyu"],
    m3, volumeAwards: [1], mainStoryRead: [1, 2], mainStoryPrologueRead: true, mainStoryHanRead: [1, 2, 3],
    tierInkPaid: { zhouyu: 1, machao: 6 }, sgBest: 9, sgTotal: 12345, sgRanksPaid: [0], marks: 77,
    letters: {}, assist: "zhouyu", raid: { team: ["zhouyu"], records: { "ink-shadow": { cleared: true, rewardClaimed: true, bestMoves: 4 } } },
  };
  for (const version of [0, 3, 4]) {
    memory.set("qiangu-yu", JSON.stringify({ state: old, version }));
    await useSave.persist.rehydrate();
    const s = useSave.getState();
    assert.equal(s.ink, 9876, "墨玉 kept");
    assert.deepEqual(s.owned, old.owned, "owned cards + 緣分 copies kept");
    assert.deepEqual(s.m3, m3, "stars kept");
    assert.deepEqual(s.mainStoryRead, [1, 2]);
    assert.equal(s.mainStoryPrologueRead, true);
    assert.deepEqual(s.mainStoryHanRead, [1, 2, 3]);
    assert.deepEqual(s.volumeAwards, [1]);
    assert.equal(s.sgBest, 9);
    assert.equal(s.marks, 77);
    assert.equal(s.raid.records["ink-shadow"].rewardClaimed, true);
    // cleared 第 5 關 already → auto unlock + exactly one gift
    assert.equal(s.artifacts.instances.length, 1);
    assert.equal(s.artifacts.instances[0].eid, "suxin-yuzhui");
    assert.deepEqual(s.artifacts.grants, ["vault-gift"]);
  }
  // Re-hydrate the saved V2 state several times: never a second gift.
  for (let i = 0; i < 3; i++) await useSave.persist.rehydrate();
  assert.equal(useSave.getState().artifacts.instances.length, 1);
  assert.equal(useSave.getState().syncArtifactGift(), null);
  // Equip / transfer through the store; 緣分 copies untouched.
  const uid = useSave.getState().artifacts.instances[0].uid;
  assert.ok(useSave.getState().equipArtifact(uid, "zhouyu").ok);
  const t = useSave.getState().equipArtifact(uid, "machao");
  assert.equal(t.ok, false);
  assert.equal(t.reason, "needs-confirm");
  assert.ok(useSave.getState().equipArtifact(uid, "machao", true).ok);
  assert.equal(useSave.getState().artifacts.instances[0].equippedBy, "machao");
  assert.deepEqual(useSave.getState().owned, old.owned);
  // Persisted + reloaded = same equip, no duplication.
  await useSave.persist.rehydrate();
  assert.equal(useSave.getState().artifacts.instances.length, 1);
  assert.equal(useSave.getState().artifacts.instances[0].equippedBy, "machao");
  // Cloud snapshot carries artifacts through the same cleaner.
  assert.ok(SNAPSHOT_KEYS.includes("artifacts"));
  const snap = sanitizeSnapshot(useSave.getState());
  assert.ok(snap.ok);
  assert.deepEqual(snap.data.artifacts, useSave.getState().artifacts);
  // A brand-new player below 第 5 關 gets nothing; clearing 第 5 關 grants once, atomically.
  memory.set("qiangu-yu", JSON.stringify({ state: { ink: 100, owned: { machao: 1 }, m3: { 1: { stars: 1, best: 1 } } }, version: 4 }));
  await useSave.persist.rehydrate();
  assert.equal(useSave.getState().artifacts.instances.length, 0);
  for (const id of [2, 3, 4]) useSave.getState().clearLevel(id, 1, 100);
  assert.equal(useSave.getState().artifacts.instances.length, 0);
  useSave.getState().clearLevel(5, 1, 100);
  useSave.getState().clearLevel(5, 3, 9000);
  useSave.getState().clearLevel(6, 1, 100);
  assert.equal(useSave.getState().artifacts.instances.length, 1);
  console.log("artifact-save-test: ok");
} finally {
  await server.close();
}
