import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MAIN_STORIES } from "./main-story.ts";
import { cleanMainStoryQinPlay, nextQinIndex, parseQinVolume, qinChoiceIndex, walkQin, type QinBeat, type QinChoiceId } from "./qin-vn.ts";

const QIN = JSON.parse(readFileSync("/workspace/bg/ch1_qin_user.json", "utf8")) as {
  stories: { volume: number; title: string; text: string }[];
};

function spoken(beats: QinBeat[]): string[] {
  return beats.filter((beat) => beat.kind === "dialogue" || beat.kind === "narration" || beat.kind === "title")
    .map((beat) => ("text" in beat ? beat.text : ""));
}

function uniqueSnippet(id: QinChoiceId): string {
  if (id === "A") return "巫女？";
  if (id === "B") return "你在教朕做事？";
  return "你以為朕會信？";
}

test("every Qin volume parses into one choice with three exclusive branches", () => {
  for (const story of MAIN_STORIES) {
    const beats = parseQinVolume(story.text);
    const choices = beats.filter((beat) => beat.kind === "choice");
    assert.equal(choices.length, 1, `volume ${story.volume} should have one choice`);
    const choice = choices[0];
    if (choice.kind !== "choice") throw new Error("expected choice");
    assert.deepEqual(choice.choices.map((item) => item.id), ["A", "B", "C"]);
    const texts = new Set(spoken(beats).join("\n").split("\n"));
    void texts;
    for (const id of ["A", "B", "C"] as QinChoiceId[]) {
      const path = walkQin(beats, id);
      assert.ok(path.some((beat) => beat.kind === "choice"));
      assert.ok(!path.some((beat) => beat.kind === "goto"));
      const body = spoken(path).join("\n");
      assert.ok(!/【場景|【音效|【演出|【畫面|【玩家選項|【分支|【共同劇情|遊戲實裝建議/.test(body), `volume ${story.volume} leaked production tags on ${id}`);
    }
  }
});

test("unpicked Qin branches never appear on the chosen path", () => {
  const beats = parseQinVolume(MAIN_STORIES[0].text);
  const a = spoken(walkQin(beats, "A")).join("\n");
  const b = spoken(walkQin(beats, "B")).join("\n");
  const c = spoken(walkQin(beats, "C")).join("\n");
  assert.match(a, /巫女？/);
  assert.match(b, /你在教朕做事？/);
  assert.match(c, /擅闖禁宮，還想讓朕聽你辯解？/);
  assert.doesNotMatch(a, /你在教朕做事？/);
  assert.doesNotMatch(a, /擅闖禁宮，還想讓朕聽你辯解？/);
  assert.doesNotMatch(b, /巫女？/);
  assert.doesNotMatch(c, /巫女？/);
  assert.match(a, /突然，我的手腕一陣刺痛/);
  assert.match(b, /突然，我的手腕一陣刺痛/);
  assert.match(c, /突然，我的手腕一陣刺痛/);
  void uniqueSnippet;
});

test("Qin option speech appears when the branch does not already say it", () => {
  const beats = parseQinVolume(MAIN_STORIES[0].text);
  const a = spoken(walkQin(beats, "A")).join("\n");
  assert.match(a, /我真的不是刺客，我是巫女！/);
});

test("volume 9 only the kiss choice plays a kiss, and distance plays neither kiss nor hug", () => {
  const beats = parseQinVolume(MAIN_STORIES[8].text);
  const kiss = spoken(walkQin(beats, "A")).join("\n");
  const like = spoken(walkQin(beats, "B")).join("\n");
  const distance = spoken(walkQin(beats, "C")).join("\n");
  assert.match(kiss, /吻/);
  assert.match(like, /我也喜歡你/);
  assert.doesNotMatch(like, /吻/);
  assert.doesNotMatch(distance, /吻/);
  assert.doesNotMatch(distance, /抱/);
});

test("volume 10 never includes the hidden easter egg", () => {
  const beats = parseQinVolume(MAIN_STORIES[9].text);
  const all = spoken(beats).join("\n");
  assert.doesNotMatch(all, /未斷之線|月老|紅線/);
  assert.match(spoken(walkQin(beats, "A")).join("\n"), /山河有盡，燈火未熄/);
  assert.doesNotMatch(spoken(walkQin(beats, "A")).join("\n"), /伸手抱住他|吻了我的額頭|我一定回來見你/);
});

test("metadata lines before the first scene are not spoken", () => {
  const beats = parseQinVolume(MAIN_STORIES[0].text);
  const opening = spoken(walkQin(beats)).join("\n");
  assert.doesNotMatch(opening, /初次相遇/);
  assert.doesNotMatch(opening, /神社祭壇/);
});

test("choice navigation jumps over the other branches", () => {
  const beats = parseQinVolume(MAIN_STORIES[0].text);
  const choiceAt = beats.findIndex((beat) => beat.kind === "choice");
  const startA = qinChoiceIndex(beats, choiceAt, "A");
  const startB = qinChoiceIndex(beats, choiceAt, "B");
  assert.ok(startA !== null && startB !== null && startA !== startB);
  let i = startA!;
  const seen = new Set<number>();
  while (i < beats.length && !seen.has(i)) {
    seen.add(i);
    const beat = beats[i];
    if (beat.kind === "dialogue" || beat.kind === "narration") {
      assert.doesNotMatch(beat.text, /你在教朕做事？/);
    }
    i = nextQinIndex(beats, i);
  }
});

test("Qin JSON and MAIN_STORIES stay in lockstep", () => {
  assert.equal(MAIN_STORIES.length, QIN.stories.length);
  for (let i = 0; i < MAIN_STORIES.length; i += 1) {
    assert.equal(MAIN_STORIES[i].text, QIN.stories[i].text);
    assert.equal(MAIN_STORIES[i].title, QIN.stories[i].title);
  }
});

test("cleanMainStoryQinPlay keeps only legal Qin progress", () => {
  assert.equal(cleanMainStoryQinPlay(null), null);
  assert.equal(cleanMainStoryQinPlay({ volume: 99, beat: 1 }), null);
  const play = cleanMainStoryQinPlay({
    volume: 2,
    beat: 12,
    done: true,
    positions: { "2": 12, "11": 3, extra: 1 },
    finished: { "2": true, "3": "yes" },
    choices: { "2": "B", "11": "A", x: "C" },
  });
  assert.deepEqual(play, {
    volume: 2,
    beat: 12,
    done: true,
    positions: { "2": 12 },
    finished: { "2": true },
    choices: { "2": "B" },
  });
});
