// t470 鎮厄司 lobby UI check — isolated headless Chrome with seeded localStorage (never a user session).
// RAID_LOBBY_URL=http://127.0.0.1:8080/ node --experimental-strip-types scripts/raid-lobby-ui-test.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { allMoves, boardFrom } from "../src/game/match3.ts";

const URL = process.env.RAID_LOBBY_URL || "http://127.0.0.1:8080/";
const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
await mkdir("screenshots", { recursive: true });
const today = new Date().toLocaleDateString("en-CA");
const read10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const base = { ink: 8000, totalPulls: 9, muted: true, lastDaily: today, coachSeen: 1, mainStoryPrologueRead: true, mainStoryRead: [1, 2, 3, 4, 5], mainStoryHanRead: read10, mainStoryWuRead: read10, mainStoryQiRead: read10, mainStoryTangRead: read10 };
const allOpen = { 10: { stars: 1, best: 1 }, 20: { stars: 1, best: 1 }, 40: { stars: 1, best: 1 } };
const owned6 = { qin: 3, zhouyu: 2, sima: 1, lanling: 1, libai: 1, machao: 1 };
const gear = { instances: [{ uid: "a1", eid: "liuhe-xuanxi", level: 4, equippedBy: "qin", locked: false }, { uid: "a2", eid: "chibi-guqin", level: 1, equippedBy: "zhouyu", locked: false }], materials: { jingmosha: 5, zhenejing: 0, tianmingcanyin: 0, suyuanlu: 0 }, grants: ["vault-gift"], serial: 3 };
const report = [];

async function open(state, { viewport = { width: 390, height: 844 }, version = 5 } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addInitScript(([s, v]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("qiangu-yu", JSON.stringify({ version: v, state: s }));
      sessionStorage.setItem("seeded", "1");
    }
    localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
  }, [state, version]);
  await page.goto(URL);
  await page.waitForTimeout(1200);
  await page.getByTestId("home-raid").click();
  await page.getByTestId("raid-lobby").waitFor();
  await page.waitForTimeout(250);
  return { context, page, errors };
}
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("qiangu-yu")).state);
const layout = (page) =>
  page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height, w: b.width }; };
    const hall = document.querySelector(".raid-hall");
    return { picker: r(".rh-picker"), detail: r(".rh-detail"), cta: r(".rh-cta"), start: r(".rh-start"), w: innerWidth, h: innerHeight, doc: document.documentElement.scrollWidth, hallScrollW: hall?.scrollWidth, hallW: hall?.clientWidth };
  });
async function pick(page, tier) {
  await page.getByTestId(`raid-tier-${tier}`).click();
  await page.waitForTimeout(120);
}
async function scrollHall(page, to) {
  await page.evaluate((t) => { const h = document.querySelector(".raid-hall"); h.scrollTop = t === "bottom" ? h.scrollHeight : 0; }, to);
  await page.waitForTimeout(120);
}
async function fullShot(page, path) {
  // Capture the whole lobby (scroll container) for review, then reset.
  const h = await page.evaluate(() => document.querySelector(".raid-hall").scrollHeight);
  await page.setViewportSize({ width: page.viewportSize().width, height: Math.max(844, h) });
  await page.waitForTimeout(150);
  await page.screenshot({ path });
}

async function playToResult(page, max = 90) {
  let turns = 0;
  while (turns < max) {
    if (await page.getByTestId("raid-result").count()) break;
    await page.waitForFunction(() => { const b = document.querySelector('[data-testid="m3-board"]'); return !b || ["play", "done"].includes(b.getAttribute("data-phase")); }, null, { timeout: 20000 });
    if (await page.getByTestId("raid-result").count()) break;
    const ready = page.locator('[data-testid="m3-skill"][data-full="1"]:not(:disabled)');
    if (await ready.count()) { await ready.first().click(); await page.waitForTimeout(200); const cut = page.getByTestId("m3-cutin"); if (await cut.count()) await cut.click().catch(() => {}); await page.waitForTimeout(250); continue; }
    const cells = await page.locator(".m3-cell").evaluateAll((l) => l.map((e) => ({ r: +e.dataset.r, c: +e.dataset.c, kind: +e.dataset.kind, special: e.dataset.special, seal: +(e.dataset.sealed || 0) })));
    const grid = Array.from({ length: 8 }, () => Array(7).fill("0"));
    const seal = Array.from({ length: 8 }, () => Array(7).fill(0));
    const specials = [];
    for (const x of cells) { grid[x.r][x.c] = String(Math.max(0, x.kind)); seal[x.r][x.c] = x.seal; if (x.special) specials.push([x.r, x.c, x.special]); }
    const moves = allMoves(boardFrom(grid.map((r) => r.join("")), specials, seal));
    if (!moves.length) { await page.waitForTimeout(300); continue; }
    const [a, to] = moves[Math.floor(Math.random() * Math.min(3, moves.length))];
    const box = await page.getByTestId("m3-board").boundingBox();
    const at = (p) => ({ x: box.x + ((p.c + 0.5) * box.width) / 7, y: box.y + ((p.r + 0.5) * box.height) / 8 });
    const p1 = at(a), p2 = at(to);
    await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 4 }); await page.mouse.up();
    turns++;
    await page.waitForTimeout(120);
  }
  return turns;
}

