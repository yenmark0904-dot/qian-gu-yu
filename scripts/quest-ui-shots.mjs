// 修行簿 UI screenshots on an isolated headless fixture (never a user's browser/session).
import { chromium } from "playwright";
import assert from "node:assert/strict";
const URL = process.env.QB_URL || "http://127.0.0.1:8092/";
const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    const today = new Date().toLocaleDateString("en-CA");
    const DAY = 86400000;
    const sh = Date.now() + 8 * 3600000 - 4 * 3600000;
    const di = Math.floor(sh / DAY);
    const qd = new Date(di * DAY).toISOString().slice(0, 10);
    const dow = (new Date(di * DAY).getUTCDay() + 6) % 7;
    const qw = new Date((di - dow) * DAY).toISOString().slice(0, 10);
    const m3 = {};
    for (let i = 1; i <= 12; i++) m3[String(i)] = { stars: 2, best: 1000 };
    localStorage.setItem("qiangu-yu", JSON.stringify({ version: 5, state: {
      ink: 8000, owned: { qin: 2, zhouyu: 1, sima: 1, machao: 1 }, totalPulls: 5, muted: true, lastDaily: today,
      mainStoryPrologueRead: true, mainStoryRead: [1, 2], m3,
      raid: { team: ["qin", "zhouyu", "sima"], records: {} },
      questBook: {
        day: qd, week: qw,
        counts: { LOGIN_COMPLETED: 1, MATCH3_COMPLETED: 2, CHARACTER_STORY_READ: 1, MAIN_STORY_READ: 0, EQUIPMENT_MATCH_COMPLETED: 0, ARTIFACT_ENHANCED: 0, BOSS_BATTLE_WON: 0, DAILY_FREE_SUMMON_COMPLETED: 0 },
        claimed: ["match1", "story"], chests: [], weekDays: [], weekRaids: 1, weekMatch3: 4, weekClaimed: [], milestones: ["prologue"],
      },
    } }));
    localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
  });
  await page.goto(URL);
  await page.waitForTimeout(2500);
  // home entry + red dot
  await page.getByTestId("home-quest").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="home-quest"] .qb-entry-dot').waitFor({ timeout: 8000 });
  await page.screenshot({ path: "screenshots/quest-home-entry.png" });
  // free summon button
  await page.getByTestId("free-summon").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('[data-testid="free-summon"]').scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: "screenshots/quest-free-summon.png" });
  // open book
  await page.getByTestId("home-quest").click();
  await page.getByTestId("quest-book").waitFor();
  await page.waitForTimeout(400);
  await page.getByTestId("qb-claim-login").click();
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId("qb-moyuan").textContent(), "35");
  await page.screenshot({ path: "screenshots/quest-daily.png" });
  await page.locator(".qb-scroll").evaluate((el) => el.scrollTo(0, 560));
  await page.waitForTimeout(250);
  await page.screenshot({ path: "screenshots/quest-daily-list.png" });
  await page.getByTestId("qb-chest-20").click();
  await page.waitForTimeout(200);
  assert.equal(await page.getByTestId("qb-chest-20").isDisabled(), true);
  // weekly
  await page.getByTestId("qb-tab-weekly").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "screenshots/quest-weekly.png" });
  // milestones 補領
  await page.getByTestId("qb-milestones").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "screenshots/quest-milestones.png" });
  await page.getByTestId("qb-msclaim-stage5").click();
  await page.waitForTimeout(200);
  assert.equal(await page.getByTestId("qb-msclaim-stage5").count(), 0);
  // 前往 free summon → closes and lands on the button; free pull settles once
  await page.getByTestId("qb-tab-daily").click();
  await page.locator('[data-testid="qb-daily-free"] button').click();
  await page.waitForTimeout(400);
  await page.getByTestId("free-summon").click();
  await page.waitForTimeout(1200);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem("qiangu-yu")).state);
  assert.equal(st.totalPulls, 6);
  assert.equal(st.questBook.counts.DAILY_FREE_SUMMON_COMPLETED, 1);
  assert.equal(st.charTickets, 5);
  assert.equal(st.artifactTickets, 10);
  await page.reload();
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  const btn = page.getByTestId("free-summon");
  // a pending reveal banner may show; the button must be disabled after reload
  assert.equal(await btn.isDisabled(), true);
  await page.evaluate(() => document.querySelector('[data-testid="free-summon"]').scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: "screenshots/quest-free-summon-used.png" });
  console.log("quest-ui-shots: OK", errors.length ? errors : "no page errors");
} finally {
  await browser.close();
}
