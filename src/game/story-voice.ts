/** Spoken story lines are the on-screen Traditional Chinese; symbols are not read aloud. */
import { STORY_VOICE_JA } from "./story-voice-ja.ts";
import { QI_STORY_VOICE_JA } from "./qi-story-voice-ja.ts";
import { TANG_STORY_VOICE_JA } from "./tang-story-voice-ja.ts";

const SENTENCE = /[^。！？\n…]*?(?:。|！|？|\n|…+|\.{6,}|$)/g;
const SYMBOLS = /[\s「」『』“”‘’"'（）()【】[\]《》〈〉<>。，、！？：；:;,.!?…⋯·・—–\-～~／/\\＊*#@&+=|]+/g;

export function storyVoiceSpeakable(text: string): string {
  return text.replace(/\.{2,}/g, " ").replace(SYMBOLS, " ").replace(/\s+/g, " ").trim();
}

export function storyQuotedSpeech(text: string): string[] {
  return [...text.matchAll(/「([^「」]*)」/g)].map((match) => match[1]).filter((part) => part.trim().length > 0);
}

export function storyVoiceLines(text: string): string[] {
  const sentences = text.match(SENTENCE) ?? [];
  return sentences.map(storyVoiceSpeakable).filter((part) => part.length > 0);
}

export function storyVoiceChunks(text: string): string[] {
  return storyVoiceLines(text).flatMap((part) => {
    const chars = Array.from(part);
    const chunks: string[] = [];
    for (let i = 0; i < chars.length; i += 40) chunks.push(chars.slice(i, i + 40).join(""));
    return chunks;
  });
}

/** Japanese spoken text for TTS. Empty when a line has no translation yet. */
export function storyVoiceJapanese(text: string): string {
  const lines = storyVoiceLines(text);
  if (!lines.length) return "";
  const translated = lines.map((line) => STORY_VOICE_JA[line] ?? QI_STORY_VOICE_JA[line] ?? TANG_STORY_VOICE_JA[line] ?? "");
  if (translated.every(Boolean)) return translated.join("。");
  const cleaned = storyVoiceSpeakable(text);
  return STORY_VOICE_JA[cleaned] ?? QI_STORY_VOICE_JA[cleaned] ?? TANG_STORY_VOICE_JA[cleaned] ?? "";
}


/** Text actually sent to TTS. Main story always speaks the on-screen Traditional Chinese line. */
export function storyVoiceSpokenText(text: string): string {
  return storyVoiceLines(text).join("。");
}

export function storyVoiceProfile(speaker: string): { pitch: number; rate: number } {
  const name = speaker.trim();
  if (name.includes("秦始皇") || ["贏政", "嬴政", "始皇帝"].includes(name)) return { pitch: 0.75, rate: 0.92 };
  if (name === "曹操") return { pitch: 0.8, rate: 0.95 };
  if (["周瑜", "蘭陵王", "高長恭", "李白", "劉徹", "士兵", "？？？"].includes(name)) return { pitch: 0.85, rate: 0.95 };
  if (["我", "巫女"].includes(name)) return { pitch: 1.12, rate: 1.0 };
  if (name === "月") return { pitch: 1.18, rate: 1.02 };
  if (["墨厄", "黑影"].includes(name)) return { pitch: 0.68, rate: 0.88 };
  return { pitch: 1.0, rate: 0.95 };
}
