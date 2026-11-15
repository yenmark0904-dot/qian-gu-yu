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
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const page = await context.newPage();
const state = {
  ...base,
  volumeAwards: [1,2,3,4],
  coachSeen: 1,
  owned: { qin: 1, zhouyu: 1, sima: 1 },
  raid: { team: ["qin", "zhouyu", "sima"], records: {} },
  m3: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i + 1), { stars: 3, best: 3000 }])),
};
await context.addInitScript((s) => {
  if (!sessionStorage.getItem("seeded")) {
    localStorage.setItem("qiangu-yu", JSON.stringify({ version: 5, state: s }));
    sessionStorage.setItem("seeded", "1");
  }
  localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
}, state);
await page.goto(URL);
await page.waitForTimeout(2000);
await page.getByTestId("home-match").click();
await page.waitForTimeout(800);
await page.locator('[data-level="41"]').click();
await page.getByTestId("m3-intro").waitFor();
await page.getByTestId("m3-start").click();
await page.getByTestId("m3-hud").waitFor();
let vein = 0;
for (let i = 0; i < 24 && vein < 3; i++) {
  if (await page.getByTestId("m3-result").count()) break;
  await playMoves(page);
  await page.waitForFunction(() => document.querySelector('[data-testid="m3-board"]')?.getAttribute("data-phase") === "play" || document.querySelector('[data-testid="m3-result"]'), null, { timeout: 20000 });
  vein = await page.locator('[data-vein="1"]').count();
}
console.log("vein count", vein);
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/qgy-new/screenshots/ink-opaque-390.png" });
const box = await page.locator('[data-vein="1"]').first().boundingBox();
if (box) {
  const clip = {
    x: Math.max(0, box.x - 40),
    y: Math.max(0, box.y - 40),
    width: Math.min(390 - Math.max(0, box.x - 40), 220),
    height: Math.min(844 - Math.max(0, box.y - 40), 220),
  };
  await page.screenshot({ path: "/workspace/qgy-new/screenshots/ink-opaque-zoom.png", clip });
}
const info = await page.locator('[data-vein="1"]').first().evaluate((e) => {
  const before = getComputedStyle(e, "::before");
  return { after: getComputedStyle(e, "::after").content, bg: before.backgroundImage.slice(0, 120), opacity: before.opacity };
}).catch((e) => String(e));
console.log(JSON.stringify(info));
await browser.close();
