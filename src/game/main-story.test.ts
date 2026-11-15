import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHAPTERS, type LevelRecord } from "./levels.ts";
import {
  HAN_STORIES,
  MAIN_PROLOGUE_TEXT,
  MAIN_STORIES,
  QI_CHAPTER_TITLE,
  QI_HERO,
  QI_HERO_ID,
  QI_STORIES,
  TANG_CHAPTER_TITLE,
  TANG_HERO,
  TANG_HERO_ID,
  TANG_STORIES,
  WU_CHAPTER_TITLE,
  WU_HERO,
  WU_HERO_ID,
  WU_STORIES,
  cleanMainStoryHanRead,
  cleanMainStoryQiRead,
  cleanMainStoryTangRead,
  cleanMainStoryWuRead,
  isHanChapterUnlocked,
  isHanVolumeUnlocked,
  isQiChapterUnlocked,
  isQiVolumeUnlocked,
  isTangChapterUnlocked,
  isTangVolumeUnlocked,
  isWuChapterUnlocked,
  isWuVolumeUnlocked,
  currentStoryChapterLabel,
  currentStoryChapterTab,
  HAN_CHAPTER_TITLE,
  MAIN_CHAPTER_TITLE,
  MAIN_PROLOGUE_TITLE,
  nextAutoMainStory,
  nextChainedMainStory,
} from "./main-story.ts";
import { sanitizeSnapshot, type Snapshot } from "./cloud-save.ts";

const QIN = JSON.parse(
  readFileSync(new URL("../../../bg/ch1_qin_user.json", import.meta.url), "utf8"),
);
const PRO = JSON.parse(
  readFileSync(new URL("../../../bg/prologue_user.json", import.meta.url), "utf8"),
);
const HAN = JSON.parse(
  readFileSync(new URL("../../../bg/ch2_han_user.json", import.meta.url), "utf8"),
);
const WU = JSON.parse(
  readFileSync(new URL("../../../bg/ch3_wu_user.json", import.meta.url), "utf8"),
);
const QI = JSON.parse(
  readFileSync(new URL("../../../bg/ch4_lanling_vn.json", import.meta.url), "utf8"),
);
const TANG = JSON.parse(
  readFileSync(new URL("../../../bg/ch5_libai_vn.json", import.meta.url), "utf8"),
);

test("prologue + qin + han untouched verbatim", () => {
  assert.equal(MAIN_PROLOGUE_TEXT, PRO.text);
  for (let i = 0; i < 10; i++) {
    assert.equal(MAIN_STORIES[i].text, QIN.stories[i].text);
    assert.equal(HAN_STORIES[i].text, HAN.stories[i].text);
    assert.equal(HAN_STORIES[i].title, HAN.stories[i].title);
  }
  assert.equal(HAN_STORIES[8].title, "再看朕一眼");
  assert.equal(HAN_STORIES[8].title.codePointAt(2), 0x6715);
});

test("三國篇十卷 verbatim from ch3_wu_user.json", () => {
  assert.equal(WU_CHAPTER_TITLE, WU.chapterTitle);
  assert.equal(WU_HERO, WU.hero);
  assert.equal(WU_HERO_ID, "zhouyu");
  assert.equal(WU_HERO, "周瑜・公瑾");
  assert.equal(WU_HERO.codePointAt(1), 0x745c); // 瑜
  assert.equal(WU_STORIES.length, 10);
  assert.equal(WU_STORIES[0].title, "琴弦未斷");
  assert.equal(WU_STORIES[0].place, "江渡");
  assert.equal(
    WU_STORIES.some((s) => s.text.includes("第三章・完")),
    false,
  );
  assert.ok(WU_STORIES[5].text.includes("——是我。燈影在門下，可看得見？"));
  assert.ok(WU_STORIES[6].text.includes("——我會看你。"));
  for (let i = 0; i < 10; i++) {
    assert.equal(WU_STORIES[i].volume, WU.stories[i].volume);
    assert.equal(WU_STORIES[i].place, WU.stories[i].place);
    assert.equal(WU_STORIES[i].title, WU.stories[i].title);
    assert.equal(WU_STORIES[i].text, WU.stories[i].text, `wu ${i + 1}`);
  }
});

test("北齊篇十卷 verbatim from current branching user script", () => {
  assert.equal(QI_CHAPTER_TITLE, QI.title);
  assert.equal(QI_HERO, QI.hero);
  assert.equal(QI_HERO_ID, "lanling");
  assert.equal(QI_STORIES.length, 10);
  assert.equal(
    QI_STORIES.some((s) => s.text.includes("第四章・完")),
    false,
  );
  assert.ok(QI_STORIES[0].text.includes("我抵達這個時代時，先看見一張面具。"));
  for (let i = 0; i < 10; i++) {
    assert.equal(QI_STORIES[i].volume, QI.stories[i].volume);
    assert.equal(QI_STORIES[i].place, QI.stories[i].place);
    assert.equal(QI_STORIES[i].title, QI.stories[i].title);
    assert.equal(QI_STORIES[i].text, QI.stories[i].text, `qi ${i + 1}`);
  }
});

