import { storyPortraitSrc } from "./summon-reveal.ts";
/** 第五章・唐朝篇 uses the shared VN engine, without modifying the supplied prose. */
import { TANG_VN_STORIES } from "./tang-vn-script.ts";
import { parseQinVolume, type QinBeat, type VnStage } from "./qin-vn.ts";

const ART = "/cg/prologue/";
/** Narrative lead-ins in front of a quote: keep them on screen, voice only the quote. */
const INLINE: Record<string, string> = {
  "走出幾步，他忽然問": "李白",
};
/** Options like `向李白伸手：「…」` are the heroine acting and speaking at once. */
const ACTION_SPEECH = /^[^「」：]+：「[^「」]*」$/;

export const TANG_STAGE: VnStage = {
  initialScene: "桃溪酒肆",
  presentChosenOption: true,
  // 幻境中的神社 reuses the shrine art; the closing 墨路 uses the rift; other scenes keep the ink landscape.
  background: (scene) => /墨路/.test(scene) ? `${ART}rift.jpg` : /神社/.test(scene) ? `${ART}shrine.jpg` : "/bg/hall-bg.webp",
  sprite: (speaker) => speaker === "我" ? `${ART}witch.png` : speaker === "李白" ? storyPortraitSrc("libai") : undefined,
};

export function tangVnScript(volume: number): string | null {
  return TANG_VN_STORIES.find((story) => story.volume === volume)?.text ?? null;
}

export function parseTangVolume(volume: number): QinBeat[] {
  const source = tangVnScript(volume);
  if (!source) return [];
  // Chapter end is a flow marker, not a spoken/narrated story line.
  return parseQinVolume(source.replace(/^【第五章・唐朝篇 完】$/m, ""), TANG_STAGE).map((beat) => {
    if (beat.kind === "narration" && ACTION_SPEECH.test(beat.text)) {
      return { kind: "dialogue", text: beat.text, speaker: "我", thought: false, background: beat.background, sprite: TANG_STAGE.sprite("我") };
    }
    if (beat.kind !== "dialogue" || !INLINE[beat.speaker]) return beat;
    return { ...beat, text: `${beat.speaker}：${beat.text}`, speaker: INLINE[beat.speaker] };
  });
}
