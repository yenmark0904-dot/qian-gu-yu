// DOM-free Codex audit using an isolated in-memory profile; no browser or real save changes.
import { createServer } from "vite";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage };
const server = await createServer({
  configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  plugins: [{
    name: "codex-isolated-render-profile", enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/components/game/Codex.tsx")) return;
      return code
        .replace('import { useSave } from "@/game/store";', 'const useSave = Object.assign((selector: (s: any) => any) => selector((globalThis as any).__cgTestSave), { getState: () => (globalThis as any).__cgTestSave });')
        .replace('useState<number | null>(null);', 'useState<number | null>((globalThis as any).__cgTestChapter);')
        .replace('const [endingCgFor, setEndingCgFor] = useState<number | null>(null);', 'const [endingCgFor, setEndingCgFor] = useState<number | null>((globalThis as any).__cgTestEnding);');
    },
  }],
  server: { middlewareMode: true, hmr: false }, appType: "custom",
});
try {
  const { Codex } = await server.ssrLoadModule("/src/components/game/Codex.tsx");
  const { CHARACTERS } = await server.ssrLoadModule("/src/game/data.ts");
  function render(c, copies, chapter = null, ending = null) {
    globalThis.__cgTestSave = { owned: { [c.id]: copies }, skins: {}, assist: null, muted: true, setSkin() {}, setAssist() {}, questEvent() {} };
    globalThis.__cgTestChapter = chapter;
    globalThis.__cgTestEnding = ending;
    return renderToStaticMarkup(React.createElement(Codex, { focusId: c.id, onReplay() {} }));
  }
  for (const rarity of ["R", "S", "SS", "SSR"]) {
    const c = CHARACTERS.find((c) => c.rarity === rarity);
    const eligible = rarity === "SS" || rarity === "SSR";
    for (const copies of [0, 1, 11, 21, 30, 31]) {
      const html = render(c, copies);
      assert.equal(html.includes('data-testid="codex-cg"'), eligible, `${rarity} CG section`);
      if (eligible && copies < 31) {
        assert.ok(html.includes('cg-locked'), `${rarity} locked at ${copies}`);
        assert.ok(!html.includes('/cg/'), `${rarity} must not leak CG files before full bond`);
      }
      if (rarity === "SS" && copies === 31) {
        assert.ok(html.includes('CG 準備中'));
        assert.ok(!html.includes('/cg/'));
      }
      if (rarity === "SSR" && copies === 31) assert.ok(html.includes(`src="/cg/${c.id}.jpg"`));
    }
  }
  for (const c of CHARACTERS.filter((c) => c.rarity === "SSR")) {
    for (const chapter of [0, 1, 2]) assert.ok(!render(c, 31, chapter).includes('data-testid="story-cg-ending"'), `${c.id} early chapter ${chapter}`);
    assert.ok(!render(c, 30, 3).includes('data-testid="story-cg-ending"'));
    const last = render(c, 31, 3);
    assert.ok(last.includes('data-testid="story-cg-reveal"'), `${c.id} final chapter reveal`);
    assert.ok(!last.includes('data-testid="story-cg-image"'));
    const finished = render(c, 31, 3, 3);
    assert.ok(finished.includes('data-testid="story-cg-image"'));
    assert.ok(finished.indexOf('tale-text') < finished.indexOf('data-testid="story-cg-image"'));
  }
  for (const c of CHARACTERS.filter((c) => c.rarity === "SS")) assert.ok(!render(c, 31, 2).includes('data-testid="story-cg-ending"'), `${c.id} tier-four ending has no CG`);
  console.log("cg-render-test: PASS — rarity restrictions, locked image non-leak, SS preparation slot, all five SSR tier-six endings after reading, no tier-zero/two/four reveal; isolated memory only");
} finally {
  await server.close();
}
