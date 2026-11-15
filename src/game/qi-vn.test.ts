import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { QI_STORIES } from "./main-story.ts";
import { QI_VN_STORIES } from "./qi-vn-script.ts";
import { parseQiVolume } from "./qi-vn.ts";
import { walkQin, qinChoiceIndex, qinResumeIndex, cleanMainStoryQinPlay, type QinBeat, type QinChoiceId } from "./qin-vn.ts";
import { storyQuotedSpeech, storyVoiceJapanese } from "./story-voice.ts";
import { storyVoiceId } from "./story-voice-cast.ts";
import { sanitizeSnapshot, SNAPSHOT_KEYS } from "./cloud-save.ts";

const source = readFileSync(new URL("../../../bg/ch4/lanling_user.txt", import.meta.url), "utf8");
const sections = [...source.matchAll(/^## 卷([一二三四五六七八九十]+)・([^《]+)《([^》]+)》\s*$/gm)];
const SPEAKERS = /^(?:高長恭|我(?:（心聲）)?|月|婦人|士卒|梁伯|同伴|墨厄|傳令兵|副將|陌生男子|店家)：/;
const visible = (path: QinBeat[]) => path.flatMap(b => "text" in b ? [b.text] : []);
const content = (block: string) => block.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("【")).map(l => l.replace(SPEAKERS, ""));
function blocks(volume: number) {
  const text = QI_VN_STORIES[volume - 1].text;
  const [pre, rest] = text.split("【玩家選項】");
  const [branching, common] = rest.split("【共同劇情】");
  const options = Object.fromEntries([...branching.matchAll(/^([ABC])\.\s*(.+)$/gm)].map(m => [m[1], m[2]]));
  const branch = Object.fromEntries([...branching.matchAll(/【分支 ([ABC])】([\s\S]*?)【分支結束】/g)].map(m => [m[1], m[2]]));
  return { pre, common, options, branch };
}

test("Chapter 4 has ten volumes and preserves every supplied character, excluding only notes/headings", () => {
  assert.equal(sections.length, 10);
  assert.deepEqual(QI_STORIES, QI_VN_STORIES);
  assert.deepEqual(QI_STORIES.map(s => [s.place, s.title]), [
    ["雪關","面具還在"], ["燈帳","誰先被救"], ["借傷","疼著才像還了"], ["舊夢","那夜活著的人"],
    ["薄雪","不是誰的傷都要你受"], ["藏面","面具後的人"], ["墨甲","若仍有人死去"],
    ["守城","請你們接住我"], ["春信","活下來之後"], ["歸雪","這次為自己"],
  ]);
  sections.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = sections[i + 1]?.index ?? source.length;
    assert.equal(QI_STORIES[i].text, source.slice(start, end).trim());
  });
  const json = JSON.parse(readFileSync(new URL("../../../bg/ch4_lanling_vn.json", import.meta.url), "utf8"));
  assert.deepEqual(json.stories, QI_VN_STORIES);
});

test("all 30 paths play the selected option once, only that branch, then jump directly to common plot", () => {
  for (let v = 1; v <= 10; v++) {
    const beats = parseQiVolume(v);
    const choices = beats.filter(b => b.kind === "choice");
    assert.equal(choices.length, 1, `volume ${v}`);
    assert.deepEqual(choices[0].choices.map(c => c.id), ["A", "B", "C"]);
    const { pre, common, options, branch } = blocks(v);
    for (const id of ["A", "B", "C"] as QinChoiceId[]) {
      const actual = visible(walkQin(beats, id));
      const expected = [...content(pre), options[id], ...content(branch[id]), ...content(common)];
      assert.deepEqual(actual, expected, `wording/order/branch mismatch at ${v}${id}`);
      assert.equal(actual.filter(t => t === options[id]).length, 1, `option repeated ${v}${id}`);
      assert.doesNotMatch(actual.join("\n"), /【|給 Grok|實裝說明|分支結束|共同劇情/);
      const index = beats.findIndex(b => b.kind === "choice");
      const target = qinChoiceIndex(beats, index, id)!;
      assert.equal((beats[target] as {text: string}).text, options[id]);
    }
  }
});

const chosen = (v: number, id: QinChoiceId) => {
  const path = walkQin(parseQiVolume(v), id);
  const choice = path.findIndex(b => b.kind === "choice");
  const commonLength = content(blocks(v).common).length;
  return visible(path.slice(choice + 1)).slice(0, -commonLength).join("\n");
};

test("volume 6 offers attraction or medical distance; volume 9 hug/hand/sitting remain exclusive", () => {
  assert.match(chosen(6, "A"), /你生得很好看/);
  assert.doesNotMatch(chosen(6, "C"), /薄紅|好看|坐近/);
  assert.match(chosen(6, "C"), /先專心處理傷/);
  const a = chosen(9, "A"), b = chosen(9, "B"), c = chosen(9, "C");
  assert.match(a, /輕輕抱住/); assert.match(a, /短暫回抱/);
  assert.doesNotMatch(a, /掌心輕輕握住/);
  assert.match(b, /掌心輕輕握住/); assert.doesNotMatch(b, /抱住|回抱/);
  assert.match(c, /依我的指點坐下/); assert.doesNotMatch(c, /抱住|回抱|掌心輕輕握住/);
});

