/**
 * 命器 (V2.0 階段 B) — catalog, player inventory, equip / unequip / transfer and stage-gated unlocks.
 * Pure module (no DOM, no store) so the store, the UI and node tests share one set of rules.
 *
 * Hard rules encoded here:
 *  - Every one of the 65 characters may equip ANY owned instance (no rarity / owner restriction).
 *  - One instance sits on at most one character; one character wears at most one instance.
 *  - The exclusive (專屬) layer of an SSR / SS 命器 only wakes when the wearer's character ID equals
 *    `exclusiveCharacterId` — never compared by display name.
 *  - Equip / transfer / unequip never deletes an instance.
 *  - 命器 never touches 緣分 (`owned` counts), skills, 墨玉 or story progress.
 */
import { BY_ID } from "./data.ts";
import type { LevelRecord } from "./levels.ts";

/* ───────────────────────── catalog types ───────────────────────── */

export type ArtifactRarity = "SSR" | "SS" | "S" | "R";
export const ARTIFACT_RARITY_LABEL: Record<ArtifactRarity, string> = {
  SSR: "SSR 專屬",
  SS: "SS 專屬",
  S: "S 通用",
  R: "R 通用",
};

/** A wave-level condition, evaluated only on waves of a normal PLAYER move (never skill strikes). */
export type WaveCond =
  /** a wave clearing at least `min` jades */
  | { on: "big"; min: number }
  /** a cascade wave (連消: wave index ≥ min, default 1) */
  | { on: "cascade"; min?: number }
  /** the first wave of a player move (玩家正常移動產生的有效消除) */
  | { on: "normal" }
  /** the first wave of a player move clearing at least `min` jades */
  | { on: "normalBig"; min: number }
  /** a wave in which a 刻玉 (row or col) actually detonates */
  | { on: "line" }
  /** a wave in which a horizontal 刻玉 actually detonates */
  | { on: "rowLine" }
  /** a wave in which a 金鑲玉 actually detonates */
  | { on: "bomb" }
  /** a wave in which a 刻玉 or 金鑲玉 actually detonates */
  | { on: "lineOrBomb" }
  /** a wave in which a 龍珠 is actually set off */
  | { on: "color" }
  /** a wave that hits an ink or ice layer (解除墨封或冰封: ice 2→1 or ink 1→0) */
  | { on: "seal" }
  /** a wave that fully removes an ink seal (解除墨封: 1→0) */
  | { on: "sealBroken" };

/** A move-level condition (evaluated once on a whole player move). */
export type MoveCond =
  /** the move resolved in at least `min` waves (連鎖) */
  | { on: "chain"; min: number }
  /** at least `min` DIFFERENT special kinds (刻玉 / 金鑲玉 / 龍珠) detonated in the move */
  | { on: "specialKinds"; min: number }
  /** at least `min` 金鑲玉 detonations in the move */
  | { on: "bombs"; min: number }
  /** the move pushed the running score across one of the stage's score milestones */
  | { on: "milestone" }
  /** the move completed one of the stage's goals */
  | { on: "goal" }
  /** this and the previous valid player move both cleared jades */
  | { on: "consecutive" };

/** Values at Lv.1 and Lv.10; Lv.2–9 follow LEVEL_CURVE. */
export type Scaled = readonly [lv1: number, lv10: number];

/** Stage features a fallback can depend on. */
export type StageNeed = "seal" | "milestone" | "goal";

export type ArtifactRule =
  /** +pct of the matching wave's score, for the first `uses` matching waves of the stage. */
  | { kind: "wavePct"; cond: WaveCond; pct: Scaled; uses: number; fallback?: Fallback }
  /** +pct of the whole move's score, for the first `uses` matching moves of the stage. */
  | { kind: "movePct"; cond: MoveCond; pct: Scaled; uses: number; fallback?: Fallback }
  /** +energy to the WEARER ONLY, from the direct (first) wave of a player move; `uses` per stage. */
  | { kind: "charge"; cond: WaveCond; energy: Scaled; uses: number };

/** A weaker rule used instead when the stage lacks what the main rule needs (keeps the 命器 useful). */
export type Fallback = { when: StageNeed; rule: ArtifactRule };

/**
 * Owner-only layer: armed when the owner casts their own skill, consumed by the next matching wave.
 * One trigger per cast (re-casting refreshes, never stacks). Expires on use, on the next cast, or
 * after ARMED_WINDOW_MOVES player moves — never lingers.
 */
export type ExclusiveDef = {
  name: string;
  text: string;
  /** The owner's real skill id from skills.ts (arming checks this). */
  skillId: string;
  cond: WaveCond;
  /** Lv.1–9 bonus. */
  pct: number;
  /** Lv.10 覺醒 bonus. */
  awakenPct: number;
  /** 墨厄討伐 only: one limited extra shield shred on the trigger (Match3 raid mode, RAID_SHRED). */
  raidShred?: boolean;
};
export const ARMED_WINDOW_MOVES = 5;

