// Isolated browser fixture only. Real component/store actions; never a player's session/save.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [];
const shots = [];
await mkdir("screenshots", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  let storeUrl;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/src/game/store.ts") storeUrl = request.url();
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addInitScript(() => {
    if (sessionStorage.getItem("qb469-seeded")) return;
    sessionStorage.setItem("qb469-seeded", "1");
    const DAY = 86400000,
      di = Math.floor((Date.now() + 4 * 3600000) / DAY);
    const day = new Date(di * DAY).toISOString().slice(0, 10);
    const dow = (new Date(di * DAY).getUTCDay() + 6) % 7;
    const week = new Date((di - dow) * DAY).toISOString().slice(0, 10);
    localStorage.setItem(
      "qiangu-yu",
      JSON.stringify({
        version: 5,
        state: {
          ink: 8000,
          owned: { qin: 2, zhouyu: 1, sima: 1 },
          muted: true,
          lastDaily: new Date().toLocaleDateString("en-CA"),
          totalPulls: 5,
          m3: Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [String(i + 1), { stars: 2, best: 1000 }]),
          ),
          mainStoryPrologueRead: true,
          mainStoryRead: [1, 2],
          questBook: {
            day,
            week,
            counts: {
              LOGIN_COMPLETED: 1,
              MATCH3_COMPLETED: 1,
              CHARACTER_STORY_READ: 1,
              MAIN_STORY_READ: 1,
              EQUIPMENT_MATCH_COMPLETED: 0,
              ARTIFACT_ENHANCED: 0,
              BOSS_BATTLE_WON: 0,
              DAILY_FREE_SUMMON_COMPLETED: 0,
            },
            claimed: ["story", "mainstory"],
            chests: [20],
            weekDays: [],
            weekRaids: 3,
            weekMatch3: 4,
            weekClaimed: [],
            milestones: ["prologue"],
          },
        },
      }),
    );
    localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
  });
  await page.goto(process.env.QB_URL || "http://127.0.0.1:8080/");
  await page.getByTestId("home-quest").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1800);
  await page.getByTestId("home-quest").click();
  await page.getByTestId("quest-book").waitFor();
  const shot = async (name) => {
    const path = `screenshots/quest-book-${name}.png`;
    await page.screenshot({ path });
    shots.push(path);
  };
  const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem("qiangu-yu")));
  const store = (fn, arg) =>
    page.evaluate(
      async ({ fn, arg, storeUrl }) => {
        const { useSave } = await import(storeUrl);
        return new Function("store", "arg", fn)(useSave, arg);
      },
      { fn, arg, storeUrl },
    );
  const noOverflow = async () =>
    assert.equal(
      await page
        .getByTestId("quest-book")
        .evaluate((el) =>
          [...el.querySelectorAll("*")].some(
            (n) => n.getBoundingClientRect().right > innerWidth + 1,
          ),
        ),
      false,
    );
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId("qb-moyuan").textContent(), "30");
  assert.match(await page.getByTestId("qb-pending").textContent(), /20/);
  assert.deepEqual(
    await page
      .locator('.qb-list [data-testid^="qb-daily-"]')
      .evaluateAll((els) => els.map((el) => el.dataset.testid)),
    [
      "qb-daily-login",
      "qb-daily-match1",
      "qb-daily-match3",
      "qb-daily-equip",
      "qb-daily-raid",
      "qb-daily-free",
      "qb-daily-story",
      "qb-daily-mainstory",
    ],
  );
  await noOverflow();
  await shot("daily-overview");
  await page.getByTestId("qb-daily-story").scrollIntoViewIfNeeded();
  assert.equal(
    await page.getByTestId("qb-daily-story").getByRole("button", { name: "已領取" }).isDisabled(),
    true,
  );
  await shot("claimed-and-go");
  await page.locator(".qb-scroll").evaluate((el) => el.scrollTo(0, 0));
  await page.getByTestId("qb-chest-40").click();
  assert.match(
    await page.getByTestId("qb-chest-detail").textContent(),
    /未達標.*淨墨砂 ×10.*還差 10/,
  );
  assert.equal(await page.getByTestId("qb-chest-claim").isDisabled(), true);
  await shot("chest-locked");
  await page.getByTestId("qb-claim-all").click();
  await page.waitForTimeout(80);
  assert.equal(await page.getByTestId("qb-moyuan").textContent(), "50");
  assert.equal(await page.getByTestId("qb-claim-all").isDisabled(), true);
  assert.equal((await snapshot()).state.questBook.claimed.length, 4);
  await shot("claim-all-result");
  await page.getByTestId("qb-chest-40").click();
  assert.match(await page.getByTestId("qb-chest-detail").textContent(), /可領取.*淨墨砂 ×10/);
  await shot("chest-ready");
  const materials = (await snapshot()).state.artifacts.materials.jingmosha;
  // Two actual DOM clicks before a paint exercise the stale-render rapid-tap path.
  await page.getByTestId("qb-chest-claim").evaluate((el) => {
    el.click();
    el.click();
  });
  assert.equal((await snapshot()).state.artifacts.materials.jingmosha, materials + 10);
  assert.equal((await snapshot()).state.questBook.chests.filter((n) => n === 40).length, 1);
  assert.match(
    await page.getByTestId("qb-chest-detail").textContent(),
    /開箱成功.*獲得 淨墨砂 ×10/,
  );
  await shot("chest-open-result");
  await page.getByTestId("qb-chest-20").click();
  assert.match(await page.getByTestId("qb-chest-detail").textContent(), /已領取.*墨玉 ×20/);
  await shot("chest-claimed");
  // Weekly bulk: actual ticket state, not synthetic display rewards.
  await page.getByTestId("qb-tab-weekly").click();
  assert.equal(
    await page
      .getByTestId("qb-weekly-raid3")
      .getByRole("button", { name: "領取", exact: true })
      .count(),
    1,
  );
  await noOverflow();
  await shot("weekly-overview");
  const ticketsBefore = (await snapshot()).state.artifactTickets;
  await page.getByTestId("qb-claim-all").evaluate((el) => {
    el.click();
    el.click();
  });
  assert.equal((await snapshot()).state.artifactTickets, ticketsBefore + 2);
  assert.equal(await page.getByTestId("qb-claim-all").isDisabled(), true);
  await shot("weekly-claim-all");
  await page
    .getByTestId("qb-weekly-diligent")
    .getByRole("button", { name: "前往今日修行" })
    .click();
  assert.equal(await page.getByTestId("qb-tab-daily").getAttribute("aria-selected"), "true");
  // Completion hint + single rapid claim uses the live store.
  await store('store.getState().questEvent("ARTIFACT_ENHANCED");');
  await page.getByTestId("qb-claim-equip").waitFor();
  assert.match(await page.getByRole("status").textContent(), /修行已成/);
  await page.getByTestId("qb-claim-equip").evaluate((el) => {
    el.click();
    el.click();
  });
  assert.equal((await snapshot()).state.questBook.claimed.filter((id) => id === "equip").length, 1);
  assert.equal(await page.getByTestId("qb-moyuan").textContent(), "60");
  // Preserve persistence format and claim states after a reload.
  assert.equal((await snapshot()).version, 5);
  await page.reload();
  await page.waitForTimeout(1600);
  await page.getByTestId("home-quest").click();
  assert.equal(await page.getByTestId("qb-moyuan").textContent(), "60");
  assert.match(await page.getByTestId("qb-chest-40").textContent(), /已領取/);
  // Real existing navigation: codex, free summon, refine, raid, match3/story.
  for (const [id, expected] of [
    ["match3", "match"],
    ["raid", "raid"],
    ["free", "free"],
    ["equip", "refine"],
    ["story", "codex"],
    ["mainstory", "match"],
  ]) {
    if (["equip", "story", "mainstory"].includes(id)) {
      await store(
        'const s = store.getState(); const counts = {...s.questBook.counts}; counts.ARTIFACT_ENHANCED = 0; counts.CHARACTER_STORY_READ = 0; counts.MAIN_STORY_READ = 0; store.setState({questBook:{...s.questBook,counts,claimed:s.questBook.claimed.filter(id => !["equip","story","mainstory"].includes(id))}});',
      );
    }
    await page
      .getByTestId(`qb-daily-${id}`)
      .getByRole("button", { name: "前往", exact: true })
      .click();
    assert.equal(await page.getByTestId("quest-book").count(), 0);
    if (expected === "free") assert.equal(await page.getByTestId("free-summon").count(), 1);
    if (expected === "match") await page.getByTestId("m3-map").waitFor();
    if (expected === "raid") await page.getByTestId("raid-lobby").waitFor();
    if (expected === "refine") await page.getByTestId("mq-refine").waitFor();
    if (expected === "codex") await page.getByRole("tablist", { name: "圖鑑檢視" }).waitFor();
    await page.reload();
    await page.waitForTimeout(1600);
    await page.getByTestId("home-quest").click();
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await noOverflow();
  await shot("small-iphone");
  await page.setViewportSize({ width: 390, height: 844 });
  // The test alone controls Date; existing reset functions/UI run without alteration.
  for (const boundary of [
    {
      before: "2026-11-08T03:59:59+08:00",
      after: "2026-11-08T04:00:00+08:00",
      day: "2026-11-07",
      weekly: false,
    },
    {
      before: "2026-11-09T03:59:59+08:00",
      after: "2026-11-09T04:00:00+08:00",
      day: "2026-11-08",
      weekly: true,
    },
  ]) {
    await page.clock.setFixedTime(new Date(boundary.before));
    await store(
      'const s=store.getState(); store.setState({questBook:{...s.questBook,day:arg.day,week:"2026-11-02",counts:{...s.questBook.counts,LOGIN_COMPLETED:1,MATCH3_COMPLETED:1},claimed:["login","match1"],chests:[20],weekDays:["2026-11-06"],weekRaids:3,weekClaimed:["raid3"]}});',
      boundary,
    );
    await page.waitForTimeout(1100);
    assert.equal(await page.getByTestId("qb-moyuan").textContent(), "20");
    assert.match(await page.locator(".qb-meter .qb-reset").textContent(), /0 分 01 秒/);
    const milestones = (await snapshot()).state.questBook.milestones;
    await page.clock.setFixedTime(new Date(boundary.after));
    await page.waitForTimeout(1100);
    assert.equal(await page.getByTestId("qb-moyuan").textContent(), "0");
    assert.match(await page.getByTestId("qb-chest-20").textContent(), /未達標/);
    const book = (await snapshot()).state.questBook;
    assert.deepEqual(book.claimed, []);
    assert.deepEqual(book.chests, []);
    assert.equal(book.weekRaids, boundary.weekly ? 0 : 3);
    assert.deepEqual(book.weekClaimed, boundary.weekly ? [] : ["raid3"]);
    assert.deepEqual(book.milestones, milestones);
    await shot(boundary.weekly ? "weekly-reset" : "daily-reset");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.getByTestId("qb-chest-20").evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: daily/weekly, live sorting, pending/claimed separation, bulk and rapid tap guards, all chest states/details/open, real navigation, completion hint, reload persistence, 390px + 320px overflow; no page errors.",
  );
  console.log(shots.join("\n"));
} catch (e) {
  console.error("Page errors:", errors);
  for (const c of browser.contexts())
    for (const p of c.pages()) {
      await p.screenshot({ path: "screenshots/quest-book-failure.png" });
      console.error((await p.locator("body").innerText()).slice(0, 6000));
    }
  throw e;
} finally {
  await browser.close();
}
