import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TANG_STORIES } from "./main-story.ts";
import { TANG_VN_STORIES } from "./tang-vn-script.ts";
import { parseTangVolume } from "./tang-vn.ts";
import { parseQiVolume } from "./qi-vn.ts";
import { parseWuVolume } from "./wu-vn.ts";
import { walkQin, qinChoiceIndex, qinResumeIndex, cleanMainStoryQinPlay, type QinBeat, type QinChoiceId } from "./qin-vn.ts";
import { storyQuotedSpeech, storyVoiceJapanese } from "./story-voice.ts";
import { storyVoiceId } from "./story-voice-cast.ts";
import { sanitizeSnapshot, SNAPSHOT_KEYS } from "./cloud-save.ts";

const source = readFileSync(new URL("../../../bg/ch5/libai_user.txt", import.meta.url), "utf8");
const sections = [...source.matchAll(/^## 卷([一二三四五六七八九十]+)・([^《]+)《([^》]+)》\s*$/gm)];
const SPEAKERS = /^(?:李白|我|月|店家|杜甫|高適|月影之聲|賓客|師父之聲|墨厄|幻影)：/;
const ACTION = /^[^「」：]+：「[^「」]*」$/;
const visible = (path: QinBeat[]) => path.flatMap(b => "text" in b ? [b.text] : []);
const content = (block: string) => block.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("【")).map(l => l.replace(SPEAKERS, ""));
function blocks(volume: number) {
  const text = TANG_VN_STORIES[volume - 1].text;
  const [pre, rest] = text.split("【玩家選項】");
  const [branching, common] = rest.split("【共同劇情】");
  const options = Object.fromEntries([...branching.matchAll(/^([ABC])\.\s*(.+)$/gm)].map(m => [m[1], m[2]]));
  const branch = Object.fromEntries([...branching.matchAll(/【分支 ([ABC])】([\s\S]*?)【分支結束】/g)].map(m => [m[1], m[2]]));
  return { pre, common, options, branch };
}
const chosen = (v: number, id: QinChoiceId) => {
  const path = walkQin(parseTangVolume(v), id);
  const choice = path.findIndex(b => b.kind === "choice");
  const commonLength = content(blocks(v).common).length;
  return visible(path.slice(choice + 1)).slice(0, -commonLength).join("\n");
};
const common = (v: number) => content(blocks(v).common).join("\n");

test("Chapter 5 has ten volumes and preserves every supplied character, excluding only notes/headings", () => {
  assert.equal(sections.length, 10);
  assert.deepEqual(TANG_STORIES, TANG_VN_STORIES);
  assert.deepEqual(TANG_STORIES.map(s => [s.place, s.title]), [
    ["桃溪","桃花與酒"], ["春城","總有人懂你"], ["空杯","不懂，便不必再說"], ["赴宴","滿座皆知己"],
    ["幻庭","若這就是回家"], ["夜宿","你不必全懂"], ["遠行","留下去處的人"],
    ["醒宴","請容我不同意"], ["清晝","今日不借醉意"], ["山月","清醒地告別"],
  ]);
  sections.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = sections[i + 1]?.index ?? source.length;
    assert.equal(TANG_STORIES[i].text, source.slice(start, end).trim());
  });
  const joined = TANG_STORIES.map(s => s.text).join("\n");
  assert.doesNotMatch(joined, /給 Grok|實裝說明|不顯示為遊戲台詞/);
  const json = JSON.parse(readFileSync(new URL("../../../bg/ch5_libai_vn.json", import.meta.url), "utf8"));
  assert.deepEqual(json.stories, TANG_VN_STORIES);
});

