import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { CHARACTERS } from "./data.ts";
import { tierRewards, LOVE_TIER } from "./bond.ts";
import { STORIES_EXTRA } from "./stories-extra.ts";
import { VOICE_JA, VOICE_LOVE_JA, VOICED_RARITIES, hasVoice } from "./voice-ja.ts";
import { playVoice, stopVoice, voiceSrc } from "./audio.ts";
import { voiceFallback } from "./voice-zh.ts";

const dir = new URL("../../public/voice/", import.meta.url);
const voiced = CHARACTERS.filter((c) => c.rarity === "SSR" || c.rarity === "SS");
const silent = CHARACTERS.filter((c) => c.rarity === "S" || c.rarity === "R");
const kana = /[\u3040-\u30ff]/;

test("voice: only SSR and SS are voiced", () => {
  assert.deepEqual([...VOICED_RARITIES].sort(), ["SS", "SSR"]);
  assert.equal(voiced.length, 15);
  for (const c of voiced) assert.ok(hasVoice(c.rarity), c.id);
  for (const c of silent) assert.ok(!hasVoice(c.rarity), c.id);
  assert.deepEqual(Object.keys(VOICE_JA).sort(), voiced.map((c) => c.id).sort());
  assert.deepEqual(Object.keys(VOICE_LOVE_JA).sort(), voiced.map((c) => c.id).sort());
});

test("voice: each SSR/SS has Chinese-trial 情話・其一/其二 and retained Japanese restore text and assist, -line and -love mp3s (30 love-line files)", () => {
  let loveLineFiles = 0;
  for (const c of voiced) {
    assert.equal(voiceFallback(c.id)?.text, c.line);
    assert.equal(voiceFallback(c.id, "", "love")?.text, STORIES_EXTRA[c.id]!.love);
    assert.equal(voiceFallback(c.id)?.lang, "zh-TW");
    assert.ok(!c.line.includes("待你撰寫"));
    assert.ok(!STORIES_EXTRA[c.id]!.love.includes("待你撰寫"));
    assert.ok(kana.test(VOICE_JA[c.id]!), `${c.id}: line ja`);
    assert.ok(kana.test(VOICE_LOVE_JA[c.id]!), `${c.id}: love ja`);
    assert.notEqual(VOICE_JA[c.id], VOICE_LOVE_JA[c.id], c.id);
    for (const name of [`${c.id}.mp3`, `${c.id}-line.mp3`, `${c.id}-love.mp3`]) {
      const f = new URL(name, dir);
      assert.ok(existsSync(f), name);
      assert.ok(statSync(f).size > 10_000, `${name} size`);
      if (name !== `${c.id}.mp3`) loveLineFiles++;
    }
    assert.equal(voiceSrc(c.id), `/voice/${c.id}.mp3`);
    assert.equal(voiceSrc(c.id, "line"), `/voice/${c.id}-line.mp3`);
    assert.equal(voiceSrc(c.id, "love"), `/voice/${c.id}-love.mp3`);
  }
  assert.equal(loveLineFiles, 30);
});

test("voice: S and R have no voice at all (no files, no URL, so no request and no 404)", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".mp3"));
  assert.equal(files.length, 45);
  for (const c of silent) {
    assert.ok(!files.some((f) => f === `${c.id}.mp3` || f.startsWith(`${c.id}-`)), c.id);
    for (const clip of ["assist", "line", "love"] as const) assert.equal(voiceSrc(c.id, clip), null, `${c.id} ${clip}`);
  }
  // every component goes through voiceSrc; nobody builds a /voice/ URL directly
  for (const f of ["Match3.tsx", "Codex.tsx", "Cinematic.tsx"]) {
    const src = readFileSync(new URL(`../components/game/${f}`, import.meta.url), "utf8");
    assert.ok(!src.includes("/voice/"), f);
  }
});

test("voice: old 語音 一階/五階 slots are retired (no reward entry, empty field) and love voice keeps the love tier", () => {
  for (const r of ["SSR", "SS", "S", "R"] as const) {
    for (const t of tierRewards(r)) assert.ok(!t.items.some((s) => s.includes("語音")), `${r} tier ${t.tier}`);
  }
  for (const c of CHARACTERS) assert.deepEqual(STORIES_EXTRA[c.id]!.voice, ["", ""], c.id);
  assert.equal(LOVE_TIER.SSR, 3);
  assert.equal(LOVE_TIER.SS, 3);
  const codex = readFileSync(new URL("../components/game/Codex.tsx", import.meta.url), "utf8");
  assert.ok(!codex.includes("語音 · 其"), "codex 語音 slots removed");
  assert.ok(codex.includes('lineSlot("情話 · 其二", LOVE_TIER[character.rarity], extra?.love, "love")'));
});

test("voice: Chinese fallback respects supplied text, resolves codex text and never voices S/R", () => {
  assert.deepEqual(voiceFallback("qin", "天下皆在朕掌中"), {text: "天下皆在朕掌中", lang: "zh-TW"});
  assert.equal(voiceFallback("qin", "", "line")?.text, CHARACTERS.find(c => c.id === "qin")!.line);
  assert.equal(voiceFallback("qin", "待你撰寫"), null);
  for (const c of silent) assert.equal(voiceFallback(c.id, c.line), null);
});

test("voice: failed mp3 playback speaks Chinese including codex love lookup", async () => {
  const spoken: { text: string; lang: string; voice?: {lang: string} }[] = [];
  class FakeAudio extends EventTarget {
    preload = ""; volume = 1; src = "";
    play() { return Promise.reject(new Error("simulate missing mp3")); }
    pause() {}
  }
  class FakeUtterance {
    text: string; lang = ""; rate = 1; pitch = 1;
    constructor(text: string) { this.text = text; }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = ["window", "Audio", "SpeechSynthesisUtterance"].map(key => [key, globals[key]] as const);
  globals.window = {speechSynthesis: {cancel() {}, getVoices() { return [{lang: "ja-JP"}, {lang: "zh-TW"}]; }, speak(u: typeof spoken[number]) {spoken.push(u);} }};
  globals.Audio = FakeAudio;
  globals.SpeechSynthesisUtterance = FakeUtterance;
  try {
    const line = CHARACTERS.find(c => c.id === "qin")!.line;
    assert.equal(await playVoice("qin", line, false)!.done, "failed");
    assert.equal(spoken[0].text, line);
    assert.equal(spoken[0].lang, "zh-TW");
    assert.equal(spoken[0].voice?.lang, "zh-TW");
    assert.equal(await playVoice("qin", "", false, "love")!.done, "failed");
    assert.equal(spoken[1].text, STORIES_EXTRA.qin.love);
    assert.equal(spoken[1].lang, "zh-TW");
  } finally {
    stopVoice();
    for (const [key, value] of saved) { if (value === undefined) delete globals[key]; else globals[key] = value; }
  }
});
