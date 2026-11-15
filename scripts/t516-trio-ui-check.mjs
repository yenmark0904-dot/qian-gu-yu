// t516 isolated headless UI check (local dev server only; never a user browser, never online data).
// T516_URL=http://127.0.0.1:8516/ node --experimental-strip-types scripts/t516-trio-ui-check.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { allMoves, boardFrom } from "../src/game/match3.ts";

const URL = process.env.T516_URL || "http://127.0.0.1:8516/";
const SHOTS = process.env.T516_SHOTS || "/workspace/qgy-combat-sim-t516/shots";
const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const today = new Date().toLocaleDateString("en-CA");
const TEAM = ["huo", "libai", "liuche"];
const stars = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { stars: 3, best: 3000 }]));
const base = { volumeAwards: [1, 2, 3], ink: 8000, totalPulls: 4, muted: true, lastDaily: today, coachSeen: 9, mainStoryPrologueRead: true, mainStoryRead: [1, 2, 3, 4, 5], mainStoryHanRead: [1,2,3,4,5,6,7,8,9,10], mainStoryWuRead: [1,2,3,4,5,6,7,8,9,10], mainStoryQiRead: [1,2,3,4,5,6,7,8,9,10], mainStoryTangRead: [1,2,3,4,5,6,7,8,9,10], owned: { huo: 1, libai: 1, liuche: 1 }, m3: stars, raid: { team: TEAM, records: {} } };

async function open(state) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  const blocked = [];
  // never let the check write anywhere: every server function / API call is refused locally
  await context.route(/\/_serverFn\/|\/api\//, (r) => { blocked.push(r.request().url().replace(/^https?:\/\/[^/]+/, "")); return r.abort(); });
  page.__blocked = blocked;
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addInitScript((s) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("qiangu-yu", JSON.stringify({ version: 4, state: s }));
      sessionStorage.setItem("seeded", "1");
    }
    localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
    // record every passive float as it appears (floats only live ~900 ms)
    window.__t516 = [];
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const t = n.textContent || ""; if (/少年驍騎|將進酒|帝王號令/.test(t) && t.length < 40) window.__t516.push(t); } }).observe(document, { childList: true, subtree: true });
  }, state);
  await page.goto(URL);
  await page.waitForTimeout(1500);
  return { context, page, errors };
}
const energies = (page) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => { const e = document.querySelector(`[data-testid="cb-member-${id}"]`); return [id, e ? { e: +e.dataset.energy, cost: +e.dataset.cost, uses: +e.dataset.uses } : null]; })), TEAM);
const floats = (page) => page.evaluate(() => window.__t516.splice(0));

async function play(page, max, { skills = true } = {}) {
  const log = [];
  let turns = 0, casts = 0;
  while (turns < max) {
    if (await page.locator('[data-testid="m3-result"]').count()) break;
    await page.waitForFunction(() => { const b = document.querySelector('[data-testid="m3-board"]'); return !b || b.getAttribute("data-phase") === "play" || b.getAttribute("data-phase") === "done"; }, null, { timeout: 30000 });
    if (await page.locator('[data-testid="m3-result"]').count()) break;
    const en = await energies(page);
    for (const id of TEAM) if (en[id]) assert.ok(en[id].e >= 0 && en[id].e <= en[id].cost, `${id} energy ${JSON.stringify(en[id])}`);
    const ready = page.locator('[data-testid="m3-skill"][data-full="1"]:not(:disabled)');
    if (skills && (await ready.count())) {
      await ready.first().click();
      casts++;
      await page.waitForTimeout(150);
      const cut = page.getByTestId("m3-cutin");
      if (await cut.count()) await cut.click().catch(() => {});
      await page.waitForTimeout(300);
      await page.waitForFunction(() => { const b = document.querySelector('[data-testid="m3-board"]'); return !b || b.getAttribute("data-phase") !== "busy"; }, null, { timeout: 30000 }).catch(() => {});
      log.push({ cast: casts, floats: await floats(page), en: await energies(page) });
      continue;
    }
    const cells = await page.locator(".m3-cell").evaluateAll((l) => l.map((e) => ({ r: +e.dataset.r, c: +e.dataset.c, kind: +e.dataset.kind, special: e.dataset.special, seal: +(e.dataset.sealed || 0) })));
    const grid = Array.from({ length: 8 }, () => Array(7).fill("0"));
    const seal = Array.from({ length: 8 }, () => Array(7).fill(0));
    const specials = [];
    for (const x of cells) { grid[x.r][x.c] = String(Math.max(0, x.kind)); seal[x.r][x.c] = x.seal; if (x.special) specials.push([x.r, x.c, x.special]); }
    const moves = allMoves(boardFrom(grid.map((r) => r.join("")), specials, seal));
    if (!moves.length) { await page.waitForTimeout(300); continue; }
    const [a, to] = moves[0];
    const box = await page.getByTestId("m3-board").boundingBox();
    const at = (p) => ({ x: box.x + ((p.c + 0.5) * box.width) / 7, y: box.y + ((p.r + 0.5) * box.height) / 8 });
    const p1 = at(a), p2 = at(to);
    await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 4 }); await page.mouse.up();
    turns++;
    await page.waitForTimeout(120);
    await page.waitForFunction(() => { const b = document.querySelector('[data-testid="m3-board"]'); return !b || b.getAttribute("data-phase") !== "busy"; }, null, { timeout: 30000 }).catch(() => {});
    const hp = await page.evaluate(() => document.querySelector('[aria-valuenow]')?.getAttribute("aria-valuenow"));
    log.push({ turn: turns, hp, floats: await floats(page), en: await energies(page) });
  }
  return { turns, casts, log };
}
const count = (log, re) => log.flatMap((l) => l.floats).filter((t) => re.test(t)).length;