export type ArtifactDef = {
  /** equipmentId — stable 命器種類 ID. */
  id: string;
  name: string;
  rarity: ArtifactRarity;
  /** Stable character ID of the 命定之人; null for generic 命器. */
  exclusiveCharacterId: string | null;
  /** 角色文案 / 命器故事. */
  lore: string;
  general: { name: string; text: string; rule: ArtifactRule };
  exclusive: ExclusiveDef | null;
  /** Formal art (own field; never a character card / portrait / CG). null → shared placeholder. */
  image: string | null;
  /** Lv.10 覺醒: name, effect text, and presentation slots. */
  awaken: { title: string | null; text: string | null; image: string | null; line: string | null };
  /** test-values = 第一版平衡測試值 (names / text locked). */
  status: "test-values";
};

export const ARTIFACT_PLACEHOLDER = "/artifacts/placeholder.svg";
export const artifactImage = (d: Pick<ArtifactDef, "image">) => d.image ?? ARTIFACT_PLACEHOLDER;

export const ARTIFACT_MAX_LEVEL = 10;
/**
 * 集中曲線: share of the Lv.1→Lv.10 gap reached at each level (index 0 = Lv.1).
 * Monotone, so Lv.10 is never weaker than Lv.9; Lv.5 (進階) and Lv.10 (覺醒) are the bigger steps.
 */
export const LEVEL_CURVE = [0, 0.1, 0.2, 0.3, 0.45, 0.55, 0.65, 0.75, 0.85, 1] as const;
export function scaled(v: Scaled, level: number, integer = false): number {
  const lv = Math.max(1, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(level) || 1));
  const x = v[0] + (v[1] - v[0]) * LEVEL_CURVE[lv - 1]!;
  return integer ? Math.round(x) : Math.round(x * 1000) / 1000;
}

const NO_AWAKEN = { title: null, text: null, image: null, line: null } as const;

/** 專屬 bonus at a level: Lv.1–9 base, Lv.10 覺醒. */
export const exclusivePct = (ex: Pick<ExclusiveDef, "pct" | "awakenPct">, level: number) =>
  Math.floor(level) >= ARTIFACT_MAX_LEVEL ? ex.awakenPct : ex.pct;
/**
 * Lv.10 value of an exclusive 命器's 通用被動 = Lv.1 × GENERAL_GROWTH (初版測試值, 待確認).
 * The official text fixes Lv.1 only; growth is kept here so it can be rebalanced in one place.
 */
export const GENERAL_GROWTH = 1.5;
const grow = (lv1: number): Scaled => [lv1, Math.round(lv1 * GENERAL_GROWTH * 1000) / 1000];

type ExArgs = { owner: string; lore: string; general: ArtifactDef["general"]; exclusive: ExclusiveDef; awaken: { title: string; text: string }; image?: string };
const exc = (rarity: "SSR" | "SS", id: string, name: string, x: ExArgs): ArtifactDef => ({
  id,
  name,
  rarity,
  exclusiveCharacterId: x.owner,
  lore: x.lore,
  general: x.general,
  exclusive: x.exclusive,
  image: x.image ?? null,
  awaken: { ...NO_AWAKEN, ...x.awaken },
  status: "test-values",
});
const gen = (id: string, name: string, rarity: "S" | "R", lore: string, general: ArtifactDef["general"], image?: string): ArtifactDef => ({
  id,
  name,
  rarity,
  exclusiveCharacterId: null,
  lore,
  general,
  exclusive: null,
  image: image ?? null,
  awaken: { ...NO_AWAKEN },
  status: "test-values",
});

/** Weaker stand-ins (統一規則 12) for modes without seals / milestones / goals. */
const NO_SEAL_FALLBACK: Fallback = { when: "seal", rule: { kind: "wavePct", cond: { on: "normal" }, pct: [0.04, 0.06], uses: 2 } };
const NO_MILESTONE_FALLBACK: Fallback = { when: "milestone", rule: { kind: "movePct", cond: { on: "chain", min: 2 }, pct: [0.05, 0.075], uses: 1 } };
const NO_GOAL_FALLBACK: Fallback = { when: "goal", rule: { kind: "movePct", cond: { on: "chain", min: 2 }, pct: [0.06, 0.09], uses: 1 } };

