import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { CHARACTERS } from "./data.ts";
import { tierRewards, LOVE_TIER } from "./bond.ts";
import { STORIES_EXTRA } from "./stories-extra.ts";
import { VOICE_JA, VOICE_LOVE_JA, VOICED_RARITIES, hasVoice } from "./voice-ja.ts";
import { voiceSrc } from "./audio.ts";

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

test("voice: each SSR/SS has Japanese 情話・其一/其二 text and assist, -line and -love mp3s (30 love-line files)", () => {
  let loveLineFiles = 0;
  for (const c of voiced) {
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
