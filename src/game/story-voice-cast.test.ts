import test from "node:test";
import assert from "node:assert/strict";
import { storyVoiceCast, storyVoiceId } from "./story-voice-cast.ts";

test("story voice cast uses Chinese-native voices for Mandarin pronunciation", () => {
  for (const speaker of ["秦始皇", "秦始皇・嬴政", "嬴政", "贏政", "始皇帝"]) {
    assert.equal(storyVoiceCast(speaker).id, "qin");
    assert.equal(storyVoiceId(speaker), "pU9NaAwkoR3v0Mrg3uKz");
  }
  assert.equal(storyVoiceId("蘭陵王"), "6nHtrY0bdH4FDasnUelr");
  assert.equal(storyVoiceId("李白"), "bdt3B5N3GXM2nOc0SUW7");
  assert.equal(storyVoiceId("周瑜"), "brChkoggsUHF1stW6omH");
  assert.equal(storyVoiceId("劉徹"), "AAYMKjNBrET5q9uPiIQS");
  assert.equal(storyVoiceId("曹操"), "FS8UtxyDrvYcNCxVaziq");
  assert.equal(storyVoiceId("潘安"), "DA2aDl5DPFqDvHqbzlkZ");
  assert.equal(storyVoiceId("宋玉"), "nss5M23ZSzhG3Tn0b7wN");
  assert.equal(storyVoiceId("陸游"), "bZtjnyJAFD0Cp3lfNG5g");
  assert.equal(storyVoiceId("趙雲"), "D0xduROytBDuuCSH3aQy");
  assert.equal(storyVoiceId("諸葛亮"), "W8lBaQb9YIoddhxfQNLP");
  assert.equal(storyVoiceId("李世民"), "Z9RJEkFYQw307BCQULDR");
  assert.equal(storyVoiceId("霍去病"), "Qz42O0rKFmFBzAviAloi");
  assert.equal(storyVoiceId("司馬相如"), "E8c1bekb52tdh7tvpKVK");
  assert.equal(storyVoiceId("納蘭性德"), "fYmV8EanqZP9BI4WvpB7");
});

test("speakers without a pick get distinct fallback voices", () => {
  assert.equal(storyVoiceCast("我").id, "heroine");
  assert.equal(storyVoiceCast("巫女").id, "heroine");
  assert.equal(storyVoiceCast("幻影巫女").id, "heroine");
  assert.equal(storyVoiceId("幻影巫女"), storyVoiceId("我"));
  assert.equal(storyVoiceCast("月").id, "yue");
  assert.equal(storyVoiceCast("墨厄").id, "moe");
  assert.equal(storyVoiceCast("黑影").id, "moe");
  assert.equal(storyVoiceCast("士兵").id, "extra");
  assert.equal(storyVoiceCast("？？？").id, "extra");
  assert.equal(storyVoiceCast("").id, "extra");
  assert.equal(storyVoiceCast("旁白").id, "extra");
  const ids = new Set(["我", "月", "墨厄", "士兵"].map(storyVoiceId));
  assert.equal(ids.size, 4);
});

test("main-story fallback voices use Chinese-native picks", () => {
  for (const speaker of ["我", "巫女"]) {
    assert.equal(storyVoiceId(speaker), "bss6xwA9ygVKRihgIbhZ");
  }
  assert.equal(storyVoiceId("月"), "BWN0mOtkGHghA3CYFzFK");
  for (const speaker of ["墨厄", "黑影"]) {
    assert.equal(storyVoiceId(speaker), "auoHciLZJwKTwYUoRTYz");
  }
});
