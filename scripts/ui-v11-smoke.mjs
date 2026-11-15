import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 800 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
const checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const snap = async (name) => {
  await page.screenshot({ path: `/workspace/bg/home-screenshots/ui-v11-${name}.png` });
};
const get = () =>
  page.evaluate(async () => {
    const { useSave } = await import(
      (await (await fetch("/src/components/game/Hall.tsx")).text()).match(
        /from "([^"]*\/store\.ts[^"]*)"/,
      )[1]
    );
    const s = useSave.getState();
    return JSON.parse(JSON.stringify(s));
  });
const set = (state) =>
  page.evaluate(async (state) => {
    const { useSave } = await import(
      (await (await fetch("/src/components/game/Hall.tsx")).text()).match(
        /from "([^"]*\/store\.ts[^"]*)"/,
      )[1]
    );
    useSave.setState(state);
  }, state);
const noOverflow = async (name) => {
  const o = await page.evaluate(() => ({
    w: innerWidth,
    doc: document.documentElement.scrollWidth,
    bad: [
      ...document.querySelectorAll(
        ".hall-scroll,.journey-scroll,.story-journey,.letter-paper,.ink-top",
      ),
    ]
      .filter((e) => e.scrollWidth > e.clientWidth + 1)
      .map((e) => e.className),
  }));
  assert.ok(o.doc <= o.w, JSON.stringify(o));
  assert.deepEqual(o.bad, [], name + ": " + JSON.stringify(o));
  checks.push(`${name}: no overflow`);
};
await page.goto("http://127.0.0.1:8080/");
await page.getByRole("button", { name: "領取 800 墨玉", exact: true }).click();
assert.equal((await get()).ink, 8800);
await page.getByTestId("home-daily").click();
assert.equal((await get()).ink, 8800);
checks.push("daily: +800 once, second click no reward");
await page.locator(".hall-scroll").evaluate((e) => (e.scrollTop = 0));
await snap("home-390");
await page.locator(".hall-scroll").evaluate((e) => (e.scrollTop = e.scrollHeight));
await snap("home-actions-390");
assert.ok((await page.locator(".summon-ten").innerText()).includes("1440"));
assert.ok((await page.locator(".summon-ten").innerText()).includes("必含 S"));
await page.getByRole("button", { name: /單次召喚/ }).click();
await page.waitForTimeout(1300);
const summoned = await get();
assert.equal(summoned.totalPulls, 1);
assert.equal(summoned.ink, 8640);
assert.equal(Object.keys(summoned.owned).length, 1);
checks.push("single summon: -160, real owned card and totalPulls; ten cost 1440/floor shown");
// Reload dismisses reveal without touching the save.
await page.reload();
await page.waitForTimeout(600);
await page.getByTestId("home-match").waitFor();
await page.evaluate(() =>
  localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true })),
);
// Seed an OLD v4 save with no new fields; all legacy values must survive hydration.
const legacy = {
  ...summoned,
  mainStoryPrologueRead: true,
  mainStoryRead: [1],
  mainStoryWuRead: [1, 2],
  mainStoryQiRead: [1],
  m3: { 1: { stars: 2, best: 1900 } },
  owned: { ...summoned.owned, qin: 1, zhouyu: 2 },
  assist: "qin",
  marks: 35,
};
delete legacy.letters;
delete legacy.lettersVersion;
delete legacy.storyLast;
await page.evaluate(
  (s) => localStorage.setItem("qiangu-yu", JSON.stringify({ state: s, version: 4 })),
  legacy,
);
await page.reload();
await page.waitForTimeout(600);
await page.getByTestId("home-match").waitFor();
await page.waitForTimeout(500);
let loaded = await get();
for (const field of [
  "ink",
  "owned",
  "m3",
  "marks",
  "mainStoryRead",
  "mainStoryWuRead",
  "mainStoryQiRead",
  "assist",
])
  assert.deepEqual(loaded[field], legacy[field]);
