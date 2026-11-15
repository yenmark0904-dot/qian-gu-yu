// Isolated headless UI check for the combat overhaul (never touches a user browser session).
// COMBAT_TEST_URL=http://127.0.0.1:8097/ node --experimental-strip-types scripts/combat-ui-test.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { allMoves, boardFrom } from "../src/game/match3.ts";

const URL = process.env.COMBAT_TEST_URL || "http://127.0.0.1:8080/";
const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
await mkdir("screenshots", { recursive: true });
const report = [];
const today = new Date().toLocaleDateString("en-CA");
const base = { ink: 8000, totalPulls: 4, muted: true, lastDaily: today, mainStoryPrologueRead: true, mainStoryRead: [1, 2, 3, 4, 5], mainStoryHanRead: [1,2,3,4,5,6,7,8,9,10], mainStoryWuRead: [1,2,3,4,5,6,7,8,9,10], mainStoryQiRead: [1,2,3,4,5,6,7,8,9,10], mainStoryTangRead: [1,2,3,4,5,6,7,8,9,10] };

async function open(state, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => { errors.push(e.message); if (process.env.DEBUG_MOVES) console.log("PAGEERROR", e.message, e.stack); });
  page.on("console", (m) => { if (process.env.DEBUG_MOVES && m.type() === "error") console.log("CONSOLE", m.text()); });
  await context.addInitScript((s) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("qiangu-yu", JSON.stringify({ version: 4, state: s }));
      sessionStorage.setItem("seeded", "1");
    }
    localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
  }, state);
  await page.goto(URL);
  await page.waitForTimeout(1500);
  return { context, page, errors };
}
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("qiangu-yu")).state);

/** Portrait order: big 墨厄 → 三人戰隊 → full-width board → compact 破關條件 at the bottom. */
async function layoutOf(page) {
  return page.evaluate(() => {
    const r = (id) => { const e = document.querySelector(`[data-testid="${id}"]`); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, width: b.width, height: b.height, hidden: getComputedStyle(e).display === "none" }; };
    return { enemy: r("cb-enemy"), art: r("cb-enemy-art"), team: r("cb-team"), board: r("m3-board"), hud: r("m3-hud"), w: innerWidth, h: innerHeight, doc: document.documentElement.scrollWidth };
  });
}
function assertOrder(L, { minBoard, minArt }) {
  const s = JSON.stringify(L);
  assert.ok(L.enemy.bottom <= L.team.top + 1, `team under 墨厄 ${s}`);
  assert.ok(L.team.bottom <= L.board.top + 1, `board under team ${s}`);
  if (!L.hud.hidden) {
    assert.ok(L.board.bottom <= L.hud.top + 1, `破關條件 under board ${s}`);
    assert.ok(L.hud.height <= 40, `破關條件 compact ${s}`);
    assert.ok(L.hud.bottom <= L.h + 1, `破關條件 on screen ${s}`);
  } else assert.ok(L.board.bottom <= L.h + 1, `board on screen ${s}`);
  assert.ok(L.board.width >= minBoard, `board wide ${s}`);
  assert.ok(L.art.height >= minArt, `墨厄 art large ${s}`);
  assert.ok(L.doc <= L.w, `no sideways scroll ${s}`);
}

