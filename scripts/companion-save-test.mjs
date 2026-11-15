// Local Node/Vite module test: no browser, no external services, no real player's storage.
import { createServer } from "vite";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  const old = {
    ink: 4321,
    pity: 17,
    owned: { qin: 1, taishici: 31 },
    history: ["qin"],
    totalPulls: 22,
    mainStoryRead: [1],
    letters: {},
  };
  memory.set("qiangu-yu", JSON.stringify({ state: old, version: 4 }));
  for (const version of [0, 3, 4]) {
    memory.set("qiangu-yu", JSON.stringify({ state: old, version }));
    await useSave.persist.rehydrate();
    assert.equal(useSave.getState().ink, 4321);
    assert.equal(useSave.getState().companionId, null);
  }
  await useSave.persist.rehydrate();
  assert.equal(useSave.getState().ink, 4321);
  assert.equal(useSave.getState().companionId, null);
  assert.equal(useSave.getState().companionGuideDone, false);
  const before = JSON.stringify({
    owned: useSave.getState().owned,
    ink: useSave.getState().ink,
    pity: useSave.getState().pity,
  });
  assert.equal(useSave.getState().setCompanionId("libai"), false);
  assert.equal(useSave.getState().setCompanionId("taishici"), true);
  assert.equal(useSave.getState().setCompanionId("qin"), true);
  assert.equal(useSave.getState().setCompanionId("taishici"), true);
  assert.equal(
    JSON.stringify({
      owned: useSave.getState().owned,
      ink: useSave.getState().ink,
      pity: useSave.getState().pity,
    }),
    before,
  );
  assert.equal(useSave.getState().companionGuideDone, true);
  await useSave.persist.rehydrate();
  assert.equal(useSave.getState().companionId, "taishici");
  const ownLetter = (await server.ssrLoadModule("/src/game/letters.ts")).LETTERS.find(
    (l) => l.character === "qin",
  );
  assert.ok(ownLetter);
  useSave.getState().readLetter(ownLetter.id);
  const reward = useSave.getState().replyLetter(ownLetter.id, ownLetter.replies[0].id);
  assert.equal(reward, 20);
  const ink = useSave.getState().ink;
  await useSave.persist.rehydrate();
  assert.equal(useSave.getState().letters[ownLetter.id].completed, true);
  assert.equal(useSave.getState().replyLetter(ownLetter.id, ownLetter.replies[1].id), 0);
  assert.equal(useSave.getState().ink, ink);
  memory.set(
    "qiangu-yu",
    JSON.stringify({
      state: { ...old, companionId: "libai", companionGuideDone: true },
      version: 4,
    }),
  );
  await useSave.persist.rehydrate();
  assert.equal(useSave.getState().companionId, null);
  assert.equal(useSave.getState().letters[ownLetter.id].completed, true);
  const { CompanionArt, CompanionHero, CompanionPicker } = await server.ssrLoadModule(
    "/src/components/game/Companion.tsx",
  );
  const { COMPANION_ART } = await server.ssrLoadModule("/src/game/companion-art.ts");
  const { CHARACTERS } = await server.ssrLoadModule("/src/game/data.ts");
  for (const c of CHARACTERS) {
    const markup = renderToStaticMarkup(createElement(CompanionArt, { id: c.id, name: c.name }));
    assert.ok(markup.includes("companion-image"), c.id);
    assert.ok(markup.includes(c.name), c.id);
  }
  const original = COMPANION_ART.qin.companionImage;
  COMPANION_ART.qin.companionImage = { avatar: "/avatar-test.webp" };
  assert.ok(
    renderToStaticMarkup(createElement(CompanionArt, { id: "qin", name: "嬴政" })).includes(
      "companion-image-avatar",
    ),
  );
  COMPANION_ART.qin.companionImage = {};
  assert.ok(
    renderToStaticMarkup(createElement(CompanionArt, { id: "qin", name: "嬴政" })).includes(
      "墨影待繪",
    ),
  );
  COMPANION_ART.qin.companionImage = original;
  const snapshot = useSave.getInitialState();
  const initial = { ...snapshot };
  const callbacks = { onLetters: () => {}, onCodex: () => {}, onSummon: () => {} };
  Object.assign(snapshot, { ...initial, owned: {} });
  assert.ok(renderToStaticMarkup(createElement(CompanionHero, callbacks)).includes("前往召喚"));
  Object.assign(snapshot, { ...initial, owned: { taishici: 1 }, companionId: null });
  assert.ok(renderToStaticMarkup(createElement(CompanionHero, callbacks)).includes("初次相伴"));
  Object.assign(snapshot, { ...initial, owned: { taishici: 1 }, companionId: "taishici" });
  const picker = renderToStaticMarkup(createElement(CompanionPicker, { onClose: () => {} }));
  assert.equal((picker.match(/<article/g) ?? []).length, 65);
  assert.ok(picker.includes("未擁有・李白"));
  assert.ok(picker.includes("目前陪伴・太史慈"));
  const home = renderToStaticMarkup(createElement(CompanionHero, callbacks));
  assert.ok(home.includes("太史慈"));
  assert.ok(home.includes("companion-letters"));
  Object.assign(snapshot, initial);
  console.log(
    "PASS: 65 React art renders, avatar and silhouette fallback, empty/guide/R companion home render. No browser or real player state used.",
  );
  const { toCloud } = await server.ssrLoadModule("/src/game/store.ts");
  useSave.getState().setCompanionId("qin");
  useSave.getState().applyCloud({ ...toCloud(useSave.getState()), owned: { taishici: 1 } });
  assert.equal(useSave.getState().companionId, null);
  console.log(
    "PASS: old v0/v3/v4 hydration, locked rejection, free R/SSR switching, reload persistence, guide, ledger and rewards, invalid ID and ownership-loss fail-safe. Real save untouched.",
  );
} finally {
  await server.close();
  delete globalThis.localStorage;
  delete globalThis.window;
}