test("all 30 paths play the selected option once, only that branch, then jump directly to common plot", () => {
  for (let v = 1; v <= 10; v++) {
    const beats = parseTangVolume(v);
    const choices = beats.filter(b => b.kind === "choice");
    assert.equal(choices.length, 1, `volume ${v}`);
    assert.deepEqual(choices[0].choices.map(c => c.id), ["A", "B", "C"]);
    const { pre, common, options, branch } = blocks(v);
    for (const id of ["A", "B", "C"] as QinChoiceId[]) {
      const actual = visible(walkQin(beats, id));
      const expected = [...content(pre), options[id], ...content(branch[id]), ...content(common)];
      assert.deepEqual(actual, expected, `wording/order/branch mismatch at ${v}${id}`);
      assert.equal(actual.filter(t => t === options[id]).length, 1, `option repeated ${v}${id}`);
      for (const other of (["A", "B", "C"] as QinChoiceId[]).filter(o => o !== id)) {
        assert.ok(!actual.includes(options[other]), `${v}${id} shows option ${other}`);
      }
      assert.doesNotMatch(actual.join("\n"), /【|給 Grok|實裝說明|分支結束|共同劇情|第五章・唐朝篇 完/);
      const index = beats.findIndex(b => b.kind === "choice");
      const target = qinChoiceIndex(beats, index, id)!;
      assert.equal((beats[target] as { text: string }).text, options[id]);
    }
  }
});

test("volume 6 offers closeness or space; volume 9 kiss/hand/friend distance remain exclusive", () => {
  const a6 = chosen(6, "A"), c6 = chosen(6, "C");
  assert.match(a6, /將椅子移近/); assert.match(a6, /往旁邊讓出位置，沒有伸手攬我/);
  assert.match(c6, /我想先自己待一會兒/); assert.doesNotMatch(c6, /移近|坐著/);
  const a = chosen(9, "A"), b = chosen(9, "B"), c = chosen(9, "C");
  assert.match(a, /可以吻你嗎/); assert.match(a, /吻落下時/);
  assert.doesNotMatch(a, /牽住|回握/);
  assert.match(b, /伸手牽住他/); assert.match(b, /回握/); assert.doesNotMatch(b, /吻/);
  assert.match(c, /能說真話的朋友/); assert.match(c, /自在的距離/); assert.doesNotMatch(c, /吻|牽住|回握|抱/);
});

test("volume 10 hug only on A, voluntary kiss only on B, wave on C; shared plot adds none", () => {
  const a = chosen(10, "A"), b = chosen(10, "B"), c = chosen(10, "C");
  assert.match(a, /能抱一會兒嗎/); assert.match(a, /攏住背後/); assert.doesNotMatch(a, /吻/);
  assert.match(b, /想再吻你一次/); assert.match(b, /吻得很短/); assert.doesNotMatch(b, /抱|攏住/);
  assert.match(c, /向他揮手/); assert.doesNotMatch(c, /吻|抱|攏住/);
  for (let v = 1; v <= 10; v++) assert.doesNotMatch(common(v), /吻|擁抱|抱住|攏住|牽手|牽住|回握|攬/, `common ${v}`);
  const end = TANG_STORIES[9].text;
  assert.match(end, /山紋玉佩、馬形玉扣、琴囊與布護符/);
  assert.match(end, /這不是一場已安排好的未來/);
  assert.doesNotMatch(TANG_STORIES.map(s => s.text).join("\n"), /第六章|一定重逢|永遠等你|永遠在一起|月老/);
});

test("volume 5 reaching out is optional; the charm cord leads out on every route", () => {
  const a = chosen(5, "A"), b = chosen(5, "B"), c = chosen(5, "C");
  assert.match(a, /向李白伸手/); assert.match(a, /慢慢鬆開他/); assert.match(a, /符索/);
  for (const t of [b, c]) { assert.match(t, /符索/); assert.doesNotMatch(t, /握住伸出的手|伸手/); }
  assert.match(common(5), /桂花糖/); assert.match(common(5), /慢慢化成冷墨/);
  assert.match(common(5), /高適在外頭接住我們收回的符索/);
  for (const id of ["A", "B", "C"] as QinChoiceId[]) {
    const path = visible(walkQin(parseTangVolume(5), id)).join("\n");
    assert.match(path, /找出一個錯處，攔不住一個願意繼續相信的人/);
  }
});

test("幻宴 rules: guests choose to wake, rescue is not smashing the gate, every route reaches it", () => {
  for (const id of ["A", "B", "C"] as QinChoiceId[]) {
    const path = visible(walkQin(parseTangVolume(8), id)).join("\n");
    assert.match(path, /不能只把夢砸碎|不是每個人都立即起身/);
    assert.match(path, /我先穩住他身旁的符，不強行拉扯/);
    assert.match(path, /別替我說完/);
    assert.match(path, /幻月跌入空杯，碎成濁墨/);
    assert.doesNotMatch(path, /吻|擁抱|牽手/);
  }
  assert.match(TANG_STORIES[6].text, /不能只把夢砸碎/);
  assert.match(TANG_STORIES[3].text, /連著現世的符索同行/);
  assert.match(TANG_STORIES[9].text, /也還想寫詩、看月、與人飲酒/);
});