const report = [];
try {
  // 主線: one fight, then 再戰 (restart) — passives must start over
  const { context, page, errors } = await open(base);
  await page.getByTestId("home-match").click();
  await page.waitForTimeout(600);
  await page.locator('[data-level="11"]').click();
  await page.getByTestId("m3-intro").waitFor();
  await page.getByTestId("m3-start").click();
  await page.waitForTimeout(500);
  assert.equal(await page.getByTestId("cb-team").getAttribute("data-size"), "3");
  const names = await page.evaluate(() => document.body.innerText.match(/疾鋒破陣|醉月吟|漢闕天威|封狼居胥|斗酒詩百篇/g));
  const r1 = await play(page, 60);
  const saveBefore = JSON.parse(await page.evaluate(() => localStorage.getItem("qiangu-yu"))).state;
  await page.screenshot({ path: `${SHOTS}/main-fight1.png` });
  const huo1 = count(r1.log, /少年驍騎/), li1 = count(r1.log, /將進酒/), liu1 = count(r1.log, /帝王號令/);
  // first 少年驍騎 must appear on the 3rd successful hand (all hands in this bot clear)
  const firstHuo = r1.log.find((l) => l.floats.some((t) => /少年驍騎/.test(t)));
  report.push({ case: "主線11 detail", log: r1.log.filter((l) => l.cast || l.floats.length) });
  report.push({ case: "主線11 fight 1", turns: r1.turns, casts: r1.casts, huo: huo1, li: li1, liu: liu1, firstHuoAt: firstHuo?.turn ?? null, names, result: await page.getByTestId("m3-result").count() ? await page.getByTestId("m3-result").getAttribute("data-won") : "running" });
  assert.ok(huo1 >= 1 && huo1 <= 3, `huo floats ${huo1}`);
  assert.ok(li1 <= 2, `li floats ${li1}`);
  // restart
  if (await page.getByTestId("m3-result").count()) {
    await page.getByRole("button", { name: "再戰" }).click();
    await page.getByTestId("m3-start").click();
    await page.waitForTimeout(500);
    const en0 = await energies(page);
    for (const id of TEAM) assert.equal(en0[id].e, 0, "fresh energy on restart");
    const r2 = await play(page, 4, { skills: false });
    const h2 = r2.log.find((l) => l.floats.some((t) => /少年驍騎/.test(t)));
    report.push({ case: "主線11 restart", turns: r2.turns, firstHuoAt: h2?.turn ?? null, energies: en0 });
    assert.ok(!h2 || h2.turn === 3, "counter restarted (first 少年驍騎 on hand 3 again)");
  }
  report.push({ case: "主線 save keys", m3_11: saveBefore.m3?.["11"], blocked: page.__blocked.length, ink: saveBefore.ink });
  assert.deepEqual(errors, []);
  await context.close();

  // 鎮厄司
  {
    const { context, page, errors } = await open(base);
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(700);
    await page.getByTestId("raid-entry").click();
    await page.getByTestId("raid-lobby").waitFor();
    await page.getByTestId("raid-start").click();
    await page.waitForTimeout(800);
    if (await page.getByTestId("m3-start").count()) await page.getByTestId("m3-start").click();
    await page.waitForTimeout(500);
    const board = await page.getByTestId("m3-board").count();
    const r = board ? await play(page, 60) : { turns: 0, casts: 0, log: [] };
    await page.screenshot({ path: `${SHOTS}/raid-fight.png` });
    report.push({ case: "鎮厄司", board, turns: r.turns, casts: r.casts, huo: count(r.log, /少年驍騎/), li: count(r.log, /將進酒/), liu: count(r.log, /帝王號令/), resultSeen: await page.locator('[data-testid="m3-result"], [data-testid="raid-result"]').count() });
    report.push({ case: "鎮厄司 detail", log: r.log.filter((l) => l.cast || l.floats.length) });
    assert.deepEqual(errors, []);
    await context.close();
  }
  // 深宮
  {
    const { context, page, errors } = await open(base);
    await page.getByRole("button", { name: "深宮榜" }).click().catch(async () => page.getByText("深宮榜").first().click());
    await page.getByTestId("sg-play").waitFor({ timeout: 10000 });
    await page.getByTestId("sg-play").click();
    await page.waitForTimeout(600);
    if (await page.getByTestId("m3-start").count()) await page.getByTestId("m3-start").click();
    await page.waitForTimeout(500);
    const r = await play(page, 60);
    await page.screenshot({ path: `${SHOTS}/tower-fight.png` });
    report.push({ case: "深宮", turns: r.turns, casts: r.casts, huo: count(r.log, /少年驍騎/), li: count(r.log, /將進酒/), liu: count(r.log, /帝王號令/), result: (await page.getByTestId("m3-result").count()) ? await page.getByTestId("m3-result").getAttribute("data-won") : "running", blocked: page.__blocked.length });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
}