async function playMoves(page, max = 40, { skills = true } = {}) {
  let turns = 0, casts = 0;
  const hp0 = Number(await page.getByTestId("cb-enemy").getAttribute("data-hp"));
  while (turns < max) {
    if (await page.locator('[data-testid="m3-result"], [data-testid="story-event-result"]').count()) break;
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-testid="m3-board"]');
      return !b || b.getAttribute("data-phase") === "play" || b.getAttribute("data-phase") === "done";
    }, null, { timeout: 20000 });
    if (await page.locator('[data-testid="m3-result"], [data-testid="story-event-result"]').count()) break;
    const ready = page.locator('[data-testid="m3-skill"][data-full="1"]:not(:disabled)');
    if (skills && (await ready.count())) {
      await ready.first().click();
      casts++;
      await page.waitForTimeout(150);
      const cut = page.getByTestId("m3-cutin");
      if (await cut.count()) await cut.click().catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }
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
    if (!moves.length) { await page.waitForTimeout(300); continue; }
    const [a, to] = moves[0];
    const box = await page.getByTestId("m3-board").boundingBox();
    const at = (p) => ({ x: box.x + ((p.c + 0.5) * box.width) / 7, y: box.y + ((p.r + 0.5) * box.height) / 8 });
    const p1 = at(a), p2 = at(to);
    await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 4 }); await page.mouse.up();
    turns++;
    await page.waitForTimeout(120);
    if (process.env.DEBUG_MOVES) console.log("move", await page.evaluate(() => document.querySelector('[data-moves]')?.getAttribute("data-moves")), await page.locator(".jade-picked").count(), JSON.stringify([a, to]), await page.locator(".m3-note").innerText(), await page.getByTestId("m3-board").getAttribute("data-phase"));
  }
  const hp1 = Number(await page.getByTestId("cb-enemy").getAttribute("data-hp"));
  return { turns, casts, hp0, hp1 };
}

