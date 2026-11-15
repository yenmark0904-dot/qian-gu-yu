import assert from "node:assert/strict";
import { test } from "node:test";
import { nextStoryStop } from "./story-playback.ts";
import { MAIN_PROLOGUE_TEXT, MAIN_STORIES } from "./main-story.ts";
import { parseQinVolume, nextQinIndex, qinChoiceIndex } from "./qin-vn.ts";
import { parsePrologue } from "./prologue-vn.ts";
const PROLOGUE_BEATS = parsePrologue(MAIN_PROLOGUE_TEXT);

test("skip stops before the prologue choice; choice/end are no-ops", () => {
  const choice = PROLOGUE_BEATS.findIndex((beat) => beat.kind === "choice");
  assert.ok(choice > 0);
  const next = (cursor: number) => cursor + 1;
  assert.equal(nextStoryStop(PROLOGUE_BEATS, 0, next), choice);
  assert.equal(nextStoryStop(PROLOGUE_BEATS, choice, next), choice);
  assert.equal(nextStoryStop(PROLOGUE_BEATS, choice + 1, next), PROLOGUE_BEATS.length);
  assert.equal(nextStoryStop(PROLOGUE_BEATS, PROLOGUE_BEATS.length, next), PROLOGUE_BEATS.length);
});

test("skip follows each selected Qin branch without choosing or reading sibling branches", () => {
  for (const story of MAIN_STORIES) {
    const beats = parseQinVolume(story.text);
    const next = (cursor: number) => nextQinIndex(beats, cursor);
    const choice = nextStoryStop(beats, 0, next);
    assert.equal(beats[choice].kind, "choice");
    assert.equal(nextStoryStop(beats, choice, next), choice);
    for (const id of ["A", "B", "C"] as const) {
      const branch = qinChoiceIndex(beats, choice, id);
      assert.notEqual(branch, null);
      assert.equal(nextStoryStop(beats, branch!, next), beats.length);
    }
  }
});

test("skip traversal terminates even if malformed path loops", () => {
  assert.equal(
    nextStoryStop([{ kind: "dialogue" }], 0, () => 0),
    0,
  );
});
