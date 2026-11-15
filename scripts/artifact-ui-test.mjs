// Isolated headless fixture for 命器閣 (V2.0 階段 B); never touches a real player's browser or save.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const URL_ = process.env.ARTIFACT_TEST_URL || "http://127.0.0.1:8080/";
const browser = await chromium.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
await mkdir("screenshots", { recursive: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await context.addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      const today = new Date().toLocaleDateString("en-CA");
      const m3 = {};
      for (let i = 1; i <= 6; i++) m3[i] = { stars: 2, best: 3000 };
      const read = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      localStorage.setItem("qiangu-yu", JSON.stringify({ version: 4, state: {
        ink: 4321, owned: { zhouyu: 1, libai: 1, machao: 1 }, totalPulls: 3, muted: true, lastDaily: today, m3, assist: "zhouyu",
        mainStoryPrologueRead: true, mainStoryRead: [1, 2, 3, 4, 5], mainStoryHanRead: read, mainStoryWuRead: read, mainStoryQiRead: read, mainStoryTangRead: read,
        artifacts: { instances: [{ uid: "a1", eid: "chibi-guqin", level: 1, equippedBy: null, locked: false }], serial: 2 },
      } }));
      localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
    });
    await page.goto(URL_);
    await page.waitForTimeout(1500);
    await page.getByTestId("home-artifacts").click();
    await page.getByTestId("mq-hall").waitFor();
    await page.getByTestId("mq-notice").waitFor();
    assert.match(await page.getByTestId("mq-notice").innerText(), /素心玉墜/);
    assert.equal(await page.locator(".mq-grid .mq-tile").count(), 2, "gift + 古琴");
    await page.screenshot({ path: `screenshots/mq-vault-${viewport.width}.png` });
    // 古琴 on 李白: general only + non-owner hint
    await page.getByTestId("mq-inst-a1").click();
    await page.getByTestId("mq-equip").click();
    await page.getByTestId("mq-pick-libai").click();
    assert.equal(await page.getByTestId("mq-exclusive").getAttribute("data-active"), "0");
    assert.match(await page.getByTestId("mq-detail").innerText(), /唯與命定之人相契，方能喚醒此器真意。/);
    // transfer to 周瑜 asks first, then the exclusive wakes
    await page.getByTestId("mq-equip").click();
    await page.getByTestId("mq-pick-zhouyu").click();
    assert.match(await page.getByTestId("mq-confirm").innerText(), /此器已裝備於李白，確定要轉移給周瑜嗎/);
    await page.getByTestId("mq-confirm-yes").click();
    assert.equal(await page.getByTestId("mq-exclusive").getAttribute("data-active"), "1");
    await page.screenshot({ path: `screenshots/mq-detail-${viewport.width}.png` });
    // reload: no second gift, equip persisted
    await page.reload();
    await page.waitForTimeout(1200);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("qiangu-yu")).state);
    assert.equal(saved.artifacts.instances.length, 2);
    assert.equal(saved.artifacts.instances.find((i) => i.uid === "a1").equippedBy, "zhouyu");
    assert.equal(saved.ink, 4321);
    assert.deepEqual(saved.owned, { zhouyu: 1, libai: 1, machao: 1 });
    // the 助陣 dock in a main level shows the worn 命器 and its awakened layer
    await page.getByTestId("home-match").click();
    await page.waitForTimeout(700);
    const tab = page.getByRole("tab", { name: /關卡|闖關|山河/ }).first();
    if (await tab.count()) await tab.click().catch(() => {});
    await page.locator('[data-level="1"]').first().click();
    await page.getByTestId("m3-start").click();
    await page.getByTestId("m3-artifact").waitFor();
    assert.match(await page.getByTestId("m3-artifact").innerText(), /赤壁古琴.*專屬已相契/);
    await page.screenshot({ path: `screenshots/mq-dock-${viewport.width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`artifact-ui-test ${viewport.width}: ok`);
  }
} finally {
  await browser.close();
}
