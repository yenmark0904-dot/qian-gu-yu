// 修行簿 save test: real zustand persistence on an isolated in-memory fixture. No user saves or network.
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
  const { useSave, toCloud } = await server.ssrLoadModule("/src/game/store.ts");
  const old = {
    ink: 5000,
    pity: 12,
    totalPulls: 91,
    history: ["zhouyu"],
    owned: { zhouyu: 7, libai: 2 },
    m3: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), { stars: 2, best: 900 }])),
    marks: 75,
    lastDaily: "2026-11-01",
    mainStoryPrologueRead: true,
    mainStoryRead: [1, 2],
    sgBest: 3,
  };
  memory.set("qiangu-yu", JSON.stringify({ state: old, version: 5 }));
  await useSave.persist.rehydrate();
  let s = useSave.getState();
  // additive: old save keeps everything; new fields default safely
  assert.equal(s.ink, 5000);
  assert.deepEqual(s.owned, old.owned);
  assert.equal(s.lastDaily, "2026-11-01");
  assert.equal(s.charTickets, 0);
  assert.equal(s.artifactTickets, 0);
  assert.deepEqual(s.questBook.milestones, []);
  assert.equal(JSON.parse(memory.get("qiangu-yu")).version, 5);

  // 補領 milestones the old player already met, once
  assert.deepEqual(s.claimMilestone("prologue"), { charTickets: 10, artifactTickets: 0 });
  assert.ok(useSave.getState().claimMilestone("stage5"));
  assert.ok(useSave.getState().claimMilestone("stage10"));
  assert.equal(useSave.getState().claimMilestone("stage20"), null);
  assert.equal(useSave.getState().claimMilestone("prologue"), null);
  s = useSave.getState();
  assert.equal(s.charTickets, 20);
  assert.equal(s.artifactTickets, 15);

  // LOGIN only
  s.questEvent("LOGIN_COMPLETED");
  assert.equal(useSave.getState().questBook.counts.MATCH3_COMPLETED, 0);
  assert.equal(useSave.getState().claimQuest("login"), 10);
  assert.equal(useSave.getState().claimQuest("login"), 0);
  assert.equal(useSave.getState().claimQuest("match1"), 0);

  // free pull: no ink, once, survives reload
  const inkBefore = useSave.getState().ink;
  const pullsBefore = useSave.getState().totalPulls;
  const free = useSave.getState().pullFree();
  assert.ok(Array.isArray(free) && free.length === 1);
  const tierInk = free[0].tierInk ?? 0;
  assert.equal(useSave.getState().ink, inkBefore + tierInk);
  assert.equal(useSave.getState().totalPulls, pullsBefore + 1);
  await useSave.persist.rehydrate();
  assert.equal(useSave.getState().pullFree(), "used");
  assert.equal(useSave.getState().claimQuest("free"), 10);

  // ticket pulls: separate pools, no fallback to 墨玉
  const ink2 = useSave.getState().ink;
  assert.equal(useSave.getState().pull(10, "ticket").length, 10);
  assert.equal(useSave.getState().charTickets, 10);
  const t1 = useSave.getState().pull(1, "ticket");
  assert.equal(useSave.getState().charTickets, 9);
  assert.equal(useSave.getState().pull(10, "ticket"), "no-tickets");
  assert.equal(useSave.getState().charTickets, 9);
  const tierSum = (cards) => cards.reduce((n, c) => n + (c.tierInk ?? 0), 0);
  assert.ok(useSave.getState().ink >= ink2 && useSave.getState().ink - ink2 <= 2000);
  void t1; void tierSum;
  const art = useSave.getState().pullArtifact(10, "ticket");
  assert.equal(art.length >= 10, true);
  assert.equal(useSave.getState().artifactTickets, 5);
  assert.equal(useSave.getState().pullArtifact(10, "ticket"), "no-tickets");
  assert.equal(useSave.getState().artifactSummon.total, 10);

  // match-3 clears advance 玉局 only (t445u: 命器養成 is now 強化命器一次)
  useSave.getState().clearLevel(13, 1, 100);
  useSave.getState().clearFloor(4, 100);
  assert.equal(useSave.getState().questBook.counts.MATCH3_COMPLETED, 2);
  assert.equal(useSave.getState().questBook.counts.EQUIPMENT_MATCH_COMPLETED, 0);
  assert.equal(useSave.getState().winRaid("nope"), null);
  assert.equal(useSave.getState().questBook.counts.BOSS_BATTLE_WON, 0);
  // main story reread counts
  useSave.getState().markMainStoryRead(1);
  assert.equal(useSave.getState().questBook.counts.MAIN_STORY_READ, 1);

  // chests
  assert.equal(useSave.getState().claimQuest("match1"), 10);
  assert.equal(useSave.getState().claimQuest("mainstory"), 15);
  const inkC = useSave.getState().ink;
  assert.deepEqual(useSave.getState().claimQuestChest(20), { ink: 20 });
  assert.deepEqual(useSave.getState().claimQuestChest(40), { material: { id: "jingmosha", name: "淨墨砂", n: 10 } });
  assert.equal(useSave.getState().claimQuestChest(40), null);
  assert.equal(useSave.getState().ink, inkC + 20);
  assert.equal(useSave.getState().artifacts.materials.jingmosha, 10);
  // 命器淬鍊 once (淨墨砂 ×8) → 命器養成 「強化命器一次」 done; 墨玉 untouched.
  {
    const inkR = useSave.getState().ink;
    const uid = useSave.getState().artifacts.instances[0].uid;
    const r = useSave.getState().refineArtifact(uid);
    assert.equal(r.ok, true);
    assert.equal(useSave.getState().artifacts.materials.jingmosha, 2);
    assert.equal(useSave.getState().artifacts.instances[0].level, 2);
    assert.equal(useSave.getState().questBook.counts.ARTIFACT_ENHANCED, 1);
    assert.equal(useSave.getState().ink, inkR);
    const r2 = useSave.getState().refineArtifact(uid);
    assert.equal(r2.ok, false);
    assert.equal(useSave.getState().artifacts.materials.jingmosha, 2);
    assert.equal(useSave.getState().claimQuest("equip"), 10);
  }
  await useSave.persist.rehydrate();
  assert.equal(useSave.getState().claimQuestChest(20), null);

  // cloud row unchanged in shape
  assert.deepEqual(Object.keys(toCloud(useSave.getState())).sort(), ["history", "ink", "lastDaily", "owned", "pity", "totalPulls", "volumeAwards"]);
  // a cloud snapshot merge (no quest fields) keeps local book + tickets
  const before = useSave.getState();
  const merged = useSave.persist.getOptions().merge({ ink: 1, owned: before.owned }, before);
  assert.deepEqual(merged.questBook.milestones, before.questBook.milestones);
  assert.equal(merged.charTickets, before.charTickets);
  assert.equal(merged.artifactTickets, before.artifactTickets);
  // daily 800 gift untouched
  assert.equal(useSave.getState().claimDaily(), true);
  console.log("quest-save-test: PASS — additive v5 load, milestone 補領 once, LOGIN only, free pull once (reload-safe), ticket pools separate, chests once, cloud shape unchanged");
} finally {
  await server.close();
}
