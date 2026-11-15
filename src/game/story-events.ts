/**
 * 劇情三消 (hybrid plan): optional events inside the story. They use the same 7×8 board and the shared
 * combat engine, never pay 墨玉 or stars, can be skipped / failed / retried, and never block reading.
 */
import type { EnemyDef } from "./combat.ts";
import type { LevelDef } from "./levels.ts";

export type LampRule = {
  /** Starting 燈火 (0–100). */
  start: number;
  /** Jade kind that feeds the lamp (蜜蠟黃玉 = 2). */
  kind: number;
  /** 燈火 per lamp jade cleared by any wave. */
  perJade: number;
  /** Night wind: 燈火 lost after every player move. */
  decay: number;
  /** 燈火 restored by each assist cast. */
  perCast: number;
};

export type StoryEvent = {
  id: string;
  chapter: 1;
  volume: number;
  /** 卷名 as written in the story (盞, not 盎). */
  volumeTitle: string;
  name: string;
  mechanic: string;
  invite: string;
  intro: string[];
  def: LevelDef;
  lamp: LampRule;
  enemy: EnemyDef;
  /** Bonus scene unlocked on success (shown in the event and replayable). */
  reward: { title: string; lines: { speaker: string; text: string }[] };
};

export const LAMP_JADE = 2;

export const STORY_EVENTS: readonly StoryEvent[] = [
  {
    id: "qin-4-lamp",
    chapter: 1,
    volume: 4,
    volumeTitle: "一盞留燈",
    name: "長明之約",
    mechanic: "燈火守護",
    invite: "「這盞燈，我想替你守到天亮。」",
    intro: [
      "夜深，御書房只剩一盞燈。嬴政還在批閱奏章。",
      "窗縫裡滲進一縷墨色——墨厄循著燈火而來，想把這點光吞掉。",
      "消除蜜蠟黃玉為燈添火；燈未熄之前擊退墨厄，這一夜才算守住。",
    ],
    def: {
      id: 9001,
      moves: 18,
      goals: [],
      stars: [1, 1],
      tip: "黃玉是燈芯的光：消除越多，燈火越旺，對墨厄的傷害也越重。",
    },
    lamp: { start: 70, kind: LAMP_JADE, perJade: 6, decay: 4, perCast: 15 },
    enemy: {
      id: "story-lamp-shade",
      name: "噬燈墨影",
      title: "秦朝篇 · 卷四 · 劇情墨厄",
      hp: 3600,
      shield: 60,
      attackEvery: 3,
      skills: ["dim", "shield"],
      ink: 0,
      ice: 0,
      dim: 15,
      phaseAt: 0.4,
      boss: false,
      art: "lamp",
      // 墨厄抗性: ordinary jade barely bites the ink; the lamp's own light (黃玉) burns it.
      resist: { 0: 0.7, 1: 0.7, 2: 1.6, 3: 0.5, 4: 0.7, 5: 0.7 },
      traits: [
        "每 3 回出手：吞燈（燈火 −15）、傷你氣血並立盾",
        "墨厄抗性：一般玉石傷害降低，墨玉璜最弱",
        "畏光：蜜蠟黃玉傷害 ×1.6",
        "生命低於四成：出手更快",
      ],
    },
    reward: {
      title: "長明之約・燈下",
      lines: [
        { speaker: "嬴政", text: "天都亮了，怎麼還守著這盞燈？" },
        { speaker: "我", text: "墨影總想吞掉它。我添了三回燈芯，才撐到現在。" },
        { speaker: "嬴政", text: "朕竟睡得這樣沉……你過來坐，別站著了。" },
        { speaker: "我", text: "可是我一坐下，可能就睡著了。" },
        { speaker: "嬴政", text: "那便睡。這回換朕守著，待你醒來，燈還會亮。" },
      ],
    },
  },
];

export function storyEventFor(chapter: number, volume: number): StoryEvent | null {
  return STORY_EVENTS.find((e) => e.chapter === chapter && e.volume === volume) ?? null;
}

export type StoryEventRecord = { cleared: boolean; tries: number; skipped: boolean };
export type StoryEventSave = Record<string, StoryEventRecord>;

export function cleanStoryEvents(raw: unknown): StoryEventSave {
  const out: StoryEventSave = {};
  if (!raw || typeof raw !== "object") return out;
  for (const e of STORY_EVENTS) {
    const v = (raw as Record<string, unknown>)[e.id] as Partial<StoryEventRecord> | undefined;
    if (!v || typeof v !== "object") continue;
    out[e.id] = {
      cleared: v.cleared === true,
      skipped: v.skipped === true,
      tries: Number.isFinite(v.tries) ? Math.max(0, Math.min(9999, Math.floor(v.tries as number))) : 0,
    };
  }
  return out;
}

/** Sticky: a clear on any device stays cleared. */
export function mergeStoryEvents(local: StoryEventSave, incoming: StoryEventSave): StoryEventSave {
  const out: StoryEventSave = { ...local };
  for (const [id, r] of Object.entries(incoming)) {
    const old = out[id];
    out[id] = {
      cleared: r.cleared || !!old?.cleared,
      skipped: r.skipped || !!old?.skipped,
      tries: Math.max(r.tries, old?.tries ?? 0),
    };
  }
  return out;
}