/* ──────────── 15 專屬（docs/V2_USER_MINGQI_15_OFFICIAL.md，t360u 原文；數值為第一版測試值） ──────────── */
const EXCLUSIVE_ARTIFACTS: ArtifactDef[] = [
  exc("SSR", "liuhe-xuanxi", "六合玄璽", {
    image: "/artifacts/liuhe-xuanxi.png",
    owner: "qin",
    lore: "「六合歸一，萬象俯首。唯有你，不必向朕低頭。」",
    general: { name: "帝威", text: "每關首次由玩家正常移動消除 5 顆以上玉石時，該次得分增加 12%。所有角色裝備均可啟動。", rule: { kind: "wavePct", cond: { on: "normalBig", min: 5 }, pct: grow(0.12), uses: 1 } },
    exclusive: { name: "萬象歸秦", text: "僅嬴政裝備時生效。嬴政發動原技能「橫掃六合」後，下一次由玩家正常移動產生的有效消除，得分增加 25%。每次原技能發動最多觸發一次。", skillId: "qin", cond: { on: "normal" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "六合同歸", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖黑金龍紋與玄璽光影演出。" },
  }),
  exc("SSR", "chibi-guqin", "赤壁古琴", {
    image: "/artifacts/chibi-guqin.png",
    owner: "zhouyu",
    lore: "「一曲未終，江火已燃。這一闋，只為你而奏。」",
    general: { name: "弦音餘韻", text: "每關前 3 次刻玉實際引爆時，該次得分增加 8%。所有角色裝備均可啟動。", rule: { kind: "wavePct", cond: { on: "line" }, pct: grow(0.08), uses: 3 } },
    exclusive: { name: "赤壁焚音", text: "僅周瑜裝備時生效。周瑜發動原技能「火燒赤壁」後，下一次橫刻玉實際引爆時，該次得分增加 30%。每次原技能發動最多觸發一次。", skillId: "zhouyu", cond: { on: "rowLine" }, pct: 0.3, awakenPct: 0.4 },
    awaken: { title: "焚江一曲", text: "Lv.10 時，專屬技能得分加成由 30% 提升至 40%。解鎖琴弦化為赤焰、江面燃起火光的專屬演出。" },
  }),
  exc("SSR", "zhangui-jinmian", "戰鬼金面", {
    image: "/artifacts/zhangui-jinmian.png",
    owner: "lanling",
    lore: "「世人畏我金面，唯你能見面具之下的真心。」",
    general: { name: "破陣", text: "每關前 3 次金鑲玉實際引爆時，該次得分增加 10%。所有角色裝備均可啟動。", rule: { kind: "wavePct", cond: { on: "bomb" }, pct: grow(0.1), uses: 3 } },
    exclusive: { name: "入陣無雙", text: "僅蘭陵王裝備時生效。蘭陵王發動原技能「入陣曲」後，下一次金鑲玉實際引爆時，該次得分增加 30%。每次原技能發動最多觸發一次。", skillId: "lanling", cond: { on: "bomb" }, pct: 0.3, awakenPct: 0.4 },
    awaken: { title: "金面傾心", text: "Lv.10 時，專屬技能得分加成由 30% 提升至 40%。解鎖戰鬼金面破光與金色戰陣演出。" },
  }),
  exc("SSR", "taibai-zuiyuehu", "太白醉月壺", {
    image: "/artifacts/taibai-zuiyuehu.png",
    owner: "libai",
    lore: "「世間千杯酒，不及與你共飲這一盞月色。」",
    general: { name: "邀月", text: "每關首次由玩家正常移動引發至少 3 波連鎖消除時，該次連鎖總得分增加 15%。所有角色裝備均可啟動。", rule: { kind: "movePct", cond: { on: "chain", min: 3 }, pct: grow(0.15), uses: 1 } },
    exclusive: { name: "斗酒邀月", text: "僅李白裝備時生效。李白發動原技能「醉月吟」後，下一次由玩家正常移動產生的有效消除，得分增加 25%。每次原技能發動最多觸發一次。", skillId: "libai", cond: { on: "normal" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "醉月成詩", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖明月映入酒壺、銀白詩句飄散的專屬演出。" },
  }),
  exc("SSR", "jinwu-fengchai", "金屋鳳釵", {
    image: "/artifacts/jinwu-fengchai.png",
    owner: "liuche",
    lore: "「朕可為你築一座金屋，卻更想留住你自願回眸的心。」",
    general: { name: "金闕", text: "每關首次由玩家正常移動，使累計分數跨越該關預設分數里程碑時，該次得分增加 10%。所有角色裝備均可啟動。", rule: { kind: "movePct", cond: { on: "milestone" }, pct: grow(0.1), uses: 1, fallback: NO_MILESTONE_FALLBACK } },
    exclusive: { name: "金屋藏嬌", text: "僅劉徹裝備時生效。劉徹發動原技能「漢闕天威」後，下一次由玩家正常移動產生的有效消除，得分增加 25%。每次原技能發動最多觸發一次。", skillId: "liuche", cond: { on: "normal" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "鳳歸金闕", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖金鳳飛舞與宮闕流光演出。" },
  }),
  exc("SS", "lvqi", "綠綺", {
    image: "/artifacts/lvqi.png",
    owner: "sima",
    lore: "「琴有知音，心有所歸。此生一曲，只待你來聽。」",
    general: { name: "鳳鳴", text: "每關前 2 次龍珠實際引爆時，該次得分增加 12%。所有角色裝備均可啟動。", rule: { kind: "wavePct", cond: { on: "color" }, pct: grow(0.12), uses: 2 } },
    exclusive: { name: "鳳求凰", text: "僅司馬相如裝備時生效。司馬相如發動原技能「鳳求凰」後，下一次龍珠實際引爆時，該次得分增加 25%。每次原技能發動最多觸發一次。", skillId: "sima", cond: { on: "color" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "雙鳳和鳴", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖雙鳳交頸、琴音化羽的專屬演出。" },
  }),
  exc("SS", "wolong-yushan", "臥龍羽扇", {
    image: "/artifacts/wolong-yushan.png",
    owner: "zhuge",
    lore: "「天下風雲皆可推演，唯獨與你相逢，是我甘願的變數。」",
    general: { name: "觀星", text: "每關首次由玩家正常移動消除 4 顆以上玉石時，裝備角色額外獲得 2 點技能蓄力。所有角色裝備均可啟動。", rule: { kind: "charge", cond: { on: "normalBig", min: 4 }, energy: [2, 3], uses: 1 } },
    exclusive: { name: "借東風", text: "僅諸葛亮裝備時生效。諸葛亮發動原技能「草船借箭」後，下一次刻玉實際引爆時，該次得分增加 25%。每次原技能發動最多觸發一次。", skillId: "zhuge", cond: { on: "line" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "星落八陣", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖八卦星陣與羽扇流光演出。" },
  }),
  exc("SS", "fenglang-yinqiang", "封狼銀槍", {
    image: "/artifacts/fenglang-yinqiang.png",
    owner: "huo",
    lore: "「此槍為山河而戰，而我歸來，只為見你。」",
    general: { name: "疾鋒", text: "每關前 2 次在同一步玩家移動中實際引爆至少兩種不同特殊玉石時，該次總得分增加 15%。所有角色裝備均可啟動。", rule: { kind: "movePct", cond: { on: "specialKinds", min: 2 }, pct: grow(0.15), uses: 2 } },
    exclusive: { name: "封狼居胥", text: "僅霍去病裝備時生效。霍去病發動原技能「疾鋒破陣」後，下一次金鑲玉或刻玉實際引爆時，該次得分增加 30%。每次原技能發動最多觸發一次。", skillId: "huo", cond: { on: "lineOrBomb" }, pct: 0.3, awakenPct: 0.4 },
    awaken: { title: "少年封侯", text: "Lv.10 時，專屬技能得分加成由 30% 提升至 40%。解鎖銀狼奔襲與長槍破空演出。" },
  }),
  exc("SS", "weiwu-hufu", "魏武虎符", {
    image: "/artifacts/weiwu-hufu.png",
    owner: "caocao",
    lore: "「天下人心難測，唯你面前，我不必藏鋒。」",
    general: { name: "號令", text: "每關前 3 次實際解除墨封時，該次得分增加 10%。所有角色裝備均可啟動。", rule: { kind: "wavePct", cond: { on: "sealBroken" }, pct: grow(0.1), uses: 3, fallback: NO_SEAL_FALLBACK } },
    exclusive: { name: "魏武軍令", text: "僅曹操裝備時生效。曹操發動原技能「挾天子以令諸侯」後，下一次實際解除墨封時，該次得分增加 30%。墨厄討伐中，該次另附加一次有限額的護盾削減效果。每次原技能發動最多觸發一次。", skillId: "caocao", cond: { on: "sealBroken" }, pct: 0.3, awakenPct: 0.4, raidShred: true },
    awaken: { title: "魏武雄圖", text: "Lv.10 時，專屬技能得分加成由 30% 提升至 40%。解鎖玄金虎影與軍旗翻湧演出。" },
  }),
  exc("SS", "zhenguan-longxi", "貞觀龍璽", {
    image: "/artifacts/zhenguan-longxi.png",
    owner: "lishimin",
    lore: "「朕願與你共看長安燈火，而非只讓你仰望帝王。」",
    general: { name: "盛世", text: "每關首次由玩家正常移動完成預設關卡目標里程碑時，該次得分增加 12%。所有角色裝備均可啟動。", rule: { kind: "movePct", cond: { on: "goal" }, pct: grow(0.12), uses: 1, fallback: NO_GOAL_FALLBACK } },
    exclusive: { name: "貞觀長安", text: "僅李世民裝備時生效。李世民發動原技能「貞觀之治」後，下一次由玩家正常移動產生的有效消除，得分增加 25%。每次原技能發動最多觸發一次。", skillId: "lishimin", cond: { on: "normal" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "萬邦來朝", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖盛唐宮闕與金色龍紋演出。" },
  }),
  exc("SS", "yixue-duanyan", "憶雪端硯", {
    image: "/artifacts/yixue-duanyan.png",
    owner: "nalan",
    lore: "「人生若只如初見，我願每一場初見，都是你。」",
    general: { name: "憶雪", text: "每關前 3 次刻玉實際引爆時，該次得分增加 8%。所有角色裝備均可啟動。", rule: { kind: "wavePct", cond: { on: "line" }, pct: grow(0.08), uses: 3 } },
    exclusive: { name: "人生初見", text: "僅納蘭性德裝備時生效。納蘭性德發動原技能「人生若只如初見」後，下一次刻玉實際引爆時，該次得分增加 25%。每次原技能發動最多觸發一次。", skillId: "nalan", cond: { on: "line" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "一生一代", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖落雪、紅梅與墨字消散演出。" },
  }),
  exc("SS", "luoyang-xiangnang", "洛陽香囊", {
    image: "/artifacts/luoyang-xiangnang.png",
    owner: "panan",
    lore: "「滿城花果皆向我來，而我只願走向你。」",
    general: { name: "流芳", text: "每關首次連續兩次玩家有效移動都產生消除時，第二次得分增加 12%。所有角色裝備均可啟動。", rule: { kind: "movePct", cond: { on: "consecutive" }, pct: grow(0.12), uses: 1 } },
    exclusive: { name: "擲果留香", text: "僅潘安裝備時生效。潘安發動原技能「擲果盈車」後，下一次刻玉實際引爆時，該次得分增加 25%。每次原技能發動最多觸發一次。", skillId: "panan", cond: { on: "line" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "滿城春色", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖洛陽花雨與香囊流光演出。" },
  }),
  exc("SS", "wushan-yunpei", "巫山雲佩", {
    image: "/artifacts/wushan-yunpei.png",
    owner: "songyu",
    lore: "「朝為雲，暮為雨，千般幻夢，不及與你相逢。」",
    general: { name: "雲夢", text: "每關前 2 次金鑲玉實際引爆時，該次得分增加 12%。所有角色裝備均可啟動。", rule: { kind: "wavePct", cond: { on: "bomb" }, pct: grow(0.12), uses: 2 } },
    exclusive: { name: "高唐雲雨", text: "僅宋玉裝備時生效。宋玉發動原技能「高唐神女」後，下一次金鑲玉實際引爆時，該次得分增加 25%。每次原技能發動最多觸發一次。", skillId: "songyu", cond: { on: "bomb" }, pct: 0.25, awakenPct: 0.35 },
    awaken: { title: "雲夢相思", text: "Lv.10 時，專屬技能得分加成由 25% 提升至 35%。解鎖流雲、花雨與巫山幻境演出。" },
  }),
  exc("SS", "tiema-hanfeng", "鐵馬寒鋒", {
    image: "/artifacts/tiema-hanfeng.png",
    owner: "luyou",
    lore: "「鐵馬冰河入夢來，夢醒之時，仍願與你共白頭。」",
    general: { name: "破冰", text: "每關前 3 次實際解除墨封或冰封時，該次得分增加 10%。所有角色裝備均可啟動。", rule: { kind: "wavePct", cond: { on: "seal" }, pct: grow(0.1), uses: 3, fallback: NO_SEAL_FALLBACK } },
    exclusive: { name: "山河入夢", text: "僅陸游裝備時生效。陸游發動原技能「鐵馬冰河」後，下一次實際解除墨封或冰封時，該次得分增加 30%。墨厄討伐中，該次另附加一次有限額的護盾削減效果。每次原技能發動最多觸發一次。", skillId: "luyou", cond: { on: "seal" }, pct: 0.3, awakenPct: 0.4, raidShred: true },
    awaken: { title: "冰河長夢", text: "Lv.10 時，專屬技能得分加成由 30% 提升至 40%。解鎖冰河鐵騎與寒鋒劍光演出。" },
  }),
  exc("SS", "longdan-yinqiang", "龍膽銀槍", {
    image: "/artifacts/longdan-yinqiang.png",
    owner: "zhaoyun",
    lore: "「千軍萬馬之中，我的槍鋒永遠為你留一條歸路。」",
    general: { name: "龍膽", text: "每關首次在同一步玩家移動中，連續引爆至少兩次金鑲玉時，該次總得分增加 15%。所有角色裝備均可啟動。", rule: { kind: "movePct", cond: { on: "bombs", min: 2 }, pct: grow(0.15), uses: 1 } },
    exclusive: { name: "常山龍吟", text: "僅趙雲裝備時生效。趙雲發動原技能「七進七出」後，下一次金鑲玉實際引爆時，該次得分增加 30%。每次原技能發動最多觸發一次。", skillId: "zhaoyun", cond: { on: "bomb" }, pct: 0.3, awakenPct: 0.4 },
    awaken: { title: "銀龍破陣", text: "Lv.10 時，專屬技能得分加成由 30% 提升至 40%。解鎖銀龍盤旋與長槍突進演出。" },
  }),
];

/* ───────────────── 12 通用（t359u 鎖定名稱與初版測試數值） ───────────────── */
const GENERIC_ARTIFACTS: ArtifactDef[] = [
  // S
  gen("qingluan-yupei", "青鸞玉佩", "S", "青鸞銜玉，玉聲清越，引眾玉相隨。", {
    name: "青鸞引玉",
    text: "本關前 3 次「消除 4 顆以上」的那一波，得分 +12%（Lv.10 +20%）。",
    rule: { kind: "wavePct", cond: { on: "big", min: 4 }, pct: [0.12, 0.2], uses: 3 },
  }, "/artifacts/qingluan-yupei.png"),
  gen("xingluo-pan", "星羅盤", "S", "盤上星軌相連，一動則萬象隨之流轉。", {
    name: "星軌相連",
    text: "本關前 3 次連消波，得分 +12%（Lv.10 +20%）。",
    rule: { kind: "wavePct", cond: { on: "cascade" }, pct: [0.12, 0.2], uses: 3 },
  }, "/artifacts/xingluo-pan.png"),
  gen("chixia-ren", "赤霞刃", "S", "刃光如晚霞，劈開的不只是陣，還有長夜。", {
    name: "霞光破陣",
    text: "本關前 3 次刻玉引爆的那一波，得分 +12%（Lv.10 +20%）。",
    rule: { kind: "wavePct", cond: { on: "line" }, pct: [0.12, 0.2], uses: 3 },
  }, "/artifacts/chixia-ren.png"),
  gen("liujin-lianzan", "鎏金蓮簪", "S", "鎏金蓮瓣層層綻開，燈下照影，一室生輝。", {
    name: "金蓮照影",
    text: "本關前 3 次金鑲玉引爆的那一波，得分 +12%（Lv.10 +20%）。",
    rule: { kind: "wavePct", cond: { on: "bomb" }, pct: [0.12, 0.2], uses: 3 },
  }, "/artifacts/liujin-lianzan.png"),
  gen("shuanghua-yufu", "霜華玉符", "S", "霜華凝於符上，千結自解，萬封自融。", {
    name: "霜解千結",
    text: "本關前 3 次擊中墨封或冰封的那一波，得分 +12%（Lv.10 +20%）。無墨封、冰封的關卡改為：前 3 次連消波 +6%（Lv.10 +10%）。",
    rule: {
      kind: "wavePct",
      cond: { on: "seal" },
      pct: [0.12, 0.2],
      uses: 3,
      fallback: { when: "seal", rule: { kind: "wavePct", cond: { on: "cascade" }, pct: [0.06, 0.1], uses: 3 } },
    },
  }, "/artifacts/shuanghua-yufu.png"),
  gen("wangyue-yinling", "望月銀鈴", "S", "望月時輕搖，鈴音凝神，心緒便落定了。", {
    name: "月音凝神",
    text: "每關一次：第一次由玩家移動直接消除 5 顆以上時，裝備者額外蓄勢 +2（Lv.10 +4）。只充裝備者本人。",
    rule: { kind: "charge", cond: { on: "normalBig", min: 5 }, energy: [2, 4], uses: 1 },
  }, "/artifacts/wangyue-yinling.png"),
  // R
  gen("suxin-yuzhui", "素心玉墜", "R", "一枚素淨玉墜，貼身而戴，溫潤如初心。", {
    name: "玉心",
    text: "本關前 2 次有效普通消除，得分 +5%（Lv.10 +10%）。",
    rule: { kind: "wavePct", cond: { on: "normal" }, pct: [0.05, 0.1], uses: 2 },
  }, "/artifacts/suxin-yuzhui.png"),
  gen("qingzhu-shuqian", "青竹書籤", "R", "青竹削成的書籤，夾在讀到一半的詩卷裡。", {
    name: "竹影",
    text: "本關第一次「消除 4 顆以上」的那一波，得分 +8%（Lv.10 +15%）。",
    rule: { kind: "wavePct", cond: { on: "big", min: 4 }, pct: [0.08, 0.15], uses: 1 },
  }, "/artifacts/qingzhu-shuqian.png"),
  gen("zhusha-mobi", "朱砂墨筆", "R", "筆尖一點朱砂，落處便成了記號。", {
    name: "點墨",
    text: "本關前 2 次刻玉引爆的那一波，得分 +6%（Lv.10 +12%）。",
    rule: { kind: "wavePct", cond: { on: "line" }, pct: [0.06, 0.12], uses: 2 },
  }, "/artifacts/zhusha-mobi.png"),
  gen("liuyun-xiangnang", "流雲香囊", "R", "流雲紋繡的小香囊，氣息如雲，久久不散。", {
    name: "雲息",
    text: "本關第一次金鑲玉引爆的那一波，得分 +8%（Lv.10 +15%）。",
    rule: { kind: "wavePct", cond: { on: "bomb" }, pct: [0.08, 0.15], uses: 1 },
  }, "/artifacts/liuyun-xiangnang.png"),
  gen("xuantie-hufu", "玄鐵護符", "R", "玄鐵打成的護符，沉沉一枚，鎮得住墨氣。", {
    name: "鎮墨",
    text: "本關前 2 次擊中墨封或冰封的那一波，得分 +6%（Lv.10 +12%）。無墨封、冰封的關卡改為：前 2 次有效普通消除 +3%（Lv.10 +6%）。",
    rule: {
      kind: "wavePct",
      cond: { on: "seal" },
      pct: [0.06, 0.12],
      uses: 2,
      fallback: { when: "seal", rule: { kind: "wavePct", cond: { on: "normal" }, pct: [0.03, 0.06], uses: 2 } },
    },
  }, "/artifacts/xuantie-hufu.png"),
  gen("tongque-xiaoling", "銅雀小鈴", "R", "銅雀形的小鈴，一聲清音，喚人回神。", {
    name: "清音",
    text: "每關一次：第一次由玩家移動直接消除 5 顆以上時，裝備者額外蓄勢 +1（Lv.10 +2）。只充裝備者本人。",
    rule: { kind: "charge", cond: { on: "normalBig", min: 5 }, energy: [1, 2], uses: 1 },
  }, "/artifacts/tongque-xiaoling.png"),
];

export const ARTIFACTS: ArtifactDef[] = [...EXCLUSIVE_ARTIFACTS, ...GENERIC_ARTIFACTS];
export const ARTIFACT_BY_ID: Record<string, ArtifactDef> = Object.fromEntries(ARTIFACTS.map((a) => [a.id, a]));
/** The free basic generic 命器 granted once when 命器閣 first opens. */
export const VAULT_GIFT_ID = "suxin-yuzhui";

/* ───────────────────────── materials ───────────────────────── */

export type MaterialId = "jingmosha" | "zhenejing" | "tianmingcanyin" | "suyuanlu";
export const MATERIALS: { id: MaterialId; name: string; tier: string; source: string }[] = [
  { id: "jingmosha", name: "淨墨砂", tier: "基礎命器升級材料", source: "鎮厄司・普通討伐（第 10 關開放）" },
  { id: "zhenejing", name: "鎮厄晶", tier: "中階命器升級材料", source: "鎮厄司・精英討伐（第 20 關開放）" },
  { id: "tianmingcanyin", name: "天命殘印", tier: "高階升級及覺醒材料", source: "鎮厄司・首領封印（第 40 關開放）" },
  { id: "suyuanlu", name: "溯緣露", tier: "命器互動、台詞、回憶解鎖材料", source: "首通、里程碑、特殊挑戰（待開放）" },
];
export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

/* ───────────────────────── save model ───────────────────────── */

export type ArtifactInstance = {
  /** instanceId */
  uid: string;
  /** equipmentId */
  eid: string;
  level: number;
  /** equippedCharacterId (single source of truth for the equip relation). */
  equippedBy: string | null;
  locked: boolean;
};

export type ArtifactSave = {
  instances: ArtifactInstance[];
  materials: Record<MaterialId, number>;
  /** One-time grant keys already paid (e.g. "vault-gift"); sticky, so a grant can never repeat. */
  grants: string[];
  /** Next instance serial (instance ids are never reused). */
  serial: number;
};

export const emptyMaterials = (): Record<MaterialId, number> => ({ jingmosha: 0, zhenejing: 0, tianmingcanyin: 0, suyuanlu: 0 });
export const emptyArtifacts = (): ArtifactSave => ({ instances: [], materials: emptyMaterials(), grants: [], serial: 1 });

// Inventory is unbounded: paid independent instances must survive reload.
const knownChar = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(BY_ID, id);

/**
 * Load-time / cloud cleaner. Never deletes a valid instance: an invalid equip (unknown or unowned
 * character, or a second instance on the same character) only drops back to the vault.
 */
export function cleanArtifacts(raw: unknown, owned: Record<string, number>): ArtifactSave {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<ArtifactSave>) : {};
  const seen = new Set<string>();
  const wearer = new Set<string>();
  const instances: ArtifactInstance[] = [];
  let maxSerial = 0;
  for (const it of Array.isArray(r.instances) ? r.instances : []) {
    if (!it || typeof it !== "object") continue;
    const x = it as Partial<ArtifactInstance>;
    if (typeof x.uid !== "string" || !/^a\d{1,9}$/.test(x.uid) || seen.has(x.uid)) continue;
    if (typeof x.eid !== "string" || !ARTIFACT_BY_ID[x.eid]) continue;
    seen.add(x.uid);
    maxSerial = Math.max(maxSerial, Number(x.uid.slice(1)));
    let by = knownChar(x.equippedBy) && (owned[x.equippedBy] ?? 0) > 0 ? x.equippedBy : null;
    if (by && wearer.has(by)) by = null;
    if (by) wearer.add(by);
    const lv = Number.isFinite(x.level) ? Math.floor(x.level as number) : 1;
    instances.push({ uid: x.uid, eid: x.eid, level: Math.max(1, Math.min(ARTIFACT_MAX_LEVEL, lv)), equippedBy: by, locked: x.locked === true });
  }
  const materials = emptyMaterials();
  const rm = r.materials && typeof r.materials === "object" ? (r.materials as Record<string, unknown>) : {};
  for (const id of MATERIAL_IDS) {
    const n = rm[id];
    materials[id] = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(999_999, Math.floor(n))) : 0;
  }
  const grants = Array.isArray(r.grants) ? [...new Set(r.grants.filter((g): g is string => typeof g === "string" && /^[a-z0-9:-]{1,40}$/.test(g)))].slice(0, 200) : [];
  const serial = Math.max(maxSerial + 1, Number.isInteger(r.serial) ? (r.serial as number) : 1);
  return { instances, materials, grants, serial: Math.min(serial, 999_999_999) };
}

/** Add a new instance (duplicates stay separate instances — never auto-dismantled). */
export function addInstance(save: ArtifactSave, eid: string): { save: ArtifactSave; instance: ArtifactInstance | null } {
  if (!ARTIFACT_BY_ID[eid]) return { save, instance: null };
  const instance: ArtifactInstance = { uid: `a${save.serial}`, eid, level: 1, equippedBy: null, locked: false };
  return { save: { ...save, instances: [...save.instances, instance], serial: save.serial + 1 }, instance };
}

/** One-time grant: pays only if `key` was never paid. */
export function grantOnce(save: ArtifactSave, key: string, eid: string): { save: ArtifactSave; granted: ArtifactInstance | null } {
  if (save.grants.includes(key)) return { save, granted: null };
  const added = addInstance(save, eid);
  if (!added.instance) return { save, granted: null };
  return { save: { ...added.save, grants: [...added.save.grants, key] }, granted: added.instance };
}

export const instanceOf = (save: ArtifactSave, uid: string) => save.instances.find((i) => i.uid === uid) ?? null;
export const equippedOn = (save: ArtifactSave, charId: string) => save.instances.find((i) => i.equippedBy === charId) ?? null;

export type EquipResult =
  | { ok: true; save: ArtifactSave; from: string | null; replaced: string | null }
  | { ok: false; reason: "unknown-instance" | "unknown-character" | "not-owned" | "locked" | "battle-active" | "save-failed"; from?: undefined }
  | { ok: false; reason: "needs-confirm" | "needs-replace-confirm"; from: string };

/** 「此器已裝備於某角色，確定要轉移嗎？」 */
export const transferPrompt = (fromName: string, toName: string, artifact: string) =>
  `此器已裝備於${fromName}，確定要轉移給${toName}嗎？（${artifact}）`;
export const NON_OWNER_HINT = "唯與命定之人相契，方能喚醒此器真意。";

/**
 * Equip `uid` on `charId`. Any owned character may wear any instance.
 * Moving an instance off another character needs `confirmTransfer`; the character's previous
 * instance (if any) goes back to the vault — nothing is ever lost.
 */
export function equipArtifact(
  save: ArtifactSave,
  uid: string,
  charId: string,
  owned: Record<string, number>,
  confirmTransfer = false,
): EquipResult {
  const inst = instanceOf(save, uid);
  if (!inst) return { ok: false, reason: "unknown-instance" };
  if (!knownChar(charId)) return { ok: false, reason: "unknown-character" };
  if ((owned[charId] ?? 0) <= 0) return { ok: false, reason: "not-owned" };
  if (inst.equippedBy === charId) return { ok: true, save, from: charId, replaced: null };
  if (inst.equippedBy && !confirmTransfer) return { ok: false, reason: "needs-confirm", from: inst.equippedBy };
  const prev = equippedOn(save, charId);
  const instances = save.instances.map((i) =>
    i.uid === uid ? { ...i, equippedBy: charId } : prev && i.uid === prev.uid ? { ...i, equippedBy: null } : i,
  );
  return { ok: true, save: { ...save, instances }, from: inst.equippedBy, replaced: prev?.uid ?? null };
}

export function unequipArtifact(save: ArtifactSave, uid: string): ArtifactSave {
  if (!instanceOf(save, uid)?.equippedBy) return save;
  return { ...save, instances: save.instances.map((i) => (i.uid === uid ? { ...i, equippedBy: null } : i)) };
}

export function setArtifactLock(save: ArtifactSave, uid: string, locked: boolean): ArtifactSave {
  return { ...save, instances: save.instances.map((i) => (i.uid === uid ? { ...i, locked } : i)) };
}

/** Does the wearer wake this 命器's exclusive layer? Strict character-ID equality. */
export function exclusiveActive(def: Pick<ArtifactDef, "exclusive" | "exclusiveCharacterId">, wearerId: string | null): boolean {
  return !!def.exclusive && !!def.exclusiveCharacterId && wearerId === def.exclusiveCharacterId;
}

/* ───────────────────────── stage-gated unlocks ───────────────────────── */

/** 第 N 關通關 → system opens. Derived from stars, so players who already cleared auto-unlock. */
export const UNLOCK_AT = { vault: 5, raid: 10, elite: 20, resonance: 30, sovereign: 40, awaken: 50 } as const;
export type UnlockKey = keyof typeof UNLOCK_AT;
export const UNLOCK_NAMES: Record<UnlockKey, string> = {
  vault: "命器閣",
  raid: "鎮厄司",
  elite: "精英討伐",
  resonance: "命器共鳴",
  sovereign: "首領封印",
  awaken: "命器覺醒",
};
export const levelCleared = (m3: Record<string, LevelRecord>, id: number) => (m3[String(id)]?.stars ?? 0) > 0;
export function artifactUnlocks(m3: Record<string, LevelRecord>, dev = false): Record<UnlockKey, boolean> {
  const out = {} as Record<UnlockKey, boolean>;
  for (const k of Object.keys(UNLOCK_AT) as UnlockKey[]) out[k] = dev || levelCleared(m3, UNLOCK_AT[k]);
  return out;
}

export const VAULT_GIFT_KEY = "vault-gift";
export const VAULT_GIFT_SEEN_KEY = "vault-gift-seen";
/** First 命器閣 unlock pays ONE free basic generic 命器 — idempotent (sticky grant key). */
export function claimVaultGift(save: ArtifactSave, m3: Record<string, LevelRecord>, dev = false) {
  if (!artifactUnlocks(m3, dev).vault) return { save, granted: null as ArtifactInstance | null };
  return grantOnce(save, VAULT_GIFT_KEY, VAULT_GIFT_ID);
}
