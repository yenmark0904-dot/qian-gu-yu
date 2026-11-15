import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { WU_STORIES } from "./main-story.ts";
import { walkQin, type QinBeat, type QinChoiceId } from "./qin-vn.ts";
import { storyQuotedSpeech, storyVoiceJapanese } from "./story-voice.ts";
import { WU_VN_STORIES } from "./wu-vn-script.ts";
import { parseWuVolume } from "./wu-vn.ts";

const CAST = new Set(["我", "月", "周瑜", "船家", "？？？", "陸遜", "甘寧", "墨厄", "水中的聲音", "婦人", "將軍"]);

function shown(path: QinBeat[]): string[] {
  return path.flatMap((beat) => (beat.kind === "dialogue" || beat.kind === "narration" || beat.kind === "title" ? [beat.text] : []));
}

test("三國篇 has ten VN volumes matching the verbatim chapter", () => {
  assert.equal(WU_STORIES.length, 10);
  assert.deepEqual(WU_VN_STORIES.map((s) => [s.volume, s.place, s.title]), WU_STORIES.map((s) => [s.volume, s.place, s.title]));
  assert.deepEqual(WU_STORIES.map((s) => s.title), [
    "琴弦未斷", "水底有人答", "軍報未批", "聽見的人", "說不出口的話", "暗室無燈", "這一回，請你幫我", "容我一聲錯", "你靠近時", "江水未歇",
  ]);
});

test("every prose line plays verbatim, in order, with no production tags", () => {
  for (const story of WU_STORIES) {
    const beats = parseWuVolume(story.volume);
    const source = story.text.split("\n");
    const expected = story.volume === 10 ? [...source, "第三章・完"] : source;
    const path = shown(walkQin(beats, "A"));
    assert.deepEqual(path, expected, `volume ${story.volume} text drifted`);
    for (const id of ["A", "B", "C"] as QinChoiceId[]) {
      const body = shown(walkQin(beats, id)).join("\n");
      assert.doesNotMatch(body, /【|^[^「\n]{1,6}：「/m, `volume ${story.volume} leaked tags on ${id}`);
    }
  }
});

test("spoken lines carry a nameplate from the chapter cast; narration has none", () => {
  for (const story of WU_STORIES) {
    for (const beat of parseWuVolume(story.volume)) {
      if (beat.kind === "dialogue") {
        assert.ok(CAST.has(beat.speaker), `unknown speaker ${beat.speaker}`);
        assert.ok(beat.text.startsWith("「"));
        assert.equal(beat.thought, false);
      }
      if (beat.kind === "narration") assert.ok(!beat.text.startsWith("「"), `quoted line left as narration: ${beat.text}`);
    }
  }
  const v1 = parseWuVolume(1);
  const intro = v1.find((beat) => beat.kind === "dialogue" && beat.text === "「姑娘既能看見異狀，方便與本都督談談嗎？」");
  assert.equal(intro?.kind === "dialogue" ? intro.speaker : "", "周瑜");
});

test("volumes 1–9 are linear; only volume 10 pauses for the hug/kiss choice", () => {
  for (const story of WU_STORIES) {
    const choices = parseWuVolume(story.volume).filter((beat) => beat.kind === "choice");
    assert.equal(choices.length, story.volume === 10 ? 1 : 0, `volume ${story.volume}`);
  }
});

test("volume 10: kiss only on A, hug only on A/B, C keeps distance; all paths reach the hook", () => {
  const beats = parseWuVolume(10);
  const segment = (id: QinChoiceId) => {
    const lines = shown(walkQin(beats, id));
    const from = lines.indexOf("你原本想笑，眼眶卻先熱了。");
    const to = lines.indexOf("直到船家又在遠處喊了一聲啟程，他才替你理好肩上的繫帶。");
    return { branch: lines.slice(from + 1, to).join("\n"), all: lines };
  };
  const a = segment("A");
  const b = segment("B");
  const c = segment("C");
  assert.match(a.branch, /吻/);
  assert.match(a.branch, /抱住他的腰/);
  assert.doesNotMatch(b.branch, /吻/);
  assert.match(b.branch, /抱住他的腰/);
  assert.doesNotMatch(c.branch, /吻|抱|懷裡|收緊手臂/);
  for (const path of [a, b, c]) {
    assert.match(path.branch, /累的時候，記得讓人知道。/);
    assert.equal(path.all.at(-1), "第三章・完");
    assert.ok(path.all.includes("「往後走。」") && path.all.includes("「這裡有我。」"));
  }
  const all = WU_VN_STORIES.map((s) => s.text).join("\n");
  assert.doesNotMatch(all, /一定回來|永遠等你|第四章|第六章/);
});

test("voiced 三國篇 lines all have Japanese TTS text", () => {
  for (const story of WU_STORIES) {
    for (const beat of parseWuVolume(story.volume)) {
      if (beat.kind !== "dialogue") continue;
      const spoken = storyQuotedSpeech(beat.text).join("\n");
      assert.ok(storyVoiceJapanese(spoken), `no JA for ${beat.speaker} ${beat.text}`);
    }
  }
});

test("三國篇 VN script stays in sync with /workspace/bg", { skip: !existsSync("/workspace/bg/ch3_wu_vn.json") }, () => {
  const vn = JSON.parse(readFileSync("/workspace/bg/ch3_wu_vn.json", "utf8")) as { stories: { volume: number; text: string }[] };
  assert.deepEqual(vn.stories.map((s) => s.text), WU_VN_STORIES.map((s) => s.text));
  const user = JSON.parse(readFileSync("/workspace/bg/ch3_wu_user.json", "utf8")) as { stories: { volume: number; text: string }[] };
  assert.deepEqual(user.stories.map((s) => s.text), WU_STORIES.map((s) => s.text));
});
