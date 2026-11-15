import type { Character } from "./data.ts";

/**
 * 緣分升階台詞 — 五位 SSR 的 1…5 階為使用者原稿。第 6 階保留既有草稿，待使用者提供。 Short lines shown on the result screen at the moment a bond tier rises.
 * Tone: 有好感、戀人未滿. No official lovers, no forever / belonging promises.
 * SSR slots 1…5 are owner-provided verbatim; slot 6 remains a draft (index 1…6),
 * everyone else uses the generic lines below with their own name.
 */
export const SSR_RANKUP_DRAFTS: Record<string, Record<number, string>> = {
  qin: {
    1: "又是你。過來，讓朕看看。",
    2: "朕已命人添了一盞燈。你來時，不必摸黑。",
    3: "今日沒有要事。朕只是……想見你。",
    4: "留下陪朕用膳，可好？這回，朕是在問你。",
    5: "天下之事，朕自會處置。此刻，只想與你說些私話。",
    6: "嬴政。往後無人時，你可以這樣喚朕。",
  },
  zhouyu: {
    1: "來了？坐吧。今日這首，你還未聽過。",
    2: "你一進門，我便聽見了。倒不是腳步聲大……是我一直留心。",
    3: "方才那一音錯了。你靠得近，我有些分神。",
    4: "旁人問我曲中何意，我尚能從容作答。偏你一問，便不知從何說起。",
    5: "今日不彈琴了。想聽你說說，有沒有一點想我。",
    6: "這首曲子還沒彈完。剩下的，想留著彈給你聽。",
  },
  lanling: {
    1: "雪大。到這邊來，能避些風。",
    2: "你上回說手冷。我讓人備了暖爐……這次沒有忘。",
    3: "今日不是送東西。是我自己，想來見你。",
    4: "可以牽你的手嗎？不是要帶你去哪裡。只是想牽著。",
    5: "從前只想護你平安。如今，也想好好活著，陪你過些尋常日子。",
    6: "長恭。這個名字，只想聽你喚。",
  },
  libai: {
    1: "巧了，我正缺個同看月亮的人。姑娘可有空？",
    2: "方才見著一處好景，第一個念頭，竟是你還沒看過。",
    3: "這兩句改了半日，仍不滿意。罷了——就是想你。",
    4: "你不必句句懂我。肯坐下來問，我便認真說給你聽。",
    5: "酒未入口，月尚未升。這一聲喜歡，想讓你聽得清清楚楚。",
    6: "這首詩寫給你。題目，等你自己來取。",
  },
  liuche: {
    1: "來得正好。朕給你留了一匹馬！",
    2: "今日不比誰騎得快。你想去哪裡，便往哪裡走。",
    3: "往日出宮，總嫌時辰不夠。與你同行，倒盼著路長些。",
    4: "朕有許多想去的地方。如今每想到一處，都想問你願不願同行。",
    5: "山河看過萬里，回來最想見的，還是你。",
    6: "劉徹。不是陛下——今夜，只是劉徹。",
  },
};

/** Generic tier lines for everyone else (narration with the character's name). */
const GENERIC: Record<number, (name: string) => string> = {
  1: (n) => `${n}認出了你，眼裡多了一分笑意：「又見面了。」`,
  2: (n) => `${n}替你留了位子：「坐近些，話好說。」`,
  3: (n) => `${n}說起一件從未對旁人提過的小事，像在試你肯不肯聽。`,
  4: (n) => `${n}看了你很久，才輕聲說：「你來了，我很高興。」`,
  5: (n) => `${n}不再藏起疲倦，只在你身旁安靜地坐了一會兒。`,
  6: (n) => `${n}低聲喚你的名字，像是怕驚動什麼：「下回，我還想見你。」`,
};

export function rankUpLine(character: Pick<Character, "id" | "name">, tier: number): string {
  const t = Math.max(1, Math.min(6, tier));
  return SSR_RANKUP_DRAFTS[character.id]?.[t] ?? GENERIC[t]!(character.name);
}