test("volume 10 voluntary kiss only on A, hug only on B, wave on C; common plot adds none", () => {
  const a = chosen(10, "A"), b = chosen(10, "B"), c = chosen(10, "C");
  assert.match(a, /清楚地點頭/); assert.match(a, /吻上他的唇/);
  assert.doesNotMatch(a, /我靠在不壓傷的位置/);
  assert.match(b, /我靠在不壓傷的位置/); assert.doesNotMatch(b, /吻/);
  assert.match(c, /向他揮手/); assert.doesNotMatch(c, /吻上|我靠在不壓傷的位置/);
  for (const v of [6,9,10]) assert.doesNotMatch(content(blocks(v).common).join("\n"), /吻|擁抱|回抱|抱住|牽手|握住/);
  for (let v = 1; v <= 10; v++) assert.ok(walkQin(parseQiVolume(v), "C").length > 0);
  const end = blocks(10).common;
  assert.match(end, /山紋玉佩、馬形玉扣、琴囊/);
  assert.match(end, /會試著，為我自己/);
  assert.doesNotMatch(QI_STORIES.map(s => s.text).join("\n"), /第六章|一定重逢|永遠等你|月老/);
});

test("volume 8 retains serious casualties, staged care and rescue on every route", () => {
  for (const id of ["A", "B", "C"] as QinChoiceId[]) {
    const path = visible(walkQin(parseQiVolume(8), id)).join("\n");
    assert.match(path, /陳伍長，未能救回/);
    assert.match(path, /壓住的疼痛一陣陣湧回/);
    assert.match(path, /我與助手依早已排好的位置扶住他/);
    assert.match(path, /我們將他穩穩移回榻上/);
    assert.doesNotMatch(path, /擁抱|吻|復生/);
  }
  const rule = QI_STORIES[6].text;
  assert.match(rule, /那些曾借走的傷不會再傷害原本的人/);
  assert.match(rule, /儀式期間他不能回到城頭/);
});

test("all 199 spoken lines have Japanese TTS, true nameplates, thoughts stay silent, cast remains locked", () => {
  let spoken = 0, thoughts = 0;
  const cast = new Set(["高長恭","我","月","婦人","士卒","梁伯","同伴","墨厄","傳令兵","副將","陌生男子","店家"]);
  for (let v = 1; v <= 10; v++) for (const b of parseQiVolume(v)) {
    if (b.kind !== "dialogue") continue;
    assert.ok(cast.has(b.speaker), b.speaker);
    if (b.thought) { thoughts++; continue; }
    spoken++;
    const ja = storyVoiceJapanese(storyQuotedSpeech(b.text).join("\n"));
    assert.match(ja, /[ぁ-んァ-ン]/, `no Japanese for ${v} ${b.text}`);
  }
  assert.equal(spoken, 199); assert.equal(thoughts, 1);
  assert.equal(storyVoiceId("高長恭"), "6nHtrY0bdH4FDasnUelr");
  assert.equal(storyVoiceId("蘭陵王"), storyVoiceId("高長恭"));
  assert.equal(storyVoiceId("我"), "bss6xwA9ygVKRihgIbhZ");
  assert.equal(storyVoiceId("月"), "BWN0mOtkGHghA3CYFzFK");
  assert.equal(storyVoiceId("墨厄"), "auoHciLZJwKTwYUoRTYz");
});

test("local/cloud cursor retains volume, chosen branch, dialogue position and intimacy decisions", () => {
  const beats = parseQiVolume(10), ci = beats.findIndex(b => b.kind === "choice");
  for (const id of ["A", "B", "C"] as QinChoiceId[]) {
    const at = qinChoiceIndex(beats, ci, id)! + 1;
    const play = cleanMainStoryQinPlay({ volume: 10, beat: at, done: false, positions: {6: 4,9: 7,10: at}, finished: {}, choices: {6:"C",9:"B",10:id} })!;
    const sanitized = sanitizeSnapshot({owned:{}, mainStoryQiPlay:play});
    assert.ok(sanitized.ok);
    if (!sanitized.ok) continue;
    const saved = sanitized.data.mainStoryQiPlay!;
    assert.deepEqual(saved, play);
    assert.equal(qinResumeIndex(10, beats, saved), at);
    assert.deepEqual(saved.choices, {6:"C",9:"B",10:id});
  }
  assert.ok(SNAPSHOT_KEYS.includes("mainStoryQiPlay"));
  const older = sanitizeSnapshot({owned:{}}); assert.ok(older.ok);
  if (older.ok) assert.equal(older.data.mainStoryQiPlay, null);
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.match(store, /mainStoryQiPlay: cleanMainStoryQinPlay\(p.mainStoryQiPlay\)/);
  assert.match(store, /setMainStoryQiPlay/);
});