try {
  // A) all tiers open, unclaimed: switching, numbers, tags, details, team, 390px layout, start/back sync.
  {
    const { context, page, errors } = await open({ ...base, owned: owned6, m3: allOpen, artifacts: gear, raid: { team: ["qin", "zhouyu", "sima"], records: {} } });
    const expect = { normal: ["噬墨之影", "4,200", "1,100"], elite: ["濁墨巨傀", "5,400", "1,200"], sovereign: ["墨淵厄主", "6,600", "1,300"] };
    for (const [tier, [name, hp, php]] of Object.entries(expect)) {
      await pick(page, tier);
      assert.equal(await page.getByTestId(`raid-tier-${tier}`).getAttribute("aria-selected"), "true");
      assert.equal(await page.getByTestId("raid-boss-name").innerText(), name);
      assert.equal(await page.getByTestId("raid-boss-hp").innerText(), hp);
      assert.equal(await page.getByTestId("raid-player-hp").innerText(), php);
      const tags = await page.getByTestId("raid-tags").locator("li").allInnerTexts();
      assert.ok(tags.length >= 1 && tags.length <= 3, tags.join());
      assert.equal(await page.getByTestId("raid-mechanics").count(), 0, "details collapsed by default");
      assert.equal(await page.getByTestId("raid-start").innerText().then((t) => t.split("\n")[0]), "開始討伐");
      assert.equal(await page.getByTestId("raid-reward-first").getAttribute("data-claimed"), "0");
      const L = await layout(page);
      assert.ok(L.doc <= L.w && L.hallScrollW <= L.hallW + 1, `no sideways overflow ${JSON.stringify(L)}`);
      assert.ok(L.start.bottom <= L.h + 1 && L.start.h >= 48, `CTA reachable ${JSON.stringify(L)}`);
      await page.screenshot({ path: `screenshots/raid-lobby-${tier}-390.png` });
      report.push({ tier, name, hp, php, tags });
    }
    // detail toggle (sovereign has every mechanic)
    await page.getByTestId("raid-detail-toggle").click();
    const mech = await page.getByTestId("raid-mechanics").locator("li").evaluateAll((l) => l.map((e) => e.dataset.key));
    assert.deepEqual(mech, ["attack", "ink", "ice", "vein", "shield", "phase", "tip"]);
    await pick(page, "normal");
    await page.getByTestId("raid-detail-toggle").click();
    const mechN = await page.getByTestId("raid-mechanics").locator("li").evaluateAll((l) => l.map((e) => e.dataset.key));
    assert.deepEqual(mechN, ["attack", "ink", "ice", "shield", "phase", "tip"], "no fabricated 墨紋/墨蝕 on 噬墨之影");
    await page.getByTestId("raid-mechanics").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "screenshots/raid-lobby-details-390.png" });
    // team: 3 members, class + artifact
    const members = await page.getByTestId("raid-team").locator(".qe-member").allInnerTexts();
    assert.equal(members.length, 3);
    assert.ok(members[0].includes("秦始皇") && members[0].includes("破厄") && /六合玄璽\s+Lv\.4/.test(members[0]), members[0]);
    assert.ok(/裝備命器|命器未開放/.test(members[2]), members[2]);
    assert.equal(await page.getByTestId("raid-fit").getAttribute("data-level"), "partial");
    // CTA does not cover rewards/team at the bottom of the scroll.
    await scrollHall(page, "bottom");
    const cover = await page.evaluate(() => { const c = document.querySelector(".rh-cta").getBoundingClientRect(); const f = document.querySelector('[data-testid="raid-fit"]').getBoundingClientRect(); return { ctaTop: c.top, fitBottom: f.bottom }; });
    assert.ok(cover.fitBottom <= cover.ctaTop + 1, `CTA overlaps team at bottom ${JSON.stringify(cover)}`);
    await page.screenshot({ path: "screenshots/raid-lobby-bottom-390.png" });
    // existing 編隊 flow (TeamPicker) opens and edits the shared team
    await page.getByTestId("raid-edit-team").click();
    await page.getByTestId("cb-team-picker").waitFor();
    await page.getByTestId("cb-pick-sima").click();
    await page.getByTestId("cb-pick-lanling").click();
    await page.getByTestId("cb-team-done").click();
    assert.deepEqual((await saved(page)).raid.team, ["qin", "zhouyu", "lanling"]);
    await pick(page, "sovereign");
    const fitText = await page.getByTestId("raid-fit").innerText();
    assert.ok(fitText.includes("承命"), fitText);
    // start → correct fight intro → back: lobby shows 再次討伐 (tries synced)
    await page.getByTestId("raid-start").click();
    await page.getByTestId("raid-intro").waitFor();
    assert.ok((await page.getByTestId("raid-intro").innerText()).includes("墨淵厄主"));
    assert.ok((await page.getByTestId("raid-intro").innerText()).includes("首領封印"));
    await page.getByTestId("raid-intro").getByRole("button", { name: "返回", exact: true }).click();
    await page.getByTestId("raid-lobby").waitFor();
    assert.equal(await page.getByTestId("raid-tier-sovereign").getAttribute("aria-selected"), "true", "selection kept");
    assert.equal((await page.getByTestId("raid-start").innerText()).split("\n")[0], "再次討伐");
    const st = await saved(page);
    assert.equal(st.raid.records["sovereign-ink-abyss"].tries, 1);
    assert.equal(st.raid.records["sovereign-ink-abyss"].firstDrop, false);
    assert.equal(st.ink, 8000);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // B) real fight on 噬墨之影 to a result, then lobby sync (win → claimed + materials; loss → nothing paid).
  {
    const { context, page, errors } = await open({ ...base, owned: { qin: 7, lanling: 7, libai: 7 }, m3: allOpen, raid: { team: ["qin", "lanling", "libai"], records: {} } });
    await pick(page, "normal");
    await page.getByTestId("raid-start").click();
    await page.getByTestId("raid-intro").waitFor();
    await page.getByTestId("m3-start").click();
    await page.getByTestId("m3-board").waitFor();
    const turns = await playToResult(page);
    await page.getByTestId("raid-result").waitFor({ timeout: 15000 });
    const won = (await page.getByTestId("raid-result").getAttribute("data-won")) === "1";
    await page.screenshot({ path: `screenshots/raid-lobby-fight-result-${won ? "win" : "loss"}.png` });
    await page.getByRole("button", { name: "返回討伐", exact: true }).click();
    await page.getByTestId("raid-lobby").waitFor();
    const st = await saved(page);
    const rec = st.raid.records["ink-shadow"];
    assert.equal(rec.tries, 1);
    assert.equal((await page.getByTestId("raid-start").innerText()).split("\n")[0], "再次討伐");
    if (won) {
      assert.equal(rec.clears, 1); assert.equal(rec.firstDrop, true); assert.equal(rec.rewardClaimed, true);
      assert.equal(st.artifacts.materials.jingmosha, 32); assert.equal(st.ink, 8300);
      assert.equal(await page.getByTestId("raid-reward-first").getAttribute("data-claimed"), "1");
      assert.equal(await page.getByTestId("raid-legacy-ink").getAttribute("data-claimed"), "1");
      assert.equal(await page.getByTestId("raid-record").innerText(), "已討伐 1 次");
    } else {
      assert.ok(!rec.clears); assert.equal(rec.firstDrop, false); assert.equal(st.ink, 8000);
      assert.equal(st.artifacts?.materials?.jingmosha ?? 0, 0);
      assert.equal(await page.getByTestId("raid-reward-first").getAttribute("data-claimed"), "0");
      assert.equal(await page.getByTestId("raid-record").innerText(), "已挑戰 · 尚未勝利");
    }
    await page.screenshot({ path: `screenshots/raid-lobby-after-${won ? "win" : "loss"}-390.png` });
    report.push({ fight: "ink-shadow", won, turns, record: rec });
    assert.deepEqual(errors, []);
    await context.close();
  }

  // C) claimed first-win (repeat state) + old v4 save record shape (no clears / tries).
  {
    const { context, page, errors } = await open({ ...base, owned: owned6, m3: allOpen, raid: { team: ["qin", "lanling", "libai"], records: { "ink-shadow": { cleared: true, rewardClaimed: true, bestMoves: 5, clears: 3, firstDrop: true } } } });
    await pick(page, "normal");
    assert.equal(await page.getByTestId("raid-reward-first").getAttribute("data-claimed"), "1");
    assert.equal(await page.getByTestId("raid-legacy-ink").getAttribute("data-claimed"), "1");
    assert.ok((await page.getByTestId("raid-reward-first").innerText()).includes("已領取"));
    assert.equal((await page.getByTestId("raid-start").innerText()).split("\n")[0], "再次討伐");
    assert.equal(await page.getByTestId("raid-fit").getAttribute("data-level"), "good");
    await page.screenshot({ path: "screenshots/raid-lobby-claimed-390.png" });
    assert.deepEqual(errors, []);
    await context.close();
  }
  {
    const { context, page, errors } = await open({ ...base, owned: owned6, m3: allOpen, raid: { team: ["qin"], records: { "ink-shadow": { cleared: true, rewardClaimed: true, bestMoves: 5 } } } }, { version: 4 });
    await pick(page, "normal");
    assert.equal((await page.getByTestId("raid-start").innerText()).split("\n")[0], "再次討伐");
    assert.equal(await page.getByTestId("raid-legacy-ink").getAttribute("data-claimed"), "1");
    assert.equal(await page.getByTestId("raid-reward-first").getAttribute("data-claimed"), "0", "old V1 save still owed the material bonus (existing rule)");
    assert.equal(await page.getByTestId("raid-team-autofill").count(), 1);
    assert.equal(await page.getByTestId("raid-team").locator(".qe-autofill").count(), 2);
    const st = await saved(page);
    assert.equal(st.raid.records["ink-shadow"].clears, 1);
    assert.equal("tries" in st.raid.records["ink-shadow"], false);
    await page.screenshot({ path: "screenshots/raid-lobby-oldsave-autofill-390.png" });
    assert.deepEqual(errors, []);
    await context.close();
  }

  // D) no characters → clear prompt, disabled start; locked elite/sovereign.
  {
    const { context, page, errors } = await open({ ...base, owned: {}, totalPulls: 0, m3: { 10: { stars: 1, best: 1 } }, raid: { team: [], records: {} } });
    assert.equal(await page.getByTestId("raid-team-empty").count(), 1);
    assert.equal(await page.getByTestId("raid-start").isDisabled(), true);
    assert.equal(await page.getByTestId("raid-tier-elite").getAttribute("data-open"), "0");
    await page.screenshot({ path: "screenshots/raid-lobby-empty-team-390.png" });
    await pick(page, "elite");
    assert.equal(await page.getByTestId("raid-gate-elite").count(), 1);
    assert.equal(await page.getByTestId("raid-start").isDisabled(), true);
    assert.ok((await page.getByTestId("raid-start").innerText()).includes("第 20 關後開放"));
    await page.screenshot({ path: "screenshots/raid-lobby-locked-elite-390.png" });
    assert.deepEqual(errors, []);
    await context.close();
  }

  // E) small iPhone SE 375×667 + full-length capture at 390.
  {
    const { context, page, errors } = await open({ ...base, owned: owned6, m3: allOpen, artifacts: gear, raid: { team: ["qin", "zhouyu", "lanling"], records: {} } }, { viewport: { width: 375, height: 667 } });
    for (const tier of ["normal", "elite", "sovereign"]) {
      await pick(page, tier);
      const L = await layout(page);
      assert.ok(L.doc <= L.w && L.hallScrollW <= L.hallW + 1, `375 overflow ${JSON.stringify(L)}`);
      assert.ok(L.start.bottom <= L.h + 1, `375 CTA visible ${JSON.stringify(L)}`);
    }
    const tiny = await page.evaluate(() => [...document.querySelectorAll(".raid-hall *")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 9.5).map((e) => e.className + ":" + e.textContent.trim().slice(0, 10)));
    assert.deepEqual(tiny, [], "no text under 9.5px");
    await page.screenshot({ path: "screenshots/raid-lobby-375x667.png" });
    await context.close();
    const b = await open({ ...base, owned: owned6, m3: allOpen, artifacts: gear, raid: { team: ["qin", "zhouyu", "lanling"], records: {} } });
    await pick(b.page, "sovereign");
    await fullShot(b.page, "screenshots/raid-lobby-full-390.png");
    assert.deepEqual([...errors, ...b.errors], []);
    await b.context.close();
  }
  await writeFile("raid-lobby-ui-results.json", JSON.stringify(report, null, 2));
  console.log("PASS raid lobby UI", JSON.stringify(report));
} finally {
  await browser.close();
}
