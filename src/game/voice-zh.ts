/** Existing Traditional Chinese 情話, used by the full Chinese listening trial. */
import { CHARACTERS } from "./data.ts";
import { STORIES_EXTRA } from "./stories-extra.ts";
import { STORY_VOICE_LANG } from "./story-voice-cast.ts";
import { VOICE_JA, VOICE_LOVE_JA } from "./voice-ja.ts";

export function voiceFallback(id: string, line = "", clip: "assist" | "line" | "love" = "assist") {
  const character = CHARACTERS.find(c => c.id === id);
  if (!character || (character.rarity !== "SSR" && character.rarity !== "SS")) return null;
  if (STORY_VOICE_LANG === "ja") {
    const text = clip === "love" ? VOICE_LOVE_JA[id] : VOICE_JA[id];
    return text ? { text, lang: "ja-JP" } : null;
  }
  const text = line.trim() || (clip === "love" ? STORIES_EXTRA[id]?.love : character.line);
  if (!text?.trim() || text.includes("待你撰寫")) return null;
  return { text, lang: "zh-TW" };
}
