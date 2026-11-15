import { storyPortraitSrc } from "./summon-reveal.ts";
/** 北齊篇 uses the shared VN engine, without modifying the supplied prose. */
import { QI_VN_STORIES } from "./qi-vn-script.ts";
import { parseQinVolume, type QinBeat, type VnStage } from "./qin-vn.ts";
const INLINE: Record<string, string> = {
  "他站了很久，才問": "高長恭",
  "最後副將道": "副將",
  "他看著符陣，很久才從喉間擠出一句": "高長恭",
};
export const QI_STAGE: VnStage = {
  initialScene: "風雪長街",
  presentChosenOption: true,
  background: (scene) => /墨路/.test(scene) ? "/cg/prologue/rift.jpg" : "/bg/hall-bg.webp",
  sprite: (speaker) => speaker === "我" ? "/cg/prologue/witch.png" : speaker === "高長恭" || speaker === "蘭陵王" ? storyPortraitSrc("lanling") : undefined,
};
export function qiVnScript(volume: number): string | null {
  return QI_VN_STORIES.find((story) => story.volume === volume)?.text ?? null;
}
export function parseQiVolume(volume: number): QinBeat[] {
  const source = qiVnScript(volume);
  if (!source) return [];
  // Chapter end is a flow marker, not a spoken/narrated story line.
  return parseQinVolume(source.replace(/^【第四章・北齊篇 完】$/m, ""), QI_STAGE).map((beat) => {
    if (beat.kind !== "dialogue" || !INLINE[beat.speaker]) return beat;
    // Preserve the narrative lead-in on screen; voice only the quoted speech.
    return { ...beat, text: `${beat.speaker}：${beat.text}`, speaker: INLINE[beat.speaker] };
  });
}
