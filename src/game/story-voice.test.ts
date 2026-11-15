import test from "node:test";
import assert from "node:assert/strict";
import { HAN_STORIES, MAIN_PROLOGUE_TEXT, MAIN_STORIES, TANG_STORIES, WU_STORIES } from "./main-story.ts";
import { parseQiVolume } from "./qi-vn.ts";
import { parseQinVolume } from "./qin-vn.ts";
import { parsePrologue } from "./prologue-vn.ts";
import { parseTangVolume } from "./tang-vn.ts";
import { parseWuVolume } from "./wu-vn.ts";
import { STORY_VOICE_LANGUAGE_CODE } from "./story-voice-cast.ts";
import { storyQuotedSpeech, storyVoiceChunks, storyVoiceJapanese, storyVoiceLines, storyVoiceProfile, storyVoiceSpeakable, storyVoiceSpokenText } from "./story-voice.ts";

test("chunks drop symbols and keep the spoken words", () => {
  const text = "「怎麼大家都有這麼多願望啊？」";
  assert.deepEqual(storyVoiceChunks(text), ["怎麼大家都有這麼多願望啊"]);
  assert.equal(storyVoiceSpeakable(text), "怎麼大家都有這麼多願望啊");
  assert.deepEqual(storyVoiceChunks("你好。還好！？\n等我……別走......再見"), ["你好", "還好", "等我", "別走", "再見"]);
  assert.deepEqual(storyVoiceChunks("「……」"), []);
  assert.deepEqual(storyVoiceChunks("  \n  "), []);
  assert.deepEqual(storyVoiceChunks(""), []);
});

test("long unpunctuated prose stays bounded and loses no words", () => {
  const text = "天地玄黃宇宙洪荒".repeat(30) + "。";
  const chunks = storyVoiceChunks(text);
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 40));
  assert.equal(chunks.join(""), text.replace(/。/g, ""));
});

test("volume bodies yield only quoted speech", () => {
  const text = `祭壇上的燭火熄滅時，你正寫完最後一道祝詞。
「別怕，閉上眼睛！」
一道清亮的聲音忽然響起。
「找到了。」那聲音在你耳畔輕輕說，「這次要救的人。」`;
  assert.deepEqual(storyQuotedSpeech(text), ["別怕，閉上眼睛！", "找到了。", "這次要救的人。"]);
});

test("speaker profiles distinguish emperors, protagonist, guide and shadow", () => {
  for (const speaker of ["秦始皇", "秦始皇・贏政", "贏政", "嬴政", "始皇帝"]) {
    assert.deepEqual(storyVoiceProfile(speaker), { pitch: 0.75, rate: 0.92 });
  }
  assert.deepEqual(storyVoiceProfile("曹操"), { pitch: 0.8, rate: 0.95 });
  for (const speaker of ["我", "巫女"]) assert.deepEqual(storyVoiceProfile(speaker), { pitch: 1.12, rate: 1 });
  assert.deepEqual(storyVoiceProfile("月"), { pitch: 1.18, rate: 1.02 });
  for (const speaker of ["墨厄", "黑影"]) assert.deepEqual(storyVoiceProfile(speaker), { pitch: 0.68, rate: 0.88 });
  for (const speaker of ["", "旁白", "不明人物"]) assert.deepEqual(storyVoiceProfile(speaker), { pitch: 1, rate: 0.95 });
  for (const speaker of ["周瑜", "蘭陵王", "李白", "劉徹", "士兵", "？？？"]) assert.deepEqual(storyVoiceProfile(speaker), { pitch: 0.85, rate: 0.95 });
});

test("lines keep long speech whole; chunks still wrap for synth", () => {
  const text = "天地玄黃宇宙洪荒".repeat(6);
  const lines = storyVoiceLines(text);
  assert.deepEqual(lines, [text]);
  const chunks = storyVoiceChunks(text);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), text);
});

test("japanese lookup speaks Japanese and keeps 朕", () => {
  assert.equal(storyVoiceJapanese(""), "");
  assert.equal(storyVoiceJapanese("「……」"), "");
  assert.equal(storyVoiceJapanese("朕心悅你"), "朕は、そなたを想っている。");
  const wish = storyVoiceJapanese("「怎麼大家都有這麼多願望啊？」");
  assert.match(wish, /[ぁ-んァ-ン]/);
  const joined = storyVoiceJapanese("怎麼大家都有這麼多願望啊。神明大人也很忙的好不好");
  assert.ok(joined.includes("。"));
  assert.match(joined, /[ぁ-んァ-ン]/);
});

test("every main-story quoted line has Japanese speech", () => {
  const missing: string[] = [];
  for (const story of [...HAN_STORIES, ...WU_STORIES, ...TANG_STORIES]) {
    for (const quote of storyQuotedSpeech(story.text)) {
      const key = storyVoiceSpeakable(quote);
      if (key && !storyVoiceJapanese(quote)) missing.push(key);
    }
  }
  // Branching Chapter 4 voices only actual dialogue, never thoughts or narrative quotations.
  for (let v = 1; v <= 10; v++) for (const beat of [...parseQiVolume(v), ...parseTangVolume(v)]) {
    if (beat.kind !== "dialogue" || beat.thought) continue;
    const quote = storyQuotedSpeech(beat.text).join("\n");
    if (!storyVoiceJapanese(quote)) missing.push(quote);
  }
  assert.deepEqual(missing, []);
});

test("spoken main-story text is Chinese, never kana", () => {
  assert.equal(STORY_VOICE_LANGUAGE_CODE, "zh");
  assert.equal(storyVoiceSpokenText("朕心悅你"), "朕心悅你");
  assert.equal(storyVoiceSpokenText("「怎麼大家都有這麼多願望啊？」"), "怎麼大家都有這麼多願望啊");
  const kana = /[ぁ-んァ-ヶｦ-ﾟー]/;
  const found: string[] = [];
  const check = (raw: string) => {
    const spoken = storyVoiceSpokenText(raw);
    if (spoken && kana.test(spoken)) found.push(spoken);
  };
  for (const story of [...MAIN_STORIES, ...HAN_STORIES, ...WU_STORIES, ...TANG_STORIES]) {
    for (const quote of storyQuotedSpeech(story.text)) check(quote);
  }
  for (const beat of parsePrologue(MAIN_PROLOGUE_TEXT)) {
    if (beat.kind !== "dialogue" || beat.thought) continue;
    check(storyQuotedSpeech(beat.text).join("\n") || beat.text);
  }
  for (const story of MAIN_STORIES) {
    for (const beat of parseQinVolume(story.text)) {
      if (beat.kind !== "dialogue" || beat.thought) continue;
      check(storyQuotedSpeech(beat.text).join("\n") || beat.text);
    }
  }
  for (let v = 1; v <= 10; v++) {
    for (const beat of [...parseWuVolume(v), ...parseQiVolume(v), ...parseTangVolume(v)]) {
      if (beat.kind !== "dialogue" || beat.thought) continue;
      check(storyQuotedSpeech(beat.text).join("\n") || beat.text);
    }
  }
  assert.deepEqual(found, []);
});
