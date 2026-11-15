/** Chinese listening trial: preserve Japanese backups before running. Never prints credentials. */
import { CHARACTERS } from "../src/game/data.ts";
import { STORIES_EXTRA } from "../src/game/stories-extra.ts";
import { storyVoiceCast } from "../src/game/story-voice-cast.ts";
import { existsSync, writeFileSync, renameSync } from "node:fs";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY not configured");
const report: { id: string; clip: string; model: string; files: string[] }[] = [];
const skipped: string[] = [];
let model = "eleven_v4";
async function generate(text: string, voiceId: string): Promise<Uint8Array> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST", signal: AbortSignal.timeout(120_000),
      headers: { "xi-api-key": key!, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({text, model_id: model, language_code: "zh"}),
    });
    if (res.ok) {
      const audio = new Uint8Array(await res.arrayBuffer());
      if (audio.length < 10_000) throw new Error(`Unexpectedly small mp3: ${audio.length}`);
      return audio;
    }
    const error = await res.text();
    console.log(`Upstream ${res.status}, model ${model}: ${error.slice(0, 1200)}`);
    if (model === "eleven_v4" && [400,404,422].includes(res.status) && /model/i.test(error)) {
      console.log("eleven_v4 unavailable: trying explicitly allowed eleven_v3 Chinese fallback");
      model = "eleven_v3";
      continue;
    }
    if (res.status === 429 || res.status >= 500) { await pause((attempt+1)*4000); continue; }
    throw new Error(`TTS failed (${res.status}); stopped without replacing this clip`);
  }
  throw new Error("TTS retries exhausted");
}
for (const c of CHARACTERS.filter(c => c.rarity === "SSR" || c.rarity === "SS")) {
  for (const clip of ["line", "love"] as const) {
    const text = clip === "line" ? c.line : STORIES_EXTRA[c.id]?.love;
    if (!text?.trim() || text.includes("待你撰寫")) { skipped.push(`${c.id}-${clip}`); continue; }
    const files = clip === "line" ? [`${c.id}.mp3`, `${c.id}-line.mp3`] : [`${c.id}-love.mp3`];
    for (const f of files) if (!existsSync(`/workspace/bak/voice-ja-mp3/${f}`)) throw new Error(`Backup missing: ${f}`);
    console.log(`Generating ${c.id} ${clip} (${text.length} characters), ${model} zh`);
    const audio = await generate(text, storyVoiceCast(c.name).voiceId);
    for (const f of files) {
      writeFileSync(`public/voice/${f}.tmp`, audio);
      renameSync(`public/voice/${f}.tmp`, `public/voice/${f}`);
    }
    report.push({ id: c.id, clip, model, files });
    writeFileSync("voice-zh-generation.json", JSON.stringify({ language: "zh", report, skipped }, null, 2));
    console.log(`Saved ${files.join(", ")} (${audio.length} bytes)`);
    await pause(1200);
  }
}
console.log(JSON.stringify({requests: report.length, files: report.flatMap(r => r.files).length, skipped}));
