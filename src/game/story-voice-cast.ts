/** ElevenLabs voice cast for main-story speech. Native Mandarin voices so pronunciation is Chinese. */
export const STORY_VOICE_MODEL = "eleven_v4";
/** Main story always speaks on-screen Traditional Chinese. */
export const STORY_VOICE_LANG: "zh" | "ja" = "zh";
export const STORY_VOICE_LANGUAGE_CODE = "zh";

export type StoryVoiceCast = {
  id: string;
  name: string;
  voiceId: string;
};

const QIN: StoryVoiceCast = { id: "qin", name: "Haoran", voiceId: "pU9NaAwkoR3v0Mrg3uKz" };

const BY_ID: Record<string, StoryVoiceCast> = {
  qin: QIN,
  lanling: { id: "lanling", name: "阿夢", voiceId: "6nHtrY0bdH4FDasnUelr" },
  libai: { id: "libai", name: "Long", voiceId: "bdt3B5N3GXM2nOc0SUW7" },
  zhouyu: { id: "zhouyu", name: "Ethan Zhang", voiceId: "brChkoggsUHF1stW6omH" },
  liuche: { id: "liuche", name: "Zeyu Liu", voiceId: "AAYMKjNBrET5q9uPiIQS" },
  panan: { id: "panan", name: "Andrew", voiceId: "DA2aDl5DPFqDvHqbzlkZ" },
  songyu: { id: "songyu", name: "里佩尔", voiceId: "nss5M23ZSzhG3Tn0b7wN" },
  luyou: { id: "luyou", name: "Lan Chen", voiceId: "bZtjnyJAFD0Cp3lfNG5g" },
  zhaoyun: { id: "zhaoyun", name: "Lambda", voiceId: "D0xduROytBDuuCSH3aQy" },
  zhuge: { id: "zhuge", name: "Siqi Liu", voiceId: "W8lBaQb9YIoddhxfQNLP" },
  caocao: { id: "caocao", name: "TW_Hardy", voiceId: "FS8UtxyDrvYcNCxVaziq" },
  lishimin: { id: "lishimin", name: "KUO YU", voiceId: "Z9RJEkFYQw307BCQULDR" },
  huo: { id: "huo", name: "Aaron Shang", voiceId: "Qz42O0rKFmFBzAviAloi" },
  sima: { id: "sima", name: "Akun", voiceId: "E8c1bekb52tdh7tvpKVK" },
  nalan: { id: "nalan", name: "Erich Li", voiceId: "fYmV8EanqZP9BI4WvpB7" },
  heroine: { id: "heroine", name: "shuishui", voiceId: "bss6xwA9ygVKRihgIbhZ" },
  yue: { id: "yue", name: "Danyu Zhao", voiceId: "BWN0mOtkGHghA3CYFzFK" },
  moe: { id: "moe", name: "Neil Chuang", voiceId: "auoHciLZJwKTwYUoRTYz" },
  extra: { id: "extra", name: "Chun", voiceId: "ZhxuUPFU7Hvp3p8qIPQP" },
};

const EXACT: Record<string, string> = {
  曹操: "caocao",
  周瑜: "zhouyu",
  蘭陵王: "lanling",
  高長恭: "lanling",
  李白: "libai",
  劉徹: "liuche",
  潘安: "panan",
  宋玉: "songyu",
  陸游: "luyou",
  趙雲: "zhaoyun",
  諸葛亮: "zhuge",
  李世民: "lishimin",
  霍去病: "huo",
  司馬相如: "sima",
  納蘭性德: "nalan",
  我: "heroine",
  巫女: "heroine",
  幻影巫女: "heroine",
  月: "yue",
  墨厄: "moe",
  黑影: "moe",
  /** 三國篇卷五：墨厄借周瑜的聲音喊「繼續」。 */
  水中的聲音: "zhouyu",
  /** 唐朝篇卷二：墨厄借溪中月影說話。 */
  月影之聲: "moe",
  士兵: "extra",
  "？？？": "extra",
};

export function storyVoiceCast(speaker: string): StoryVoiceCast {
  const name = speaker.trim();
  if (name.includes("秦始皇") || name === "嬴政" || name === "贏政" || name === "始皇帝") return BY_ID.qin;
  const id = EXACT[name];
  if (id) return BY_ID[id];
  return BY_ID.extra;
}

export function storyVoiceId(speaker: string): string {
  return storyVoiceCast(speaker).voiceId;
}
