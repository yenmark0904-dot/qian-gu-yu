import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { allMoves, boardFrom } from "../src/game/match3.ts";

const URL = process.env.COMBAT_TEST_URL || "http://127.0.0.1:8092/";
const today = new Date().toLocaleDateString("en-CA");
const base = {
  ink: 8000, totalPulls: 4, muted: true, lastDaily: today,
  mainStoryPrologueRead: true,
  mainStoryRead: [1,2,3,4,5],
  mainStoryHanRead: [1,2,3,4,5,6,7,8,9,10],
  mainStoryWuRead: [1,2,3,4,5,6,7,8,9,10],
  mainStoryQiRead: [1,2,3,4,5,6,7,8,9,10],
  mainStoryTangRead: [1,2,3,4,5,6,7,8,9,10],
};

async function playMoves(page) {
  if (await page.locator('[data-testid="m3-result"], [data-testid="story-event-result"]').count()) return;
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-testid="m3-board"]');
    return !b || b.getAttribute("data-phase") === "play" || b.getAttribute("data-phase") === "done";
  }, null, { timeout: 20000 });
  if (await page.locator('[data-testid="m3-result"], [data-testid="story-event-result"]').count()) return;
  const cells = await page.locator(".m3-cell").evaluateAll((l) => l.map((e) => ({ r: +e.dataset.r, c: +e.dataset.c, kind: +e.dataset.kind, special: e.dataset.special, seal: +(e.dataset.sealed || 0) })));
  const grid = Array.from({ length: 8 }, () => Array(7).fill("0"));
  const seal = Array.from({ length: 8 }, () => Array(7).fill(0));
  const specials = [];
  for (const x of cells) {
    grid[x.r][x.c] = String(Math.max(0, x.kind));
    seal[x.r][x.c] = x.seal;
    if (x.special) specials.push([x.r, x.c, x.special]);
  }
  const b = boardFrom(grid.map((r) => r.join("")), specials, seal);
  const moves = allMoves(b);
  if (!moves.length) { await page.waitForTimeout(300); return; }
  const [a, to] = moves[0];
  const box = await page.getByTestId("m3-board").boundingBox();
  const at = (p) => ({ x: box.x + ((p.c + 0.5) * box.width) / 7, y: box.y + ((p.r + 0.5) * box.height) / 8 });
  const p1 = at(a), p2 = at(to);
  await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(120);
}

await mkdir("/workspace/qgy-new/screenshots", { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
const page = await context.newPage();
const state = {
  ...base,
  volumeAwards: [1,2,3,4],
  coachSeen: 1,
  owned: { qin: 1, zhouyu: 1, sima: 1 },
  raid: { team: ["qin", "zhouyu", "sima"], records: {} },
  artifacts: {
    instances: [
      { uid: "a1", eid: "liuhe-xuanxi", level: 1, equippedBy: "qin", locked: false },
      { uid: "a2", eid: "tongque-xiaoling", level: 9, equippedBy: null, locked: false },
    ],
    materials: { jingmosha: 30, zhenejing: 10, tianmingcanyin: 2, suyuanlu: 0 },
    grants: ["vault-gift"], serial: 3,
  },
  m3: Object.fromEntries(Array.from({ length: 41 }, (_, i) => [String(i + 1), { stars: 3, best: 3000 }])),
};
await context.addInitScript((s) => {
  if (!sessionStorage.getItem("seeded")) {
    localStorage.setItem("qiangu-yu", JSON.stringify({ version: 5, state: s }));
    sessionStorage.setItem("seeded", "1");
  }
}, state);
const S = "/workspace/qgy-new/screenshots/";
await context.addInitScript(() => { localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true })); });
await page.goto(URL);
await page.waitForTimeout(2500);
const home = async () => { await page.goto(URL); await page.waitForTimeout(1500); };
// --- refine
await page.getByTestId("home-artifacts").click();
await page.getByRole("button", { name: "命器淬鍊" }).click();
await page.getByTestId("mq-refine").waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: S + "refine-before.png", fullPage: true });
await page.getByTestId("mq-refine-go").click();
await page.getByTestId("mq-refine-confirm").waitFor();
await page.screenshot({ path: S + "refine-confirm.png", fullPage: true });
await page.getByTestId("mq-refine-yes").click();
await page.waitForTimeout(800);
await page.screenshot({ path: S + "refine-after.png", fullPage: true });
console.log("after level", await page.getByTestId("mq-refine-card").getAttribute("data-level"), await page.getByTestId("mq-refine-msg").textContent().catch(() => ""));
await page.getByTestId("mq-refine-pick").selectOption("a2");
await page.waitForTimeout(400);
console.log("a2 block", await page.getByTestId("mq-refine-block").getAttribute("data-reason").catch(() => "none"));
await page.screenshot({ path: S + "refine-awaken-locked.png", fullPage: true });
// --- quest
await home();
await page.getByTestId("home-quest").click();
await page.getByTestId("quest-book").waitFor();
await page.waitForTimeout(500);
const eq = page.getByTestId("qb-daily-equip");
console.log("equip quest:", (await eq.textContent()).replace(/\s+/g, " "));
await eq.scrollIntoViewIfNeeded();
await page.screenshot({ path: S + "quest-refine.png" });
// --- raid
await home();
await page.getByTestId("home-raid").click();
await page.getByTestId("raid-tiers").waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: S + "raid-tiers.png", fullPage: true });
for (const t of ["normal", "elite", "sovereign"]) console.log(t, await page.getByTestId("raid-tier-" + t).getAttribute("data-open"), (await page.getByTestId("raid-tier-" + t).textContent()).replace(/\s+/g, " ").slice(0, 160));
await page.getByTestId("raid-start-normal").click();
await page.getByTestId("raid-drop-preview").waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: S + "raid-drop-preview.png" });
console.log("preview:", (await page.getByTestId("raid-drop-preview").textContent()).replace(/\s+/g, " "));
// --- ink
await home();
await page.getByTestId("home-match").click();
await page.waitForTimeout(800);
await page.locator('[data-level="41"]').click();
await page.getByTestId("m3-intro").waitFor();
await page.getByTestId("m3-start").click();
await page.getByTestId("m3-hud").waitFor();
let vein = 0;
for (let i = 0; i < 30 && vein < 4; i++) {
  if (await page.getByTestId("m3-result").count()) break;
  await playMoves(page);
  await page.waitForFunction(() => document.querySelector('[data-testid="m3-board"]')?.getAttribute("data-phase") === "play" || document.querySelector('[data-testid="m3-result"]'), null, { timeout: 20000 });
  vein = await page.locator('[data-vein="1"]').count();
}
console.log("vein count", vein);
await page.waitForTimeout(1200);
await page.screenshot({ path: S + "ink-smoke-390.png" });
const bb = await page.getByTestId("m3-board").boundingBox();
const cz = await context.newPage(); await cz.close();
await page.screenshot({ path: S + "ink-smoke-zoom-raw.png", clip: bb }); // upscaled 2x to ink-smoke-zoom.png with PIL
await browser.close();
