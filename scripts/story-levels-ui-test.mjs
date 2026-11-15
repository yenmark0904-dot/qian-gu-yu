// Disposable local saves only. All non-local requests are blocked.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
await context.route("**/*", (route) =>
  /^http:\/\/127\.0\.0\.1:5185\//.test(route.request().url()) ? route.continue() : route.abort(),
);
await context.addInitScript(() => {
  if (!localStorage.getItem("qiangu-yu"))
    localStorage.setItem(
      "qiangu-yu",
      JSON.stringify({
        version: 5,
        state: {
          ink: 8123,
          owned: { qin: 1 },
          muted: true,
          coachSeen: 99,
          companionGuideDone: true,
          lastDaily: new Date().toLocaleDateString("en-CA"),
          mainStoryRead: [],
          mainStoryPrologueRead: false,
          m3: {},
        },
      }),
    );
  localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem("qiangu-yu")));
async function map() {
  await page.goto("http://127.0.0.1:5185/");
  await page.getByTestId("home-match").waitFor();
  await page.waitForTimeout(1400);
  const later = page.getByRole("button", { name: "稍後", exact: true });
  if (await later.count()) await later.click();
  await page.getByTestId("home-match").click();
  await page.getByTestId("m3-map").waitFor();
}
const cursor = (stage) => stage.getAttribute("data-beat").then(Number);
async function fastToggle(stage) {
  const old = await cursor(stage);
  await stage.getByTestId("story-fast").click();
  assert.equal(await cursor(stage), old, "control click must not advance the line");
  await page.waitForTimeout(750);
  assert.ok((await cursor(stage)) > old, "auto step");
  await stage.getByTestId("story-fast").click();
  const stopped = await cursor(stage);
  await page.waitForTimeout(750);
  assert.equal(await cursor(stage), stopped, "speed toggles off");
  await stage.press("Enter");
  assert.ok((await cursor(stage)) > stopped, "manual step remains immediate");
}
try {
  await map();
  assert.equal(await page.locator(".prologue-vn").count(), 0, "no automatic plot on a fresh map");
  assert.equal(await page.locator(".journey-page-tabs").count(), 0);
  assert.equal(await page.locator("[data-level]").count(), 50);
  for (let v = 1; v <= 5; v++) {
    const block = page.locator(`[data-journey-volume="${v}"]`);
    assert.equal(await block.getByTestId(`main-story-btn-${v}`).count(), 1);
    assert.equal(await block.locator("[data-level]").count(), 10);
    assert.equal(
      await block.locator("[data-level]").first().getAttribute("data-level"),
      String((v - 1) * 10 + 1),
    );
    assert.ok(
      await block.evaluate(
        (el) =>
          el
            .querySelector(".story-volumes")
            .compareDocumentPosition(el.querySelector(".journey-levels")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    );
  }
  assert.equal(await page.getByTestId("main-story-btn-2").isDisabled(), true);
  for (const era of ["han", "wu", "qi", "tang"])
    assert.equal(await page.getByTestId(`main-story-btn-${era}-1`).isEnabled(), true);
  assert.ok(
    await page
      .locator("#journey-era-2")
      .evaluate(
        (el) =>
          document.querySelector('[data-level="50"]').compareDocumentPosition(el) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );
  await page.locator('[data-level="1"]').click();
  assert.equal(await page.locator(".prologue-vn").count(), 0, "stage is accessible without story");
  // Reset only the disposable browser fixture to return from stage intro.
  await map();
  await page.getByTestId("main-story-btn-1").click();
  let stage = page.getByTestId("main-story");
  await stage.waitFor();
  await fastToggle(stage);
  await stage.getByTestId("story-skip").click();
  const choice = await cursor(stage);
  assert.equal(await stage.locator(".prologue-vn-choices").count(), 1);
  assert.equal(await stage.getByTestId("story-skip").isDisabled(), true);
  assert.equal(await stage.getByTestId("story-fast").isDisabled(), true);
  assert.equal((await save()).state.mainStoryQinPlay.beat, choice);
  await stage.press("Escape");
  await page.getByTestId("main-story-btn-1").click();
  assert.equal(await cursor(stage), choice, "resume at skipped-to choice");
  await stage.getByTestId("main-story-choice-B").click();
  await stage.getByTestId("story-fast").click();
  await stage.getByTestId("story-skip").click();
  await stage.getByTestId("main-story-close").waitFor();
  assert.equal(await stage.getByTestId("story-fast").getAttribute("aria-pressed"), "false");
  assert.deepEqual((await save()).state.mainStoryRead, [], "end screen alone does not mark read");
  assert.equal((await save()).state.mainStoryQinPlay.choices["1"], "B");
  await stage.getByTestId("main-story-close").click();
  assert.equal(await page.locator(".prologue-vn").count(), 0, "finish returns to map, no chaining");
  assert.equal(
    await page
      .locator('[data-journey-volume="1"] .journey-levels')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.ok((await save()).state.mainStoryRead.includes(1));
  // Resume immediately before a choice; speed must stop there, never select A/B/C.
  await page.evaluate((beat) => {
    const s = JSON.parse(localStorage.getItem("qiangu-yu"));
    s.state.mainStoryQinPlay = {
      volume: 1,
      beat,
      done: false,
      positions: { 1: beat },
      finished: {},
      choices: {},
    };
    localStorage.setItem("qiangu-yu", JSON.stringify(s));
  }, choice - 1);
  await map();
  await page.getByTestId("main-story-btn-1").click();
  await stage.getByTestId("story-fast").click();
  await page.waitForTimeout(1400);
  assert.equal(await cursor(stage), choice);
  assert.equal(await stage.getByTestId("story-fast").getAttribute("aria-pressed"), "false");
  await stage.press("Escape");
  // Prologue shares controls and leaves confirmation to its existing finish UI.
  await page.getByTestId("main-story-btn-prologue").click();
  stage = page.getByTestId("main-story-prologue");
  await fastToggle(stage);
  await stage.getByTestId("story-skip").click();
  assert.equal(await stage.locator(".prologue-vn-choices").count(), 1);
  assert.equal(await stage.getByTestId("story-skip").isDisabled(), true);
  await stage.getByTestId("prologue-choice-C").click();
  await stage.getByTestId("story-skip").click();
  assert.equal((await save()).state.mainStoryPrologueRead, false);
  await stage.getByTestId("main-story-close").click();
  assert.equal((await save()).state.mainStoryPrologueRead, true);
  // Unlock test fixture, keep real unlock logic; optional event must remain visible after skip.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("qiangu-yu"));
    s.state.m3 = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [String(i + 1), { stars: 3, best: 3000 }]),
    );
    s.state.volumeAwards = [1, 2, 3, 4, 5];
    localStorage.setItem("qiangu-yu", JSON.stringify(s));
  });
  await map();
  const eventsBefore = (await save()).state.storyEvents;
  await page.getByTestId("main-story-btn-4").click();
  stage = page.getByTestId("main-story");
  await stage.getByTestId("story-skip").click();
  await stage.getByTestId("main-story-choice-A").click();
  await stage.getByTestId("story-skip").click();
  await stage.getByTestId("story-event-card").waitFor();
  assert.equal(await stage.getByTestId("story-event-enter").isEnabled(), true);
  assert.deepEqual((await save()).state.storyEvents, eventsBefore, "skip to event invite must not record event skip");
  await stage.getByTestId("main-story-close").click();
  assert.equal(
    await page
      .locator('[data-journey-volume="4"] .journey-levels')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  // Phone geometry: controls fit, all are at least 44px tall; no horizontal overflow.
  await page.getByTestId("main-story-btn-1").click();
  stage = page.getByTestId("main-story");
  for (const id of ["story-skip", "story-fast"])
    assert.ok(
      await stage.getByTestId(id).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.height >= 44 && r.left >= 0 && r.right <= innerWidth;
      }),
    );
  await mkdir("/workspace/qgy-story-levels-t525/screenshots", { recursive: true });
  await page.screenshot({
    path: "/workspace/qgy-story-levels-t525/screenshots/story-controls.png",
  });
  await stage.press("Escape");
  await page.getByTestId("main-story-tab-1").click();
  await page.screenshot({ path: "/workspace/qgy-story-levels-t525/screenshots/unified-map.png" });
  assert.equal(
    await page.getByTestId("m3-map").evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  assert.deepEqual(errors, []);
  const stored = await save();
  assert.equal(stored.version, 5);
  assert.equal(stored.state.ink, 8123);
  assert.deepEqual(stored.state.owned, { qin: 1 });
  assert.equal(JSON.stringify(stored).includes('"fast"'), false);
  await writeFile(
    "/workspace/qgy-story-levels-t525/ui-results.json",
    JSON.stringify(
      {
        passed: true,
        viewport: "390×844",
        noAutoplay: true,
        interleaved50Stages: true,
        skipChoicesAndFinish: true,
        resume: true,
        fastToggleAutoStop: true,
        optionalEventPreserved: true,
        saveSchemaUnchanged: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: unified mobile map, no autoplay, skip/fast, choices, resume, optional event, unchanged save schema",
  );
} catch (error) {
  console.error("UI state", await page.locator("body").innerText(), errors);
  await page.screenshot({path:"/workspace/qgy-story-levels-t525/ui-failure.png"});
  throw error;
} finally {
  await browser.close();
}
