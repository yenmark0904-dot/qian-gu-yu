// DOM-free React rendering audit. This is not a browser/visual screenshot test.
import { createServer } from "vite";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
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
  const { ArtifactSummon } = await server.ssrLoadModule("/src/components/game/ArtifactSummon.tsx");
  const { ArtifactRefine } = await server.ssrLoadModule("/src/components/game/ArtifactRefine.tsx");
  const { Opening, Performance } = await server.ssrLoadModule(
    "/src/components/game/SummonStage.tsx",
  );
  const { ARTIFACTS, artifactImage } = await server.ssrLoadModule("/src/game/artifacts.ts");
  const { CHARACTERS } = await server.ssrLoadModule("/src/game/data.ts");
  const { demoCard } = await server.ssrLoadModule("/src/game/summon-reveal.ts");
  const html = renderToStaticMarkup(React.createElement(ArtifactSummon));
  for (const expected of [
    "命器召喚",
    "150",
    "1,350",
    "機率公告",
    "召喚紀錄",
    "命器定向",
    "SSR 1%",
    "SS 2%",
    "S 48.5%",
    "R 48.5%",
    "赤壁古琴",
  ])
    assert.ok(html.includes(expected), expected);
  for (const rarity of ["R", "S", "SS", "SSR"]) {
    const artifact = ARTIFACTS.find((a) => a.rarity === rarity);
    const result = renderToStaticMarkup(
      React.createElement(Performance, {
        artifact: { def: artifact, isNew: true },
        withDrop: true,
        lite: false,
        skipSignal: 0,
        footer: "繼續",
      }),
    );
    assert.ok(result.includes(artifact.name));
    assert.ok(result.includes(artifactImage(artifact)));
    assert.ok(!result.includes("/portraits/"));
    assert.ok(result.includes("pg-door pg-left"));
    assert.ok(result.includes("pg-door pg-right"));
    assert.ok(result.includes(`data-rarity="${rarity}"`));
    const character = CHARACTERS.find((c) => c.rarity === rarity);
    const original = renderToStaticMarkup(
      React.createElement(Performance, {
        card: demoCard(character, 0),
        withDrop: true,
        lite: false,
        skipSignal: 0,
        footer: "繼續",
      }),
    );
    assert.ok(original.includes(character.name));
    assert.ok(original.includes(`sm-art-${rarity}`));
    assert.ok(original.includes("墨跡未乾"));
    assert.ok(!original.includes("/artifacts/placeholder.svg"));
  }
  const opening = renderToStaticMarkup(React.createElement(Opening, { onTap() {}, auto: false }));
  assert.ok(opening.includes("牽緣"));
  assert.ok(opening.includes("輕觸墨痕"));
  assert.ok(opening.includes("一筆牽緣"));
  for (const forbidden of ['type="file"', "此為演出展示", "展示模式", "展示稀有度", "重新準備"])
    assert.ok(!html.includes(forbidden) && !opening.includes(forbidden));
  const refine = renderToStaticMarkup(React.createElement(ArtifactRefine, { initialMaterialsOpen: true, onAcquire() {}, onSummon() {} }));
  for (const material of ["淨墨砂", "鎮厄晶", "天命殘印", "溯緣露"])
    assert.ok(refine.includes(material));
  console.log(
    "artifact-summon-render-test: PASS — UI rates/wish/history, 4 rarity artifact and character shared gate rendering, own-image separation, no demo controls, refinement material inventory",
  );
} finally {
  await server.close();
}
