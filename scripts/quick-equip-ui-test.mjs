// Isolated local fixtures only: never a signed-in browser or real player's save.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const url = process.env.QUICK_EQUIP_URL || "http://127.0.0.1:8080/";
const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
await mkdir("screenshots", { recursive: true });
const results = [];
const read = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const gear = {
  instances: [
    { uid: "a1", eid: "liuhe-xuanxi", level: 10, equippedBy: "qin", locked: true },
    { uid: "a2", eid: "chibi-guqin", level: 7, equippedBy: "zhouyu", locked: false },
    { uid: "a3", eid: "chibi-guqin", level: 3, equippedBy: null, locked: false },
  ],
  materials: { jingmosha: 77, zhenejing: 11, tianmingcanyin: 2, suyuanlu: 3 },
  grants: ["vault-gift", "vault-gift-seen"],
  serial: 4,
};
const state = {
  ink: 8888,
  totalPulls: 5,
  owned: { qin: 1, zhouyu: 1, libai: 1 },
  muted: true,
  lastDaily: new Date().toLocaleDateString("en-CA"),
  coachSeen: 1,
  mainStoryPrologueRead: true,
  mainStoryRead: read,
  mainStoryHanRead: read,
  mainStoryWuRead: read,
  mainStoryQiRead: read,
  mainStoryTangRead: read,
  m3: Object.fromEntries(
    [1, 2, 3, 4, 5, 10, 20, 30, 40, 50].map((i) => [i, { stars: 1, best: 1 }]),
  ),
  artifacts: gear,
  raid: { team: ["qin", "zhouyu", "libai"], records: {} },
};
async function open(patch = {}, width = 390, height = 844) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addInitScript(
    (s) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("qiangu-yu", JSON.stringify({ version: 5, state: s }));
        sessionStorage.setItem("seeded", "1");
      }
      localStorage.setItem("qgy-survey-v1", JSON.stringify({ invited: true, dismissed: true }));
    },
    { ...state, ...patch },
  );
  await page.goto(url);
  await page.getByTestId("home-match").waitFor();
  await page.waitForTimeout(1200);
  return { page, context, errors };
}
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("qiangu-yu")).state);
const shot = (page, name) => page.screenshot({ path: `screenshots/quick-equip-${name}.png` });
const close = async (o) => {
  assert.deepEqual(o.errors, []);
  await o.context.close();
};
async function raid(page) {
  await page.getByTestId("home-raid").click();
  try {
    await page.getByTestId("raid-team").waitFor({ timeout: 10000 });
  } catch (e) {
    console.log(await page.locator("body").innerText());
    await shot(page, "debug");
    throw e;
  }
}
async function slot(page, id) {
  const root = (await page.getByTestId("cb-team-picker").count())
    ? page.getByTestId("cb-team-picker")
    : page;
  await root.getByTestId(`qe-slot-${id}`).click();
  await page.getByTestId("qe-sheet").waitFor();
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.getByTestId("qe-sheet").evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
}
async function main(page, level = 1) {
  await page.getByTestId("home-match").click();
  const tab = page.getByRole("tab", { name: /關卡|闖關|山河/ }).first();
  if (await tab.count()) await tab.click();
  const node = page.locator(`[data-level="${level}"]`).first();
  if (!(await node.isVisible())) await node.locator("xpath=ancestor::details").locator("summary").click();
  await node.click();
  await page.getByTestId("m3-intro").waitFor();
}
async function touchable(locator) {
  await locator.scrollIntoViewIfNeeded();
  assert.ok(await locator.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight && (hit === e || e.contains(hit));
  }), "CTA >=44px, visible, not covered");
}
async function compactLayout(page, strip) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const cards = strip.locator(".qe-member");
  assert.equal(await cards.count(), 3);
  const layout = await cards.evaluateAll((cards) => cards.map((e) => {
    const r = e.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, w: r.width, overflow: e.scrollWidth > e.clientWidth + 1 };
  }));
  assert.ok(layout.every((r) => Math.abs(r.top - layout[0].top) < 2 && !r.overflow && r.w >= 68 && r.left >= 0 && r.right <= page.viewportSize().width), JSON.stringify(layout));
  assert.equal(await strip.locator(".qe-character").count(), 3);
  assert.match(await strip.getByTestId("qe-slot-qin").innerText(), /命定專屬/);
  assert.equal(await strip.locator(".qe-exclusive").count(), 2, "correct destined owners only");
  for (const id of ["qin", "zhouyu", "libai"]) await touchable(strip.getByTestId(`qe-slot-${id}`));
}
try {
  // All A-D cases exercise actual store mutations through shared sheet.
  for (const [name, target, uid, confirm] of [
    ["A", "libai", "a3", false],
    ["B", "qin", "a3", true],
    ["C", "libai", "a2", true],
    ["D", "qin", "a2", true],
  ]) {
    const o = await open();
    const { page } = o;
    await raid(page);
    await slot(page, target);
    await noOverflow(page);
    await shot(page, `team-sheet-${name}-390`);
    const before = await saved(page);
    await page.getByTestId(`qe-equip-${uid}`).click();
    if (confirm) {
      await page.getByTestId("qe-confirm").waitFor();
      assert.deepEqual(
        (await saved(page)).artifacts,
        before.artifacts,
        "no mutation before confirm",
      );
      await shot(page, `case-${name}-compare-390`);
      await page.getByTestId("qe-confirm-yes").click();
    } else assert.equal(await page.getByTestId("qe-confirm").count(), 0, "A has no extra dialog");
    assert.match(await page.getByTestId("qe-notice").innerText(), /裝備成功/);
    const after = await saved(page);
    assert.equal(after.artifacts.instances.find((a) => a.uid === uid).equippedBy, target);
    if (target === "qin")
      assert.equal(after.artifacts.instances.find((a) => a.uid === "a1").equippedBy, null);
    if (uid === "a2")
      assert.ok(
        !after.artifacts.instances.some((a) => a.equippedBy === "zhouyu"),
        "source empty, no auto-swap",
      );
    const wearers = after.artifacts.instances.map((a) => a.equippedBy).filter(Boolean);
    assert.equal(new Set(wearers).size, wearers.length);
    assert.deepEqual(
      after.artifacts.instances.map(({ equippedBy: _equippedBy, ...a }) => a),
      before.artifacts.instances.map(({ equippedBy: _equippedBy, ...a }) => a),
    );
    assert.deepEqual(after.artifacts.materials, before.artifacts.materials);
    assert.equal(after.ink, before.ink);
    await page.getByTestId("qe-close").click();
    await shot(page, `case-${name}-390`);
    if (name === "D") {
      await page.reload();
      await page.waitForTimeout(1200);
      assert.deepEqual(
        (await saved(page)).artifacts,
        after.artifacts,
        "old v5 reload retains exact equips",
      );
      await raid(page);
      assert.match(await page.getByTestId("qe-slot-qin").innerText(), /赤壁古琴/);
    }
    console.log(`case ${name}: pass`);
    results.push(`case ${name}: pass`);
    await close(o);
  }
  // Character detail dual entry, filters, honest non-owner and destined labels, unequip, focus/Escape.
  {
    const o = await open();
    const { page } = o;
    await page.getByRole("button", { name: /^圖鑑 \d/ }).click();
    await page.getByTestId("codex-view-owned").click();
    await page.locator('tr[data-id="zhouyu"]').click();
    await page.getByTestId("character-equipment").scrollIntoViewIfNeeded();
    await shot(page, "character-detail-slot-390");
    await slot(page, "zhouyu");
    assert.match(await page.getByTestId("qe-sheet").innerText(), /命定共鳴 · 已啟動/);
    await shot(page, "destined-390");
    await page.getByTestId("qe-filter-destined").click();
    assert.equal(await page.locator('[data-testid^="qe-item-"]').count(), 2);
    await page.getByTestId("qe-unequip").click();
    assert.equal((await saved(page)).artifacts.instances[1].equippedBy, null);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByTestId("qe-sheet").count(), 0);
    assert.equal(
      await page.locator(".codex-scrim").count(),
      1,
      "Escape does not close parent detail",
    );
    await page
      .getByRole("dialog", { name: "周瑜", exact: true })
      .getByRole("button", { name: "關閉", exact: true })
      .first()
      .click();
    await page.locator('tr[data-id="libai"]').click();
    await slot(page, "libai");
    await page.getByTestId("qe-filter-destined").click();
    assert.match(await page.getByTestId("qe-sheet").innerText(), /尚無此角色/);
    await page.getByTestId("qe-filter-all").click();
    await page.getByTestId("qe-equip-a2").click();
    assert.match(await page.getByTestId("qe-notice").innerText(), /裝備成功/);
    await shot(page, "non-destined-390");
    assert.match(await page.getByTestId("qe-sheet").innerText(), /通用效果生效，專屬效果未啟動/);
    results.push("character detail, filters, exclusive/non-owner, unequip, Escape: pass");
    await close(o);
  }
  // Hall keeps its roster, destiny priority, and replace/transfer confirmation.
  {
    const o = await open();
    const { page } = o;
    await page.getByTestId("home-artifacts").click();
    await page.getByTestId("mq-inst-a2").click();
    await page.getByTestId("mq-equip").click();
    assert.equal(
      await page.getByTestId("mq-roster").locator("button").first().getAttribute("data-testid"),
      "mq-pick-zhouyu",
    );
    await page.getByTestId("mq-pick-qin").click();
    await page.getByTestId("mq-confirm").waitFor();
    assert.match(await page.getByTestId("mq-confirm").innerText(), /目前命器/);
    await page.getByTestId("mq-confirm-yes").click();
    assert.equal((await saved(page)).artifacts.instances[0].equippedBy, null);
    await shot(page, "hall-transfer-390");
    results.push("hall shared data and destiny-first roster: pass");
    await close(o);
  }
  // All pre-battle modes share inventory; battle locks store, newest equip used at begin.
  for (const mode of ["main", "deep-palace", "raid"]) {
    const o = await open();
    const { page } = o;
    if (mode === "main") await main(page);
    if (mode === "deep-palace") {
      await page.getByTestId("nav-shengong").click();
      await page.getByTestId("sg-play").click();
      await page.getByTestId("m3-intro").waitFor();
    }
    if (mode === "raid") {
      await raid(page);
      await page.getByTestId("raid-start").click();
      await page.getByTestId("raid-intro").waitFor();
    }
    assert.equal(await page.getByTestId("qe-unequipped-reminder").count(), 1);
    await page.getByTestId("qe-reminder-equip").click();
    await page.getByTestId("qe-sheet").waitFor();
    await page.getByTestId("qe-equip-a3").click();
    await page.getByTestId("qe-close").click();
    assert.match(await page.getByTestId("qe-slot-libai").innerText(), /赤壁古琴/);
    assert.equal(await page.getByTestId("qe-unequipped-reminder").count(), 0);
    await shot(page, `pre-battle-${mode}-390`);
    await page.getByTestId("cb-team-edit").click();
    assert.equal(await page.getByTestId("qe-team").last().locator(".qe-member").count(), 3);
    await slot(page, "qin");
    await shot(page, `team-picker-${mode}-390`);
    await page.getByTestId("qe-close").click();
    await page.getByTestId("cb-team-done").click();
    await page.getByTestId("m3-start").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="m3-board"]')?.dataset.phase === "play",
    );
    assert.equal(await page.getByTestId("qe-slot-libai").count(), 0, "no mid-battle UI");
    const r = await page.evaluate(async () => {
      const { useSave } = await import("/src/game/store.ts");
      const s = useSave.getState(),
        before = s.artifacts;
      return {
        r: s.equipArtifact("a2", "libai", true),
        u: s.unequipArtifact("a1"),
        same: useSave.getState().artifacts === before,
      };
    });
    assert.equal(r.r.reason, "battle-active");
    assert.equal(r.u, false);
    assert.equal(r.same, true);
    assert.match(
      await page.getByTestId("cb-member-libai").innerText(),
      /赤壁古琴/,
      "latest equipment reaches fight",
    );
    await shot(page, `battle-${mode}-390`);
    results.push(`${mode} pre-battle, shared data, latest equip and mid-battle guard: pass`);
    await close(o);
  }
  // Optional empty reminder never prevents any mode from entering its normal fight.
  for (const mode of ["main", "deep-palace", "raid"]) {
    const o = await open();
    const { page } = o;
    if (mode === "main") await main(page);
    if (mode === "deep-palace") {
      await page.getByTestId("nav-shengong").click();
      await page.getByTestId("sg-play").click();
      await page.getByTestId("m3-intro").waitFor();
    }
    if (mode === "raid") {
      await raid(page);
      await page.getByTestId("raid-start").click();
      await page.getByTestId("raid-intro").waitFor();
    }
    await page.getByTestId("qe-unequipped-reminder").scrollIntoViewIfNeeded();
    await shot(page, `unequipped-reminder-${mode}-390`);
    await page.getByTestId("cb-team-edit").click();
    assert.equal(
      await page.getByTestId("cb-team-picker").getByTestId("qe-unequipped-reminder").count(),
      1,
    );
    await shot(page, `unequipped-reminder-team-${mode}-390`);
    await page.getByTestId("cb-team-done").click();
    await page.getByTestId("qe-reminder-skip").click();
    assert.equal(await page.getByTestId("qe-unequipped-reminder").count(), 0);
    await page.getByTestId("m3-start").click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="m3-board"]')?.dataset.phase === "play",
    );
    assert.equal(
      (await saved(page)).artifacts.instances.filter((a) => a.equippedBy === "libai").length,
      0,
      "skip really leaves empty",
    );
    results.push(`${mode}: reminder skip still starts battle with empty slot`);
    await close(o);
  }
  // Gate and an existing owner-exclusive below stage 30 never mislabel damage resonance.
  {
    const o = await open({ m3: { 1: { stars: 1, best: 1 } } });
    const { page } = o;
    await main(page);
    const slotL = page.getByTestId("qe-slot-libai");
    assert.equal(await slotL.isDisabled(), true);
    assert.equal(await page.getByTestId("qe-unequipped-reminder").count(), 0);
    await slotL.scrollIntoViewIfNeeded();
    await shot(page, "gated-before-stage-5-390");
    const r = await page.evaluate(async () => {
      const { useSave } = await import("/src/game/store.ts");
      return useSave.getState().equipArtifact("a3", "libai");
    });
    assert.equal(r.reason, "locked");
    results.push("stage 5 gate UI and store: pass");
    await close(o);
  }
  {
    const o = await open({ m3: { 5: { stars: 1, best: 1 }, 10: { stars: 1, best: 1 } } }, 320, 640);
    const { page } = o;
    await raid(page);
    await slot(page, "zhouyu");
    await noOverflow(page);
    assert.match(await page.getByTestId("qe-sheet").innerText(), /共鳴尚未解鎖/);
    await shot(page, "locked-resonance-320");
    results.push("320px and honest locked resonance: pass");
    await close(o);
  }
  // t482: the same compact strip across every prep mode and all requested phone widths.
  for (const width of [320, 375, 390, 430]) {
    for (const mode of ["main", "deep-palace", "raid"]) {
      const o = await open({ owned: { ...state.owned, sima: 1 } }, width, width === 320 ? 640 : 844);
      const { page } = o;
      if (mode === "main") await main(page);
      if (mode === "deep-palace") {
        await page.getByTestId("nav-shengong").click();
        await page.getByTestId("sg-play").click();
        await page.getByTestId("m3-intro").waitFor();
      }
      if (mode === "raid") {
        await raid(page);
        await page.getByTestId("raid-team-block").scrollIntoViewIfNeeded();
        await compactLayout(page, page.getByTestId("raid-team"));
        await page.screenshot({ path: `screenshots/team-prep-raid-lobby-${width}.png` });
        await page.getByTestId("raid-start").click();
        await page.getByTestId("raid-intro").waitFor();
      }
      assert.equal(await page.getByTestId("qe-member-detail").count(), 0, "full effects collapsed");
      assert.equal(await page.getByTestId("qe-unequipped-reminder").count(), 1);
      await compactLayout(page, page.getByTestId("qe-team"));
      await touchable(page.getByTestId("m3-start"));
      await page.locator(".cb-prep-card").evaluate((e) => { e.scrollTop = 0; });
      await page.screenshot({ path: `screenshots/team-prep-${mode}-${width}.png` });
      if (mode === "main") {
        await page.getByTestId("cb-team-edit").click();
        const picker = page.getByTestId("cb-team-picker");
        assert.equal(await page.getByTestId("qe-unequipped-reminder").count(), 1, "one reminder, no underlying duplicate");
        await compactLayout(page, picker.getByTestId("qe-team"));
        assert.equal(await picker.locator(".cb-chip").filter({ hasText: "×" }).count(), 0);
        await touchable(page.getByTestId("cb-team-done"));
        await page.screenshot({ path: `screenshots/team-prep-picker-${width}.png` });
        await picker.getByTestId("qe-member-libai").locator(".qe-character").click();
        assert.match(await page.getByTestId("qe-member-detail").innerText(), /李白/);
        await page.getByTestId("cb-pick-sima").click();
        assert.deepEqual((await saved(page)).raid.team, ["qin", "zhouyu", "sima"], "replace selected slot using existing team store");
        await page.getByTestId("cb-team-clear").click();
        assert.deepEqual((await saved(page)).raid.team, []);
        assert.equal(await picker.locator(".qe-empty").count(), 3);
        await page.getByTestId("cb-team-auto-pick").click();
        assert.equal((await saved(page)).raid.team.length, 3);
        if (width === 375) {
          await picker.getByTestId("qe-member-libai").locator(".qe-character").click();
          await page.getByTestId("cb-pick-sima").click();
          await slot(page, "sima");
          await page.getByTestId("qe-equip-a3").click();
          await page.getByTestId("qe-close").click();
          await page.getByTestId("cb-team-done").click();
          await page.getByTestId("m3-start").click();
          await page.getByTestId("cb-member-sima").waitFor();
          assert.match(await page.getByTestId("cb-member-sima").innerText(), /赤壁古琴/);
          assert.equal(await page.getByTestId("cb-member-libai").count(), 0);
          results.push("t482 latest replacement team + latest artifact reach actual fight: pass");
        } else await page.getByTestId("cb-team-done").click();
      }
      results.push(`t482 ${mode} ${width}px: horizontal cards, one reminder, reachable CTA, no overflow: pass`);
      await close(o);
    }
  }
  for (const level of [10, 41, 50]) {
    const o = await open({ m3: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, { stars: 3, best: 3000 }])), volumeAwards: [1, 2, 3, 4, 5] }, 375);
    await main(o.page, level);
    const expected = await o.page.evaluate(async (id) => {
      const { LEVELS } = await import("/src/game/levels.ts");
      const { enemyForLevel } = await import("/src/game/combat.ts");
      return enemyForLevel(LEVELS.find((l) => l.id === id));
    }, level);
    const intel = await o.page.getByTestId("cb-preview").innerText();
    assert.ok(intel.includes(expected.name) && intel.includes(String(expected.hp)) && intel.includes(`每 ${expected.attackEvery} 步出手`));
    assert.ok((await o.page.getByTestId("m3-intro").innerText()).includes(`第 ${level} 關`));
    await o.page.screenshot({ path: `screenshots/team-prep-stage-${level}-375.png` });
    results.push(`t482 main stage ${level} reads correct live enemy/HP/interval: pass`);
    await close(o);
  }
  await writeFile("quick-equip-ui-results.json", JSON.stringify(results, null, 2));
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