test("唐朝篇十卷 verbatim from current branching user script", () => {
  assert.equal(TANG_CHAPTER_TITLE, TANG.title);
  assert.equal(TANG_CHAPTER_TITLE, "唐朝篇");
  assert.equal(TANG_HERO, TANG.hero);
  assert.equal(TANG_HERO, "李白・太白");
  assert.equal(TANG_HERO_ID, "libai");
  assert.equal(TANG_STORIES.length, 10);
  assert.equal(TANG_STORIES[0].title, "桃花與酒");
  assert.equal(TANG_STORIES[0].place, "桃溪");
  assert.equal(TANG_STORIES[9].title, "清醒地告別");
  assert.equal(
    TANG_STORIES.some((s) => s.text.includes("第五章・完")),
    false,
  );
  const joined = TANG_STORIES.map((s) => s.text).join("");
  for (const name of ["杜甫", "子美", "高適", "達夫"]) assert.ok(joined.includes(name));
  for (let i = 0; i < 10; i++) {
    assert.equal(TANG_STORIES[i].volume, TANG.stories[i].volume);
    assert.equal(TANG_STORIES[i].place, TANG.stories[i].place);
    assert.equal(TANG_STORIES[i].title, TANG.stories[i].title);
    assert.equal(TANG_STORIES[i].text, TANG.stories[i].text, `tang ${i + 1}`);
  }
});