try {
  if (!process.env.ONLY_H) {
  // A) old save with stars + 3-assist team meets the new UI: coach once, combat works, stars kept
  {
    const { context, page, errors } = await open({ ...base, owned: { qin: 3, zhouyu: 2, sima: 1, machao: 1 }, m3: { "1": { stars: 3, best: 2600 }, "2": { stars: 2, best: 1900 } }, raid: { team: ["qin", "zhouyu", "sima"], records: {} } });
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(600);
    await page.locator('[data-level="3"]').click();
    await page.getByTestId("m3-intro").waitFor();
    assert.equal(await page.getByTestId("cb-preview").count(), 1);
    assert.equal(await page.getByTestId("cb-team-slot").getAttribute("data-size"), "3");
    assert.ok((await page.getByTestId("m3-intro").innerText()).includes("金鑲玉"), "level 3 keeps its teaching tip");
    await page.screenshot({ path: "screenshots/combat-intro-390.png" });
    await page.getByTestId("m3-start").click();
    await page.getByTestId("coach").waitFor({ timeout: 5000 });
    const steps = [];
    await page.screenshot({ path: "screenshots/combat-coach-1.png" });
    for (let i = 0; i < 8 && (await page.getByTestId("coach").count()); i++) {
      steps.push(await page.getByTestId("coach").getAttribute("data-step"));
      if (i === 1) await page.screenshot({ path: "screenshots/combat-coach-2.png" });
      if (i === 3) await page.screenshot({ path: "screenshots/combat-coach-4.png" });
      await page.getByTestId("coach-next").click();
      await page.waitForTimeout(150);
    }
    assert.deepEqual(steps, ["swap", "damage", "team", "skill", "combo", "enemy-turn", "hp"]);
    assert.equal((await saved(page)).coachSeen, 1);
    assert.equal(await page.getByTestId("cb-team").getAttribute("data-size"), "3");
    await page.screenshot({ path: "screenshots/combat-battle-390.png" });
    const L390 = await layoutOf(page);
    assertOrder(L390, { minBoard: 370, minArt: 150 });
    report.push({ case: "A layout 390x844", board: Math.round(L390.board.width), art: Math.round(L390.art.height), hud: Math.round(L390.hud.height) });
    const r = await playMoves(page, 70);
    await page.screenshot({ path: "screenshots/combat-after-play.png" });
    console.log("A play", JSON.stringify(r), await page.getByTestId("m3-board").getAttribute("data-phase"));
    assert.ok(r.hp1 < r.hp0, `enemy took damage ${JSON.stringify(r)}`);
    await page.getByTestId("m3-result").waitFor({ timeout: 20000 });
    await page.screenshot({ path: "screenshots/combat-result-390.png" });
    assert.equal(await page.getByTestId("m3-purge").count(), 1);
    const wonA = await page.getByTestId("m3-result").getAttribute("data-won");
    assert.equal(await page.getByTestId("m3-purge").getAttribute("data-purged"), wonA, "won ⇔ 破厄 (t436u)");
    const st = await saved(page);
    assert.equal(st.m3["1"].stars, 3, "old stars preserved");
    assert.equal(st.m3["2"].stars, 2);
    // replay a cleared stage: no coach again
    await page.getByRole("button", { name: "再戰" }).click();
    await page.getByTestId("m3-start").click();
    await page.waitForTimeout(900);
    assert.equal(await page.getByTestId("coach").count(), 0, "coach only once");
    report.push({ case: "A old save + 3 team", steps, ...r, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  if (process.env.ONLY_A) { console.log(JSON.stringify(report)); process.exit(0); }
  // B) brand-new style save with NO 編隊: the fight auto-fills a 三人戰隊 (never a lone assist); skip button works
  {
    const { context, page, errors } = await open({ ...base, owned: { machao: 1, qin: 1, zhouyu: 2 }, m3: { "1": { stars: 1, best: 1100 } } });
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(600);
    await page.locator('[data-level="2"]').click();
    await page.getByTestId("m3-intro").waitFor();
    assert.ok((await page.getByTestId("m3-intro").innerText()).includes("線玉"));
    await page.getByTestId("m3-start").click();
    await page.getByTestId("coach").waitFor({ timeout: 5000 });
    await page.getByTestId("coach-skip").click();
    assert.equal(await page.getByTestId("coach").count(), 0);
    assert.equal((await saved(page)).coachSeen, 1);
    assert.equal(await page.getByTestId("m3-dock").count(), 0, "no single-assist dock any more");
    assert.equal(await page.getByTestId("cb-team").getAttribute("data-size"), "3", "empty 編隊 auto-filled to three");
    const autoSaved = (await saved(page)).raid.team;
    assert.equal(autoSaved.length, 3, "auto team saved at fight start");
    assert.ok(autoSaved.includes("qin") && autoSaved.includes("zhouyu") && autoSaved.includes("machao"), JSON.stringify(autoSaved));
    const r = await playMoves(page, 30);
    report.push({ case: "B auto-filled team L2", autoSaved, ...r, errors });
    assert.deepEqual(errors, []);
    await page.screenshot({ path: "screenshots/combat-autoteam-390.png" });
    await context.close();
  }
  // C) story 《一盞留燈》 event from the end of Qin 卷四
  {
    const { context, page, errors } = await open({ ...base, volumeAwards: [1, 2, 3], coachSeen: 1, owned: { qin: 1, zhouyu: 1 }, m3: Object.fromEntries(Array.from({ length: 35 }, (_, i) => [String(i + 1), { stars: 3, best: 3000 }])), raid: { team: ["qin", "zhouyu"], records: {} }, mainStoryQinPlay: { volume: 4, beat: 122, positions: { "4": 122 }, finished: {}, choices: {} } });
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(600);
    await page.getByRole("tab", { name: "故事" }).click();
    await page.waitForTimeout(300);
    await page.getByTestId("main-story-btn-4").click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "screenshots/story-debug.png" });
    await page.getByTestId("story-event-card").waitFor({ timeout: 8000 });
    assert.ok((await page.getByTestId("story-event-card").innerText()).includes("長明之約"));
    await page.screenshot({ path: "screenshots/story-event-card-390.png" });
    await page.getByTestId("story-event-enter").click();
    await page.getByTestId("story-event-intro").waitFor();
    assert.ok((await page.getByTestId("story-event-intro").innerText()).includes("一盞留燈"));
    await page.screenshot({ path: "screenshots/story-event-intro-390.png" });
    await page.getByTestId("m3-start").click();
    await page.getByTestId("cb-lamp").waitFor();
    assert.equal(await page.getByTestId("story-hold").count(), 0, "no survival-win counter any more");
    assert.equal(await page.getByTestId("m3-hud").getAttribute("data-maxhp") !== null, true);
    await page.screenshot({ path: "screenshots/story-event-battle-390.png" });
    const r = await playMoves(page, 80);
    await page.getByTestId("story-event-result").waitFor({ timeout: 20000 });
    const won = await page.getByTestId("story-event-result").getAttribute("data-won");
    if (won === "1") assert.equal(Number(await page.getByTestId("cb-enemy").getAttribute("data-hp")), 0, "story wins only by 破厄");
    await page.screenshot({ path: "screenshots/story-event-result-390.png" });
    const st = await saved(page);
    assert.equal(st.storyEvents["qin-4-lamp"].tries, 1);
    assert.equal(st.storyEvents["qin-4-lamp"].cleared, won === "1");
    assert.equal(st.ink, 8000, "story event pays no 墨玉");
    await page.getByTestId("story-event-leave").click();
    await page.getByTestId("main-story-close").waitFor();
    report.push({ case: "C story lamp", won, ...r, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  // D) 深宮 floor uses the same engine (small viewport)
  {
    const { context, page, errors } = await open({ ...base, coachSeen: 1, owned: { qin: 1, zhouyu: 1, sima: 1 }, m3: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i + 1), { stars: 3, best: 3000 }])), raid: { team: ["qin", "zhouyu", "sima"], records: {} } }, { width: 375, height: 667 });
    await page.getByTestId("nav-shengong").first().click();
    await page.getByTestId("sg-play").click();
    await page.getByTestId("m3-intro").waitFor();
    assert.equal(await page.getByTestId("cb-preview").count(), 1);
    await page.getByTestId("m3-start").click();
    await page.getByTestId("cb-enemy").waitFor();
    const enemyId = await page.getByTestId("cb-enemy").getAttribute("data-enemy");
    assert.ok(enemyId.startsWith("sg-"), enemyId);
    await page.screenshot({ path: "screenshots/combat-shengong-375.png" });
    const layout = await layoutOf(page);
    assertOrder(layout, { minBoard: 280, minArt: 85 });
    const r = await playMoves(page, 4);
    assert.ok(r.hp1 < r.hp0);
    assert.deepEqual(errors, []);
    report.push({ case: "D shengong", enemyId, layout, ...r });
    await context.close();
  }
  // E) 自動配對 on the intro card and in the 編隊 picker: pin first, three seats, saved
  {
    const { context, page, errors } = await open({ ...base, coachSeen: 1, assist: "machao", owned: { machao: 1, qin: 3, zhouyu: 2, sima: 1 }, raid: { team: ["sima"], records: {} } });
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(600);
    await page.locator('[data-level="1"]').click();
    await page.getByTestId("m3-intro").waitFor();
    assert.equal(await page.getByTestId("m3-assist").count(), 0, "no single 助陣 block on the intro");
    assert.equal(await page.getByTestId("cb-team-slot").getAttribute("data-size"), "3", "a 1-person 編隊 shows topped up to three");
    await page.getByTestId("cb-team-auto").click();
    await page.waitForTimeout(200);
    const team = (await saved(page)).raid.team;
    assert.equal(team.length, 3);
    assert.equal(team[0], "machao", "固定助陣 sits first");
    await page.getByTestId("cb-team-edit").click();
    await page.getByTestId("cb-team-clear").click();
    assert.equal((await saved(page)).raid.team.length, 0);
    await page.getByTestId("cb-team-auto-pick").click();
    await page.waitForTimeout(200);
    assert.deepEqual((await saved(page)).raid.team, team, "picker 自動配對 gives the same team");
    await page.getByTestId("cb-team-done").click();
    await page.getByTestId("m3-start").click();
    await page.getByTestId("cb-team").waitFor();
    assert.equal(await page.getByTestId("cb-team").getAttribute("data-size"), "3");
    const L = await layoutOf(page);
    assertOrder(L, { minBoard: 370, minArt: 150 });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="cb-team"] img')].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshots/combat-layout-390.png" });
    report.push({ case: "E auto pair", team, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  // F) short phone (360x640) still fits; wide board; story 燈火 row lives in the 墨厄 panel
  {
    const { context, page, errors } = await open({ ...base, coachSeen: 1, owned: { qin: 1, zhouyu: 1, sima: 1 } }, { width: 360, height: 640 });
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(600);
    await page.locator('[data-level="1"]').click();
    await page.getByTestId("m3-start").click();
    await page.getByTestId("cb-team").waitFor();
    const L = await layoutOf(page);
    assertOrder(L, { minBoard: 270, minArt: 80 });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="cb-team"] img')].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshots/combat-layout-360x640.png" });
    report.push({ case: "F 360x640", board: Math.round(L.board.width), art: Math.round(L.art.height) });
    assert.deepEqual(errors, []);
    await context.close();
  }
  // G) 氣血 replaces 步: HP pill, 青玉璧 on the board, 墨厄 hits the HP, the jade heals
  {
    const { context, page, errors } = await open({ ...base, coachSeen: 1, owned: { qin: 1, zhouyu: 1, sima: 1 }, raid: { team: ["qin", "zhouyu", "sima"], records: {} } });
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(600);
    await page.locator('[data-level="1"]').click();
    const intro = await page.getByTestId("m3-intro").innerText();
    assert.ok(intro.includes("氣血 1000"), intro);
    assert.ok(intro.includes("過關條件：打倒"), "clear condition is 打倒墨厄");
    assert.ok(!intro.includes("得分達"), "no old score goal on the intro");
    assert.ok(intro.includes("青玉璧"), "intro explains the heal jade");
    await page.getByTestId("m3-start").click();
    await page.getByTestId("m3-hud").waitFor();
    assert.equal(await page.getByTestId("m3-hp").count(), 0, "t439u: no HP pill in the top-right");
    assert.equal(await page.getByTestId("m3-head-spacer").count(), 1);
    const hpEl = page.getByTestId("m3-hud");
    assert.equal(await hpEl.getAttribute("data-maxhp"), "1000");
    assert.equal(await hpEl.getAttribute("data-hp"), "1000");
    assert.equal(await page.locator("[data-moves]").count(), 0, "no 步 counter left");
    const hud = page.getByTestId("m3-hud");
    assert.equal(await hud.getAttribute("data-maxhp"), "1000", "bottom bar is the player's 氣血");
    assert.ok((await hud.innerText()).includes("氣血"));
    assert.ok((await hud.innerText()).includes("1000/1000"));
    assert.equal(await hud.locator("[data-goal], .m3-bar-star").count(), 0, "no goal chips / star line as clear condition");
    assert.equal(await page.getByTestId("m3-hp-bar").count(), 1);
    assert.match(await page.getByTestId("cb-enemy").innerText(), /回後出手/);
    let shot = false;
    let minHp = 1000;
    let healSeen = 0;
    for (let i = 0; i < 40; i++) {
      await page.waitForFunction(() => document.querySelector('[data-testid="m3-board"]')?.getAttribute("data-phase") === "play" || document.querySelector('[data-testid="m3-result"]'), null, { timeout: 20000 });
      if (await page.getByTestId("m3-result").count()) break;
      const heal = await page.locator('.m3-cell[data-kind="0"]').count();
      healSeen = Math.max(healSeen, heal);
      const hp = Number(await hpEl.getAttribute("data-hp"));
      minHp = Math.min(minHp, hp);
      if (!shot && heal > 0 && hp < 1000) {
        await page.waitForFunction(() => [...document.querySelectorAll('.m3-cell img')].every((i) => i.complete), null, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(250);
        await page.screenshot({ path: "screenshots/combat-hp-390.png" });
        await page.screenshot({ path: "screenshots/combat-header-390.png", clip: { x: 0, y: 0, width: 390, height: 140 } });
        shot = true;
      }
      if (shot && minHp < 1000) break;
      await playMoves(page, 1, { skills: false });
    }
    if (!shot) await page.screenshot({ path: "screenshots/combat-hp-390.png" });
    assert.ok(healSeen > 0, "青玉璧 shows up on the board");
    assert.ok(minHp < 1000, `墨厄 hit the player (min ${minHp})`);
    const jadeOk = await page.evaluate(async () => (await fetch("/jade/jade-0-qing@2x.webp")).ok);
    assert.ok(jadeOk, "青玉璧 art is served");
    report.push({ case: "G hp", minHp, healSeen, shot, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  }
  // H) 第 41 關: 墨紋延伸 locks jades next to the old seals; score alone never ends the fight (t436u / t438u)
  {
    const { context, page, errors } = await open({ ...base, volumeAwards: [1, 2, 3, 4], coachSeen: 1, owned: { qin: 1, zhouyu: 1, sima: 1 }, raid: { team: ["qin", "zhouyu", "sima"], records: {} }, m3: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i + 1), { stars: 3, best: 3000 }])) });
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(600);
    await page.locator('[data-level="41"]').click();
    await page.getByTestId("m3-intro").waitFor();
    assert.equal(await page.getByTestId("m3-intro-vein").count(), 1, "later chapters explain 墨紋延伸");
    await page.getByTestId("m3-start").click();
    await page.getByTestId("m3-hud").waitFor();
    let vein = 0;
    let note = "";
    let creep = false;
    const counts = [];
    for (let i = 0; i < 24 && vein < 4; i++) {
      if (await page.getByTestId("m3-result").count()) break;
      await playMoves(page, 1, { skills: false });
      await page.waitForFunction(() => document.querySelector('[data-testid="m3-board"]')?.getAttribute("data-phase") === "play" || document.querySelector('[data-testid="m3-result"]'), null, { timeout: 20000 });
      const n = await page.locator('[data-vein="1"]').count();
      counts.push(n);
      const t = await page.getByTestId("cb-enemy").innerText().catch(() => "");
      if (/墨紋延伸/.test(t)) creep = true;
      if (n > vein) {
        vein = n;
        note = t.replace(/\s+/g, " ").slice(0, 80);
        await page.waitForTimeout(350);
        await page.screenshot({ path: "screenshots/combat-vein-390.png" });
      }
    }
    assert.ok(vein > 0, "墨紋 appeared on the board");
    const tag = await page.locator('[data-vein="1"]').first().evaluate((e) => [getComputedStyle(e, "::after").content, getComputedStyle(e, "::before").backgroundImage]).catch(() => ["", ""]);
    assert.ok(tag[0] === "none" || tag[0] === "normal", `no 紋 stamp (${tag[0]})`);
    assert.match(tag[1], /mo-wen/, "vein uses the ink-wash texture");
    // the board still has a legal move and the fight is still on (score never ends it)
    const ehp = Number(await page.getByTestId("cb-enemy").getAttribute("data-hp"));
    if (!(await page.getByTestId("m3-result").count())) assert.ok(ehp > 0);
    const r = await playMoves(page, 120, { skills: true });
    await page.getByTestId("m3-result").waitFor({ timeout: 20000 });
    const won = await page.getByTestId("m3-result").getAttribute("data-won");
    const endHp = Number(await page.getByTestId("cb-enemy").getAttribute("data-hp"));
    assert.equal(won === "1", endHp === 0, `win ⇔ 墨厄 at 0 (won ${won}, enemy ${endHp})`);
    if (won !== "1") assert.equal(await page.getByTestId("m3-hud").getAttribute("data-hp"), "0", "a loss means 氣血耗盡");
    await page.screenshot({ path: "screenshots/combat-vein-result-390.png" });
    report.push({ case: "H vein L41", vein, counts, creep, note, won, endHp, ...r, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify(report, null, 1));
} finally {
  await browser.close();
}
