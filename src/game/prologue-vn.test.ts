import assert from "node:assert/strict";
import { test } from "node:test";
import { MAIN_HERO, MAIN_PROLOGUE_TEXT } from "./main-story.ts";
import { parsePrologue, PROLOGUE_SCENES } from "./prologue-vn.ts";

const beats = parsePrologue(MAIN_PROLOGUE_TEXT);
const emperor = MAIN_HERO.split("・")[1];

test("the complete prologue parses into all scenes and one converging choice", () => {
  assert.equal(beats.length, 343);
  assert.deepEqual(new Set(beats.map((beat) => beat.background)), new Set(Object.values(PROLOGUE_SCENES)));
  const index = beats.findIndex((beat) => beat.kind === "choice");
  const choice = beats[index];
  assert.equal(choice.kind, "choice");
  if (choice.kind !== "choice") return;
  assert.deepEqual(choice.choices.map((item) => item.id), ["A", "B", "C"]);
  const following = beats[index + 1];
  assert.equal(following.kind, "dialogue");
  if (following.kind === "dialogue") assert.equal(following.speaker, "月");
  assert.equal(beats.filter((beat) => beat.kind === "choice").length, 1);
});

test("every actual line survives exactly and in order, including choices and punctuation", () => {
  const expected = MAIN_PROLOGUE_TEXT.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .filter((line) => !/^【(?:場景：.+|我・內心|祈願紙|玩家選項・序章關鍵互動|共同劇情)】$/.test(line))
    .map((line) => line.replace(/^【(?:音效|畫面|演出)】/, "").replace(/^[ABC]\.\s*/, "").replace(/^[^：「」]+：(「.*」)$/, "$1"));
  const actual = beats.flatMap((beat) => beat.kind === "choice" ? beat.choices.map((item) => item.text) : [beat.text]);
  assert.deepEqual(actual, expected);
});

test("thought blocks, prayer paper, and continuation lines use the right speakers", () => {
  const parsed = parsePrologue('【我・內心】\n想回家。\n「好累。」\n【祈願紙】\n「願你平安。」\n我：「嗯。」\n看著紙。\n「走吧。」\n月（小聲）：「好。」\n【演出】風起。');
  assert.deepEqual(parsed.filter((beat) => beat.kind === "dialogue").map((beat) => [beat.speaker, beat.thought, beat.sprite?.split("/").pop()]), [
    ["我", true, "witch.png"], ["我", false, "witch.png"], ["祈願紙", false, undefined],
    ["我", false, "witch.png"], ["我", false, "witch.png"], ["月", false, undefined],
  ]);
  assert.equal(parsed.at(-1)?.kind, "narration");
  assert.equal(parsed.at(-1)?.sprite, undefined);
});

test("quoted speech by the shrine maiden shows 我 and is not a thought", () => {
  const spoken = beats.find((beat) => beat.kind === "dialogue" && beat.text.includes("怎麼大家都有這麼多願望"));
  assert.equal(spoken?.kind, "dialogue");
  if (spoken?.kind !== "dialogue") return;
  assert.equal(spoken.speaker, "我");
  assert.equal(spoken.thought, false);
  const inner = beats.find((beat) => beat.kind === "dialogue" && beat.text.includes("今晚的月亮"));
  assert.equal(inner?.kind, "dialogue");
  if (inner?.kind !== "dialogue") return;
  assert.equal(inner.speaker, "我");
  assert.equal(inner.thought, true);
});

test("mysterious voice is invisible until the palace sword confrontation", () => {
  const unknown = beats.filter((beat) => beat.kind === "dialogue" && beat.speaker === "？？？");
  assert.ok(unknown.length > 0);
  for (const beat of unknown) {
    assert.equal(beat.sprite, beat.background === PROLOGUE_SCENES["秦宮・深夜"] ? "/cg/prologue/qin.png?v=15" : undefined);
  }
  const revealed = beats.filter((beat) => beat.kind === "dialogue" && beat.speaker === emperor);
  assert.equal(revealed.length, 3);
  for (const beat of revealed) assert.equal(beat.sprite, "/cg/prologue/qin.png?v=15");
  for (const beat of beats.filter((beat) => beat.kind === "dialogue" && ["月", "黑影", "侍衛"].includes(beat.speaker))) assert.equal(beat.sprite, undefined);
});

test("opening and closing unassigned quotations stay narration; title resets attribution", () => {
  assert.equal(beats[0].kind, "narration");
  assert.equal(beats.at(-1)?.kind, "narration");
  assert.equal(beats.at(-1)?.sprite, undefined);
  assert.equal(beats.filter((beat) => beat.kind === "title").length, 8);
  const parsed = parsePrologue('【音效】\n【場景：未知】\n聲音。');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].background, PROLOGUE_SCENES["山中神社・深夜"]);
});