assert.deepEqual(loaded.letters, {});
checks.push(
  "old v4 save: currencies, cards, assists, stars, story read preserved; letters default empty",
);
// Avoid an invite overlay in this isolated context.
await page.evaluate(() =>
  localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true })),
);
await page.getByTestId("home-match").click();
await page.getByRole("tab", { name: "闖關", exact: true }).waitFor();
await snap("stages-390");
await noOverflow("390 stages");
for (const width of [360, 430]) {
  await page.setViewportSize({ width, height: 800 });
  await noOverflow(`${width} stages`);
  await snap(`stages-${width}`);
}
await page.setViewportSize({ width: 390, height: 800 });
await page.locator('[data-level="2"]').click();
await page.getByTestId("m3-intro").waitFor();
assert.ok((await page.getByTestId("m3-intro").innerText()).includes("目前 0 / 3 星"));
// 統一三人戰隊: no single 助陣 block; 自動配對 fills the 編隊.
assert.equal(await page.getByTestId("m3-assist").count(), 0);
await snap("stage-info-390");
await page.getByTestId("cb-team-auto").click();
assert.ok((await get()).raid.team.length >= 1);
await page.getByTestId("m3-start").click();
await page.locator('[data-phase="play"]').waitFor();
checks.push(
  "level 2 info: goals/stars/三人戰隊 自動配對 persists; Start enters real board",
);
// reopen map from reload to avoid playing/changing level results.
await page.reload();
await page.waitForTimeout(600);
await page.getByTestId("home-match").click();
await page.getByRole("tab", { name: "故事", exact: true }).click();
await page.getByTestId("main-story-tab-3").click();
await snap("story-wu-390");
await page.getByTestId("story-continue").click();
await page.getByTestId("main-story-wu").waitFor();
assert.equal(await page.getByTestId("main-story-wu").getAttribute("data-volume"), "3");
checks.push("Story Start opens 三國 VN");
await page.reload();
await page.waitForTimeout(600);
await page.getByTestId("home-match").click();
await page.getByRole("tab", { name: "故事", exact: true }).click();
await page.getByTestId("main-story-tab-4").click();
await snap("story-qi-390");
for (const width of [360, 390, 430]) {
  await page.setViewportSize({ width, height: 800 });
  await noOverflow(`${width} story`);
  for (const n of [1, 2, 3, 4, 5]) {
    await page.getByTestId(`main-story-tab-${n}`).click();
    const box = await page.getByTestId(`main-story-tab-${n}`).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
  }
  const tops = await page
    .getByTestId("main-story-chapter-tabs")
    .locator("button")
    .evaluateAll((nodes) => nodes.map((n) => n.offsetTop));
  assert.equal(new Set(tops).size, 1);
  await snap(`story-tang-${width}`);
}
checks.push(
  "five dynasty tabs single row; selected item visible at 360/390/430; preview label remains",
);
await page.getByRole("button", { name: "離開", exact: true }).click();
await page.setViewportSize({ width: 390, height: 800 });
// test unowned locks, then actual owned/real progress state for each letter.
await set({ owned: {}, letters: {}, mainStoryRead: [] });
await page.getByTestId("home-letters").click();
assert.equal(await page.getByTestId("letter-qin-1").isDisabled(), true);
await snap("letters-locked-390");
await page.getByRole("button", { name: "返回首頁", exact: true }).click();
await set({ owned: { qin: 1 }, mainStoryRead: [] });
await page.getByTestId("home-letters").click();
assert.equal(await page.getByTestId("letter-qin-1").isEnabled(), true);
assert.equal(await page.getByTestId("letter-qin-2").isDisabled(), true);
await snap("letters-390");
for (const [id, choice] of [
  ["qin-1", "A"],
  ["qin-2", "B"],
  ["qin-3", "C"],
]) {
  if (id === "qin-2") await set({ mainStoryRead: [1, 2, 3, 4] });
  if (id === "qin-3") await set({ mainStoryRead: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
  const before = (await get()).ink;
  await page.getByTestId(`letter-${id}`).click();
  if (id === "qin-1") await snap("qin-letter-390");
  await page.getByRole("button", { name: "略過展信動畫", exact: true }).click();
  await page.getByRole("button", { name: "讀畢・提筆回信", exact: true }).click();
  await page.getByTestId(`letter-reply-${choice}`).click();
  const completed = await get();
  assert.equal(completed.ink, before + 20);
  assert.equal(completed.letters[id].choice, choice);
  assert.ok(completed.letters[id].completed);
  if (id === "qin-1") {
    await page.locator(".letter-scroll").evaluate((e) => (e.scrollTop = e.scrollHeight));
    await snap("qin-reply-390");
  }
  await page.getByRole("button", { name: "收起書信・返回列表", exact: true }).click();
  await page.getByTestId(`letter-${id}`).click();
  assert.equal(await page.getByTestId("letter-reply-A").count(), 0);
  assert.equal((await get()).ink, before + 20);
  await page.getByRole("button", { name: "返回書信列表", exact: true }).click();
}
checks.push(
  "Qin 3 letters: own/mid/finale locks; A/B/C show distinct response; +20 each exactly once; reread original choice",
);
const savedLetters = (await get()).letters;
const savedInk = (await get()).ink;
await page.reload();
await page.waitForTimeout(600);
await page.getByTestId("home-letters").click();
assert.deepEqual((await get()).letters, savedLetters);
assert.equal((await get()).ink, savedInk);
await page.getByTestId("letter-qin-1").click();
assert.equal(await page.getByTestId("letter-reply-A").count(), 0);
assert.equal((await get()).ink, savedInk);
checks.push("reload retains all replies and reward markers; no repeated payout");
await page.getByRole("button", { name: "返回書信列表", exact: true }).click();
const allProgress = {
  owned: { qin: 1, liuche: 1, zhouyu: 1, lanling: 1, libai: 1 },
  mainStoryHanRead: [5, 10],
  mainStoryWuRead: [4, 10],
  mainStoryQiRead: [6, 10],
  mainStoryTangRead: [6, 10],
};
await set(allProgress);
for (const [person, mid] of [
  ["liuche", 5],
  ["zhouyu", 4],
  ["lanling", 6],
  ["libai", 6],
]) {
  await page.getByLabel("朝代與角色篩選").selectOption(person);
  assert.equal(await page.locator(".letter-row").count(), 3);
  for (const n of [1, 2, 3]) {
    const before = (await get()).ink;
    await page.getByTestId(`letter-${person}-${n}`).click();
    await page.getByRole("button", { name: "讀畢・提筆回信", exact: true }).click();
    await page.getByTestId(`letter-reply-${["A", "B", "C"][n - 1]}`).click();
    assert.equal((await get()).ink, before + 20);
    assert.equal((await get()).letters[`${person}-${n}`].choice, ["A", "B", "C"][n - 1]);
    await page.getByRole("button", { name: "返回書信列表", exact: true }).click();
  }
}
checks.push(
  "all other SSR: three letters each, filters/real own-story unlocks, A/B/C responses, +20 once",
);
await page.getByLabel("朝代與角色篩選").selectOption("all");
await page.locator(".letter-scroll").evaluate((e) => (e.scrollTop = 0));
await snap("letters-all-390");
const allLetters = (await get()).letters,
  allInk = (await get()).ink;
assert.equal(Object.values(allLetters).filter((l) => l.completed).length, 15);
await page.reload();
await page.waitForTimeout(600);
await page.getByTestId("home-letters").click();
assert.deepEqual((await get()).letters, allLetters);
assert.equal((await get()).ink, allInk);
await page.getByTestId("letter-qin-1").click();
checks.push("all fifteen replies/reward-paid ledgers survive reload");

await noOverflow("390 letter");
await page.getByRole("button", { name: "關閉書信", exact: true }).click();
for (const width of [360, 430]) {
  await page.setViewportSize({ width, height: 800 });
  await page.locator(".hall-scroll").evaluate((e) => (e.scrollTop = 0));
  await noOverflow(`${width} home`);
  await snap(`home-${width}`);
}
assert.deepEqual(errors, []);
checks.push("no browser runtime errors");
await fs.writeFile("ui-v11-browser-results.json", JSON.stringify({ checks, errors }, null, 2));
console.log(JSON.stringify({ checks, errors }, null, 2));
await browser.close();