test("Han Wu Qi Tang stay locked while later chapters are being rewritten", () => {
  assert.equal(isHanChapterUnlocked([]), false);
  assert.equal(isHanChapterUnlocked([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), false);
  assert.equal(isHanVolumeUnlocked(1), false);
  assert.equal(isWuChapterUnlocked(), false);
  assert.equal(isWuVolumeUnlocked(10), false);
  assert.equal(isQiChapterUnlocked(), false);
  assert.equal(isQiVolumeUnlocked(10), false);
  assert.equal(isTangChapterUnlocked(), false);
  assert.equal(isTangVolumeUnlocked(1), false);
  assert.equal(isTangVolumeUnlocked(10), false);
});

test("home and 三消 label follows the current story chapter", () => {
  const done = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(currentStoryChapterLabel(false), MAIN_PROLOGUE_TITLE);
  assert.equal(currentStoryChapterTab(false), 1);
  assert.equal(currentStoryChapterLabel(true, [1, 2]), MAIN_CHAPTER_TITLE);
  assert.equal(currentStoryChapterLabel(true, done), MAIN_CHAPTER_TITLE);
  assert.equal(currentStoryChapterTab(true, done), 1);
  assert.equal(currentStoryChapterLabel(true, done, done), MAIN_CHAPTER_TITLE);
  assert.equal(currentStoryChapterLabel(true, done, done, done), MAIN_CHAPTER_TITLE);
  assert.equal(currentStoryChapterLabel(true, done, done, done, done), MAIN_CHAPTER_TITLE);
  assert.equal(currentStoryChapterLabel(true, done, done, done, done, done), MAIN_CHAPTER_TITLE);
  assert.equal(currentStoryChapterTab(true, done, done, done, done, done), 1);
  const hall = readFileSync(new URL("../components/game/Hall.tsx", import.meta.url), "utf8");
  assert.ok(hall.includes("currentStoryChapterLabel") && hall.includes("{chapterLabel}"));
  assert.ok(!hall.includes("三消 · 闖關"));
});

test("map-mount autoplay skips later chapters; finishing 秦朝 does not open locked sequels", () => {
  assert.equal(nextAutoMainStory({}, [], false), "prologue");
  assert.deepEqual(nextAutoMainStory({}, [], true), { chapter: 1, volume: 1 });
  const qinDone = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const cleared: Record<string, LevelRecord> = { "50": { stars: 1, best: 1 } };
  assert.equal(
    nextAutoMainStory(cleared, qinDone, true, [], [], [], []),
    null,
    "no later dump on mount",
  );
  assert.equal(
    nextChainedMainStory({ chapter: 1, volume: 10 }, cleared, qinDone, [], [], [], []),
    null,
  );
  assert.equal(
    nextChainedMainStory({ chapter: 2, volume: 10 }, cleared, qinDone, qinDone, [], [], []),
    null,
  );
  assert.equal(
    nextChainedMainStory({ chapter: 3, volume: 10 }, cleared, qinDone, qinDone, qinDone, [], []),
    null,
  );
  assert.equal(
    nextChainedMainStory(
      { chapter: 4, volume: 10 },
      cleared,
      qinDone,
      qinDone,
      qinDone,
      qinDone,
      [],
    ),
    null,
  );
  assert.equal(
    nextChainedMainStory(
      { chapter: 5, volume: 1 },
      cleared,
      qinDone,
      qinDone,
      qinDone,
      qinDone,
      [1],
    ),
    null,
  );
});

test("cloud sanitize tang + backward compatible", () => {
  const d = sanitizeSnapshot({
    mainStoryRead: [1, 10],
    mainStoryPrologueRead: true,
    mainStoryHanRead: [1, 9],
    mainStoryWuRead: [1, 0, 11, "2"],
    mainStoryQiRead: [1, 0, 11, "5"],
    mainStoryTangRead: [2, 0, 99, "7"],
    mainStoryQinPlay: {
      volume: 3,
      beat: 8,
      done: false,
      positions: { "3": 8, "99": 1 },
      finished: { "3": false },
      choices: { "3": "C", bad: "A" },
    },
    owned: {},
  });
  assert.ok(d.ok);
  const data = (d as { ok: true; data: Snapshot }).data;
  assert.deepEqual(data.mainStoryWuRead, [1, 2]);
  assert.deepEqual(data.mainStoryQiRead, [1, 5]);
  assert.deepEqual(data.mainStoryTangRead, [2, 7]);
  assert.deepEqual(cleanMainStoryTangRead([1, 99, 0]), [1]);
  assert.deepEqual(cleanMainStoryQiRead([1, 99, 0]), [1]);
  assert.deepEqual(cleanMainStoryHanRead([10]), [10]);
  const old = sanitizeSnapshot({ mainStoryRead: [1], owned: {} });
  assert.ok(old.ok);
  assert.deepEqual((old as { ok: true; data: Snapshot }).data.mainStoryWuRead, []);
  assert.deepEqual((old as { ok: true; data: Snapshot }).data.mainStoryQiRead, []);
  assert.deepEqual((old as { ok: true; data: Snapshot }).data.mainStoryTangRead, []);
  assert.equal((old as { ok: true; data: Snapshot }).data.mainStoryPrologueRead, false);
  assert.deepEqual(data.mainStoryQinPlay, {
    volume: 3,
    beat: 8,
    done: false,
    positions: { "3": 8 },
    finished: {},
    choices: { "3": "C" },
  });
  assert.equal((old as { ok: true; data: Snapshot }).data.mainStoryQinPlay, null);
});

test("Match3 chapter tabs + Tang wiring; no AdultGate", () => {
  const m3 = readFileSync(new URL("../components/game/Match3.tsx", import.meta.url), "utf8");
  const journey = readFileSync(
    new URL("../components/game/StoryJourney.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(m3.includes("<StoryJourney"));
  assert.ok(journey.includes("main-story-chapter-tabs") && journey.includes("main-story-tab-"));
  assert.ok(
    journey.includes("WU_STORIES") &&
      journey.includes("QI_STORIES") &&
      journey.includes("TANG_STORIES") &&
      !m3.includes("nextChainedMainStory") && !m3.includes("nextAutoMainStory"),
  );
  assert.ok(journey.includes("TANG_CHAPTER_NAME") && journey.includes("唐朝篇"));
  assert.ok(journey.includes("LATER_CHAPTER_LOCK_REASON"));
  assert.ok(!journey.includes("預覽校對 · 十卷可自由閱讀"));
  assert.ok(!m3.includes("讀完秦朝篇卷十後解鎖"));
  const reader = readFileSync(new URL("../components/game/MainStory.tsx", import.meta.url), "utf8");
  assert.ok(
    reader.includes("TANG_HERO") && reader.includes("QI_HERO") && !reader.includes("AdultGate"),
  );
  assert.ok(CHAPTERS.length === 5);
});


test("unified journey embeds stages after Qin cards without a hidden story tab", () => {
  const map = readFileSync(new URL("../components/game/Match3.tsx", import.meta.url), "utf8");
  const journey = readFileSync(new URL("../components/game/StoryJourney.tsx", import.meta.url), "utf8");
  assert.ok(!map.includes("journey-page-tabs"));
  assert.ok(map.includes("renderLevels={(volume)"));
  assert.ok(journey.includes("renderLevels?.(s.volume)"));
  assert.ok(journey.includes('id={`journey-era-${chapter}`}'));
  assert.ok(journey.includes("scrollIntoView"));
  assert.ok(journey.includes('data-testid="main-story-btn-prologue"'));
});
