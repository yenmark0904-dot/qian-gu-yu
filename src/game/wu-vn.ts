import { storyPortraitSrc } from "./summon-reveal.ts";
/** 第三章・三國篇 plays in the same VN engine as 秦朝篇 (sentence by sentence, A/B/C pauses). */
import { WU_VN_STORIES } from "./wu-vn-script.ts";
import { parseQinVolume, type QinBeat, type VnStage } from "./qin-vn.ts";

const ART = "/cg/prologue/";

/** 江畔 scenes use the ink-landscape hall art; the closing 墨路 uses the rift. */
export function wuSceneBackground(name: string): string {
  if (/時隙|墨路/.test(name)) return `${ART}rift.jpg`;
  return "/bg/hall-bg.webp";
}

function wuSprite(speaker: string): string | undefined {
  if (speaker === "我") return `${ART}witch.png`;
  if (speaker === "周瑜") return storyPortraitSrc("zhouyu");
  return undefined;
}

export const WU_STAGE: VnStage = { initialScene: "三國・江畔", background: wuSceneBackground, sprite: wuSprite };

export function wuVnScript(volume: number): string | null {
  return WU_VN_STORIES.find((story) => story.volume === volume)?.text ?? null;
}

export function parseWuVolume(volume: number): QinBeat[] {
  const text = wuVnScript(volume);
  return text ? parseQinVolume(text, WU_STAGE) : [];
}
