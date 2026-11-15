// Isolated synthetic saves only. Never accesses a user's browser or cloud data.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.ARTIFACT_TEST_URL || "http://127.0.0.1:8080/";
const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
await mkdir("screenshots", { recursive: true });
const results = [];
async function fixture({
  materials = 100,
  level = 1,
  stage = 50,
  wearer = "zhouyu",
  width = 390,
  height = 844,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addInitScript(
    ({ materials, level, stage, wearer }) => {
      if (sessionStorage.getItem("mingqi-seeded")) return;
      sessionStorage.setItem("mingqi-seeded", "1");
      const m3 = {};
      for (let i = 1; i <= stage; i++) m3[i] = { stars: 2, best: 3000 };
      const read = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      localStorage.setItem(
        "qiangu-yu",
        JSON.stringify({
          version: 5,
          state: {
            ink: 4321,
            owned: { zhouyu: 1, libai: 1, caocao: 1, luyou: 1, machao: 1 },
            totalPulls: 5,
            muted: true,
            lastDaily: new Date().toLocaleDateString("en-CA"),
            m3,
            assist: "zhouyu",
            mainStoryPrologueRead: true,
            mainStoryRead: [1, 2, 3, 4, 5],
            mainStoryHanRead: read,
            mainStoryWuRead: read,
            mainStoryQiRead: read,
            mainStoryTangRead: read,
            artifacts: {
              instances: [
                { uid: "a1", eid: "chibi-guqin", level, equippedBy: wearer, locked: true },
                { uid: "a2", eid: "taibai-zuiyuehu", level: 5, equippedBy: null, locked: false },
                { uid: "a3", eid: "weiwu-hufu", level: 9, equippedBy: "caocao", locked: false },
              ],
              materials: {
                jingmosha: materials,
                zhenejing: materials,
                tianmingcanyin: materials,
                suyuanlu: 7,
              },
              grants: ["vault-gift", "vault-gift-seen"],
              serial: 4,
            },
          },
        }),
      );
      localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
    },
    { materials, level, stage, wearer },
  );
  await page.goto(base);
  await page.waitForTimeout(1500);
  await page.getByTestId("home-artifacts").click();
  try {
    await page.getByTestId("mq-hall").waitFor({ timeout: 10000 });
  } catch (e) {
    await page.screenshot({ path: "screenshots/mingqi-pavilion-fixture-error.png" });
    console.log("fixture error", errors, (await page.locator("body").innerText()).slice(-5000));
    throw e;
  }
  assert.deepEqual(await page.locator(".mq-tabs button").allTextContents(), [
    "裝備",
    "淬鍊",
    "圖鑑",
  ]);
  return { context, page, errors };
}
async function refine(page) {
  await page.locator(".mq-tabs").getByRole("button", { name: "淬鍊", exact: true }).click();
  await page.getByTestId("mq-refine").waitFor();
}
async function shot(page, name) {
  await page.screenshot({ path: `screenshots/mingqi-pavilion-${name}.png` });
}
async function noOverflow(page) {
  assert.ok(
    await page.locator(".mq-scroll").evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    "no pavilion horizontal overflow",
  );
}
async function saved(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("qiangu-yu")));
}
try {
  {
    const { context, page, errors } = await fixture();
    await shot(page, "equip-match");
    await refine(page);
    assert.equal(await page.locator(".mq-refine select").count(), 0);
    assert.equal(await page.getByTestId("mq-refine-card").getAttribute("data-level"), "1");
    assert.equal(await page.getByTestId("mq-refine-go").isEnabled(), true);
    assert.match(await page.getByTestId("mq-refine-readiness").innerText(), /材料齊備/);
    const scroll = await page.locator(".mq-scroll").boundingBox();
    const dock = await page.locator(".mq-footer-host").boundingBox();
    assert.ok(scroll.y + scroll.height <= dock.y + 1, "footer never overlays scroll content");
    await noOverflow(page);
    await shot(page, "refine-selected-card");
    await page.getByTestId("mq-battle-compare").scrollIntoViewIfNeeded();
    assert.match(await page.getByTestId("mq-battle-compare").innerText(), /Lv.1 → Lv.2/);
    await shot(page, "before-after-compare");
    await page.locator(".mq-effect-details summary").click();
    assert.match(await page.locator(".mq-effect-details").innerText(), /Lv.1.*得分|Lv.1.*蓄勢/s);
    await page.getByTestId("mq-cost-jingmosha").scrollIntoViewIfNeeded();
    assert.match(await page.getByTestId("mq-cost-jingmosha").innerText(), /100 \/ 8/);
    await shot(page, "sufficient-materials");
    await page.getByTestId("mq-refine-go").click();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal((await saved(page)).state.artifacts.instances[0].level, 1);
    await page.getByTestId("mq-refine-go").click();
    await page.getByTestId("mq-refine-yes").click();
    assert.equal(await page.getByTestId("mq-refine-card").getAttribute("data-level"), "2");
    const save = await saved(page);
    assert.equal(save.version, 5);
    assert.equal(save.state.ink, 4321);
    assert.equal(save.state.artifacts.materials.jingmosha, 92);
    assert.equal(save.state.artifacts.materials.suyuanlu, 7);
    assert.equal(save.state.artifacts.instances[0].equippedBy, "zhouyu");
    assert.equal(save.state.artifacts.instances[0].locked, true);
    await page.getByTestId("mq-refine-pick-a2").click();
    assert.match(await page.getByTestId("mq-refine-level").innerText(), /太白醉月壺/);
    await page.getByTestId("mq-refine-pick-a1").click();
    assert.match(await page.getByTestId("mq-refine-level").innerText(), /赤壁古琴/);
    await page.locator(".mq-tabs").getByRole("button", { name: "圖鑑", exact: true }).click();
    assert.equal(await page.locator("[data-testid^='mq-def-']").count(), 27);
    assert.equal(await page.locator(".mq-tabs").getByRole("button", { name: "召喚", exact: true }).count(), 0);
    await page.locator(".mq-tabs").getByRole("button", { name: "裝備", exact: true }).click();
    await page.getByTestId("mq-inst-a1").click();
    await page.getByTestId("mq-equip").click();
    await page.getByTestId("mq-pick-libai").click();
    await page.getByTestId("mq-confirm-yes").click();
    assert.equal(await page.getByTestId("mq-exclusive").getAttribute("data-active"), "0");
    await page.getByTestId("mq-exclusive").scrollIntoViewIfNeeded();
    await shot(page, "equip-non-match");
    await page.getByTestId("mq-equip").click();
    await page.getByTestId("mq-pick-zhouyu").click();
    await page.getByTestId("mq-confirm-yes").click();
    assert.equal(await page.getByTestId("mq-exclusive").getAttribute("data-active"), "1");
    await page.getByTestId("mq-exclusive").scrollIntoViewIfNeeded();
    await shot(page, "equip-destiny-active");
    await page.getByTestId("mq-unequip").click();
    assert.equal((await saved(page)).state.artifacts.instances[0].equippedBy, null);
    await page.reload();
    assert.equal((await saved(page)).state.artifacts.instances[0].level, 2);
    assert.equal((await saved(page)).state.artifacts.materials.jingmosha, 92);
    assert.deepEqual(errors, []);
    results.push(
      "390px sufficient, cancel/confirm, exact cost, card switching, 27 codex, no pavilion summon tab, equip/transfer/unequip, reload: PASS",
    );
    await context.close();
  }
  {
    const { context, page, errors } = await fixture({ materials: 2 });
    await refine(page);
    assert.equal(await page.getByTestId("mq-refine-go").isDisabled(), true);
    await page.getByTestId("mq-cost-jingmosha").scrollIntoViewIfNeeded();
    assert.match(await page.getByTestId("mq-cost-jingmosha").innerText(), /尚缺 6/);
    assert.equal(
      await page.getByTestId("mq-cost-jingmosha").locator("progress").getAttribute("value"),
      "2",
    );
    await shot(page, "insufficient-materials");
    await page.getByTestId("mq-acquire-materials").click();
    assert.match(await page.getByTestId("mq-refine-mats").innerText(), /溯緣露.*7/s);
    await page.getByTestId("mq-material-raid").click();
    await page.getByTestId("raid-lobby").waitFor();
    await page.getByTestId("raid-lobby").getByRole("button", { name: "返回", exact: true }).click();
    await page.getByTestId("mq-refine").waitFor();
    assert.equal((await saved(page)).state.artifacts.materials.jingmosha, 2);
    await noOverflow(page);
    assert.deepEqual(errors, []);
    results.push(
      "390px insufficient, deficit/progress, original material sources and live raid entry/return: PASS",
    );
    await context.close();
  }
  {
    const { context, page, errors } = await fixture({ level: 9 });
    await refine(page);
    await page.getByTestId("mq-refine-go").click();
    await page.getByTestId("mq-refine-yes").click();
    await page.getByTestId("mq-awaken-show").click();
    assert.equal(await page.getByTestId("mq-refine-go").count(), 0);
    assert.equal(await page.getByTestId("mq-refine-cost").count(), 0);
    assert.match(await page.getByTestId("mq-awaken-state").innerText(), /已覺醒/);
    await shot(page, "lv10-awaken");
    await page.getByRole("button", { name: "重溫覺醒" }).click();
    await page.getByTestId("mq-awaken-show").click();
    const save = (await saved(page)).state;
    assert.equal(save.artifacts.instances[0].level, 10);
    assert.equal(save.artifacts.materials.jingmosha, 60);
    assert.equal(save.artifacts.materials.zhenejing, 88);
    assert.equal(save.artifacts.materials.tianmingcanyin, 97);
    assert.deepEqual(errors, []);
    results.push("390px Lv9→10 original awaken/cost, no next-level CTA, replay: PASS");
    await context.close();
  }
  {
    const { context, page, errors } = await fixture({
      stage: 29,
      level: 9,
      width: 320,
      height: 667,
    });
    await refine(page);
    assert.equal(await page.getByTestId("mq-refine-go").isDisabled(), true);
    assert.equal(
      await page.getByTestId("mq-refine-block").getAttribute("data-reason"),
      "awaken-locked",
    );
    assert.match(await page.getByTestId("mq-battle-compare").innerText(), /第 30 關開放/);
    await noOverflow(page);
    await shot(page, "small-iphone-gated");
    assert.deepEqual(errors, []);
    results.push("320px small iPhone, resonance/awaken gates, no overflow: PASS");
    await context.close();
  }
  {
    const { context, page, errors } = await fixture({ width: 1280, height: 900 });
    await refine(page);
    await noOverflow(page);
    await shot(page, "desktop");
    assert.deepEqual(errors, []);
    results.push("1280px desktop render: PASS");
    await context.close();
  }
  console.log(results.join("\n"));
  await writeFile(
    "screenshots/mingqi-pavilion-test-results.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