test("all 173 spoken lines have Japanese TTS, true nameplates, cast voices remain locked", () => {
  let spoken = 0;
  const cast = new Set(["李白","我","月","店家","杜甫","高適","月影之聲","賓客","師父之聲","墨厄","幻影"]);
  for (let v = 1; v <= 10; v++) for (const b of parseTangVolume(v)) {
    if (b.kind !== "dialogue") continue;
    assert.ok(cast.has(b.speaker), b.speaker);
    assert.equal(b.thought, false);
    spoken++;
    const ja = storyVoiceJapanese(storyQuotedSpeech(b.text).join("\n"));
    assert.match(ja, /[ぁ-んァ-ン]/, `no Japanese for ${v} ${b.text}`);
    assert.doesNotMatch(ja, /[「」]/);
    if (ACTION.test(b.text) && !b.text.startsWith("走出幾步")) assert.equal(b.speaker, "我");
  }
  assert.equal(spoken, 173);
  const inline = parseTangVolume(1).find(b => b.kind === "dialogue" && b.text.startsWith("走出幾步"));
  assert.ok(inline && inline.kind === "dialogue" && inline.speaker === "李白");
  assert.equal(storyVoiceId("李白"), "bdt3B5N3GXM2nOc0SUW7");
  assert.equal(storyVoiceId("我"), "bss6xwA9ygVKRihgIbhZ");
  assert.equal(storyVoiceId("月"), "BWN0mOtkGHghA3CYFzFK");
  assert.equal(storyVoiceId("墨厄"), "auoHciLZJwKTwYUoRTYz");
  assert.equal(storyVoiceId("月影之聲"), storyVoiceId("墨厄"));
  // Guide 月 lead-ins in earlier chapters still resolve to 月.
  const yue = [...parseWuVolume(1), ...parseQiVolume(1)].filter(b => b.kind === "dialogue" && b.speaker === "月");
  assert.ok(yue.length > 0);
});

test("local/cloud cursor retains volume, chosen branch, dialogue position and intimacy decisions", () => {
  const beats = parseTangVolume(10), ci = beats.findIndex(b => b.kind === "choice");
  for (const id of ["A", "B", "C"] as QinChoiceId[]) {
    const at = qinChoiceIndex(beats, ci, id)! + 1;
    const play = cleanMainStoryQinPlay({ volume: 10, beat: at, done: false, positions: { 6: 4, 9: 7, 10: at }, finished: {}, choices: { 5: "A", 6: "C", 9: "B", 10: id } })!;
    const sanitized = sanitizeSnapshot({ owned: {}, mainStoryTangPlay: play });
    assert.ok(sanitized.ok);
    if (!sanitized.ok) continue;
    const saved = sanitized.data.mainStoryTangPlay!;
    assert.deepEqual(saved, play);
    assert.equal(qinResumeIndex(10, beats, saved), at);
    assert.deepEqual(saved.choices, { 5: "A", 6: "C", 9: "B", 10: id });
  }
  assert.ok(SNAPSHOT_KEYS.includes("mainStoryTangPlay"));
  assert.ok(SNAPSHOT_KEYS.includes("mainStoryQiPlay") && SNAPSHOT_KEYS.includes("mainStoryWuPlay"));
  const older = sanitizeSnapshot({ owned: {} }); assert.ok(older.ok);
  if (older.ok) assert.equal(older.data.mainStoryTangPlay, null);
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.match(store, /mainStoryTangPlay: cleanMainStoryQinPlay\(p.mainStoryTangPlay\)/);
  assert.match(store, /setMainStoryTangPlay/);
  assert.match(store, /assist: cleanAssist\(p.assist\)/);
  const reader = readFileSync(new URL("../components/game/MainStory.tsx", import.meta.url), "utf8");
  assert.match(reader, /chapter === 5 \? parseTangVolume\(volume\)/);
});
