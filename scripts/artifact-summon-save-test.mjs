// Real zustand persistence, isolated in-memory fixture. No user saves or network.
import { createServer } from "vite";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => memory.set(k, v),
  removeItem: (k) => memory.delete(k),
};
globalThis.window = { localStorage: globalThis.localStorage };
const server = await createServer({
  configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const { useSave } = await server.ssrLoadModule("/src/game/store.ts");
  const { sanitizeSnapshot, SNAPSHOT_KEYS } = await server.ssrLoadModule("/src/game/cloud-save.ts");
  const old = {
    ink: 12345,
    pity: 12,
    totalPulls: 91,
    history: ["zhouyu"],
    owned: { zhouyu: 7, libai: 2 },
    m3: { 5: { stars: 3, best: 9000 } },
    marks: 75,
    sgBest: 8,
    mainStoryRead: [1, 2],
    volumeAwards: [1],
  };
  for (const version of [0, 3, 4]) {
    memory.set("qiangu-yu", JSON.stringify({ state: old, version }));
    await useSave.persist.rehydrate();
    const s = useSave.getState();
    assert.equal(s.ink, old.ink);
    assert.equal(s.artifactSummon.total, 0);
    assert.deepEqual(s.m3, old.m3);
    assert.deepEqual(s.owned, old.owned);
    assert.equal(s.sgBest, 8);
    assert.deepEqual(s.mainStoryRead, [1, 2]);
  }
  const random = Math.random;
  Math.random = () => 0.99;
  try {
    useSave.getState().setArtifactWish("chibi-guqin");
    const one = useSave.getState().pullArtifact(1);
    assert.ok(Array.isArray(one));
    const ten = useSave.getState().pullArtifact(10);
    assert.equal(ten.length, 10);
  } finally {
    Math.random = random;
  }
  const s = useSave.getState();
  assert.equal(s.ink, old.ink - 150 - 1350);
  assert.equal(s.artifactSummon.total, 11);
  assert.ok(s.artifactSummon.essence > 0);
  assert.deepEqual(s.owned, old.owned);
  assert.deepEqual(s.history, old.history);
  assert.equal(s.pity, old.pity);
  assert.equal(s.totalPulls, old.totalPulls);
  assert.equal(s.marks, old.marks);
  const settled = JSON.parse(memory.get("qiangu-yu"));
  assert.equal(settled.version, 5);
  for (let i = 0; i < 5; i++) await useSave.persist.rehydrate();
  assert.deepEqual(useSave.getState().artifactSummon, settled.state.artifactSummon);
  assert.deepEqual(useSave.getState().artifacts, settled.state.artifacts);
  assert.equal(useSave.getState().ink, settled.state.ink);
  assert.ok(SNAPSHOT_KEYS.includes("artifactSummon"));
  const snap = sanitizeSnapshot(useSave.getState());
  assert.ok(snap.ok);
  assert.deepEqual(snap.data.artifactSummon, useSave.getState().artifactSummon);
  // localStorage quota errors must roll back in-memory results and ink too.
  const beforeFail = {
    ink: useSave.getState().ink,
    artifacts: useSave.getState().artifacts,
    ledger: useSave.getState().artifactSummon,
  };
  const setItem = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error("fixture quota exceeded");
  };
  try {
    assert.equal(useSave.getState().pullArtifact(1), "save-failed");
  } finally {
    localStorage.setItem = setItem;
  }
  assert.equal(useSave.getState().ink, beforeFail.ink);
  assert.deepEqual(useSave.getState().artifacts, beforeFail.artifacts);
  assert.deepEqual(useSave.getState().artifactSummon, beforeFail.ledger);
  console.log(
    "artifact-summon-save-test: PASS — additive v0/3/4 migration, single/ten costs, independent character ledger, essence, cloud snapshot, five refreshes no regrant",
  );
} finally {
  await server.close();
}
