import type { Rarity } from "./data.ts";
import { bondLevel } from "./bond.ts";

/**
 * 三消 助陣 skills. One owned character helps in a level; the player taps their
 * portrait to 發動 the skill — once per level — and everything below happens then.
 * Rarity sets the power band (R small & shared · S moderate · SS strong & distinct
 * · SSR unique signature), and 緣分 grows it in three steps:
 *   壹 = tier 0–2 · 貳 = tier 3–5 · 參 = tier 6.
 * Assist applies to all 50 levels.
 */
export type SkillFx = {
  /** Legacy: extra moves. Shared combat no longer has 步 — kept in the type only; never set in the data. */
  moves?: number;
  /** 氣血 restored on 發動 (capped at max). Former +步 converted at 70 血 per move; support skills heal too. */
  heal?: number;
  /** Score multiplier on cleared jades from 發動 on (not on the leftover-move bonus). */
  mult?: number;
  /** Line jades placed on 發動 (random direction). */
  line?: number;
  /** Horizontal line jades placed on 發動. */
  row?: number;
  /** 金鑲玉 placed on 發動. */
  bomb?: number;
  /** 龍珠 placed on 發動. */
  color?: number;
  /** Seal layers cracked on 發動. */
  seals?: number;
  /** Extra share of the level's first-clear 墨玉 star reward (if the skill was used). */
  reward?: number;
  /** On 發動: clear every jade of the commonest colour. */
  sweep?: boolean;
  /** On 發動: burn this many rows (sealed rows first). */
  burn?: number;
};

export type Skill = { id: string; name: string; flavor: string; steps: [SkillFx, SkillFx, SkillFx] };

const sk = (id: string, name: string, flavor: string, steps: [SkillFx, SkillFx, SkillFx]): Skill => ({ id, name, flavor, steps });

/* ---------- R: three shared, small skills ---------- */
const R_POET = sk("r-poet", "吟哦", "一句好詩，養一口氣。", [{ heal: 70 }, { heal: 70, mult: 1.03 }, { heal: 140, mult: 1.03 }]);
const R_BRUSH = sk("r-brush", "潤筆", "山水清音，落子生輝。", [{ mult: 1.05, heal: 70 }, { mult: 1.08, heal: 90 }, { mult: 1.1, heal: 110 }]);
const R_VANGUARD = sk("r-vanguard", "先登", "先登陷陣，替你化開一道墨封。", [{ seals: 1 }, { seals: 1, mult: 1.03 }, { seals: 2, heal: 70 }]);

const R_GROUP: Record<string, Skill> = {};
for (const id of ["machao", "zhoutai", "luxun", "jiangwei", "shaonianchanggong", "ganning", "taishici", "wangchangling", "censhen", "gaoshi", "wangzhihuan"]) R_GROUP[id] = R_VANGUARD;
for (const id of ["tao", "meng", "xielingyun", "weiyingwu", "liuzongyuan", "zhangruoxu", "qinguan", "yanjiandao", "huangtingjian"]) R_GROUP[id] = R_BRUSH;
for (const id of ["baijuyi", "dumu", "luobinwang", "chenziang", "wangbo", "hezhizhang", "liuyuxi", "yuanzhen", "lihe", "cuihao"]) R_GROUP[id] = R_POET;

/* ---------- S: moderate, varied ---------- */
const S_SKILLS: Record<string, Skill> = {
  sushi: sk("sushi", "一蓑煙雨", "竹杖芒鞋輕勝馬，一蓑煙雨任平生。", [{ heal: 140 }, { heal: 140, mult: 1.03 }, { heal: 210, mult: 1.03 }]),
  hanxin: sk("hanxin", "多多益善", "兵仙點將，先列兩道刻玉。", [{ line: 2 }, { line: 2, heal: 70 }, { line: 3, heal: 70 }]),
  dufu: sk("dufu", "下筆有神", "讀書破萬卷，一步一刻。", [{ heal: 70, line: 1 }, { heal: 140, line: 1 }, { heal: 140, line: 2 }]),
  yuefei: sk("yuefei", "直搗黃龍", "精忠破陣，先化墨封，再開一路。", [{ seals: 2, line: 1 }, { seals: 3, line: 1 }, { seals: 3, line: 1, heal: 70 }]),
  wangwei: sk("wangwei", "詩中有畫", "空山新雨，每一顆玉都更值錢。", [{ mult: 1.08, heal: 70 }, { mult: 1.1, heal: 140 }, { mult: 1.12, heal: 160 }]),
  xinqiji: sk("xinqiji", "醉裡挑燈", "挑燈看劍，劍氣成線。", [{ line: 1, mult: 1.04 }, { line: 1, mult: 1.06, heal: 70 }, { line: 2, mult: 1.06, heal: 70 }]),
  xiangyu: sk("xiangyu", "破釜沉舟", "不留退路，只留刻玉。", [{ line: 2 }, { line: 3 }, { line: 3, mult: 1.05 }]),
  lvbu: sk("lvbu", "轅門射戟", "一箭穿陣，墨封應聲而裂。", [{ line: 1, seals: 2 }, { line: 2, seals: 2 }, { line: 2, seals: 3 }]),
  weiqing: sk("weiqing", "龍城飛將", "長驅直入，奔襲中自有餘力。", [{ heal: 140 }, { heal: 140, line: 1 }, { heal: 210, line: 1 }]),
  quyuan: sk("quyuan", "上下求索", "路漫漫其修遠兮。", [{ heal: 140 }, { heal: 140, mult: 1.03 }, { heal: 210, mult: 1.03 }]),
  liyu: sk("liyu", "一江春水", "愁緒如水，綿綿添分。", [{ mult: 1.06, heal: 70 }, { mult: 1.08, heal: 70 }, { mult: 1.08, heal: 140 }]),
  liuxiu: sk("liuxiu", "昆陽之戰", "以少勝多，兩道墨封先破。", [{ seals: 2, heal: 70 }, { seals: 3, heal: 70, line: 1 }, { seals: 4, heal: 70, line: 1 }]),
  sunce: sk("sunce", "江東小霸王", "銳氣一線，橫掃江東。", [{ line: 1, heal: 70 }, { line: 2, heal: 70 }, { line: 2, heal: 140 }]),
  caozhi: sk("caozhi", "七步成詩", "七步之內，字字生花。", [{ mult: 1.05, heal: 70 }, { mult: 1.05, heal: 140 }, { mult: 1.08, heal: 140 }]),
  wentingyun: sk("wentingyun", "花間", "金縷翠鈿，綺麗加分。", [{ mult: 1.08, heal: 70 }, { mult: 1.1, heal: 90 }, { mult: 1.12, line: 1, heal: 110 }]),
  zhaozhen: sk("zhaozhen", "仁政", "寬厚待人，步步從容。", [{ heal: 140 }, { heal: 140, seals: 1 }, { heal: 210, seals: 1 }]),
  lishangyin: sk("lishangyin", "無題", "心有靈犀一點通。", [{ line: 1, mult: 1.04 }, { line: 1, mult: 1.06, heal: 70 }, { line: 2, mult: 1.08 }]),
  wanganshi: sk("wanganshi", "變法", "春風又綠，舊封新破。", [{ seals: 2, heal: 70 }, { seals: 3, heal: 70 }, { seals: 3, heal: 140 }]),
  ouyangxiu: sk("ouyangxiu", "醉翁之意", "醉翁之意不在酒，在乎一步一線。", [{ heal: 70, line: 1 }, { heal: 70, line: 1, mult: 1.04 }, { heal: 140, line: 1, mult: 1.04 }]),
  liuyong: sk("liuyong", "楊柳岸", "曉風殘月，處處有人唱。", [{ mult: 1.06, line: 1 }, { mult: 1.08, line: 1 }, { mult: 1.1, line: 1, heal: 70 }]),
};

/* ---------- SS: strong, distinct ---------- */
const SS_SKILLS: Record<string, Skill> = {
  sima: sk("sima", "鳳求凰", "一曲琴挑，龍珠入懷。", [{ color: 1 }, { color: 1, heal: 70 }, { color: 1, heal: 140 }]),
  zhuge: sk("zhuge", "草船借箭", "向天借命，算無遺策。", [{ heal: 210 }, { heal: 210, line: 1 }, { heal: 280, line: 1 }]),
  huo: sk("huo", "疾鋒破陣", "少年奔襲，金鑲玉與刻玉齊發。", [{ bomb: 1, line: 1 }, { bomb: 1, line: 2 }, { bomb: 2, line: 2 }]),
  caocao: sk("caocao", "挾令諸侯", "號令一下，墨封俯首。", [{ seals: 4, bomb: 1, mult: 1.04 }, { seals: 5, bomb: 1, heal: 70, mult: 1.05 }, { seals: 6, bomb: 2, heal: 70, mult: 1.06 }]),
  lishimin: sk("lishimin", "貞觀之治", "治世有道，分數與氣血皆盛。", [{ mult: 1.06, heal: 140 }, { mult: 1.08, heal: 140 }, { mult: 1.1, heal: 210 }]),
  nalan: sk("nalan", "人生若只如初見", "初見即是最好的一局。", [{ line: 2, mult: 1.06, heal: 70 }, { line: 2, mult: 1.08, heal: 90 }, { line: 3, mult: 1.1, heal: 110 }]),
  panan: sk("panan", "擲果盈車", "滿城擲果，刻玉落滿棋盤。", [{ line: 3 }, { line: 4 }, { line: 4, heal: 70 }]),
  songyu: sk("songyu", "高唐神女", "朝雲暮雨，金鑲玉自天而降。", [{ bomb: 1, mult: 1.06 }, { bomb: 1, mult: 1.08, heal: 70 }, { bomb: 2, mult: 1.08, heal: 70 }]),
  luyou: sk("luyou", "鐵馬冰河", "夜闌臥聽，鐵騎踏碎冰封。", [{ seals: 4, heal: 140 }, { seals: 5, heal: 210 }, { seals: 6, heal: 210, mult: 1.05 }]),
  zhaoyun: sk("zhaoyun", "七進七出", "單騎護你，金鑲玉開路。", [{ bomb: 1, heal: 140 }, { bomb: 1, heal: 210 }, { bomb: 2, heal: 210 }]),
};

/* ---------- SSR: signature ---------- */
const SSR_SKILLS: Record<string, Skill> = {
  qin: sk("qin", "橫掃六合", "一聲令下，最多的那一色玉盡數伏誅。", [{ sweep: true }, { sweep: true, line: 1 }, { sweep: true, line: 1, heal: 70 }]),
  zhouyu: sk("zhouyu", "火燒赤壁", "東風一起，連燒數行，墨封最多的先燒；餘燼化作橫刻玉。", [
    { row: 1, burn: 2 },
    { row: 2, burn: 2 },
    { row: 1, burn: 3, mult: 1.05 },
  ]),
  lanling: sk("lanling", "入陣曲", "面具落下，金鑲玉列陣而出。", [{ bomb: 2, heal: 70 }, { bomb: 2, heal: 70, mult: 1.03 }, { bomb: 3, heal: 70, mult: 1.05 }]),
  libai: sk("libai", "醉月吟", "一斗酒，百篇詩，步步生花。", [{ heal: 210, mult: 1.05 }, { heal: 210, mult: 1.08 }, { heal: 280, mult: 1.1 }]),
  liuche: sk("liuche", "漢闕天威", "天子出手闊綽：過關的墨玉星賞加成，再賜一口氣血。", [
    { reward: 0.25, heal: 140 },
    { reward: 0.35, heal: 140, bomb: 1 },
    { reward: 0.5, heal: 210, bomb: 1, mult: 1.05 },
  ]),
};

const BY_CHAR: Record<string, Skill> = { ...R_GROUP, ...S_SKILLS, ...SS_SKILLS, ...SSR_SKILLS };

export function skillOf(id: string): Skill | undefined {
  return BY_CHAR[id];
}

/** 0 → 壹 (tier 0–2), 1 → 貳 (tier 3–5), 2 → 參 (tier 6). */
export function skillStep(copies: number): 0 | 1 | 2 {
  const lv = bondLevel(copies);
  return lv >= 6 ? 2 : lv >= 3 ? 1 : 0;
}
export const STEP_NAMES = ["壹", "貳", "參"] as const;
export const STEP_TIERS = [0, 3, 6] as const;

export type AssistFx = Required<SkillFx>;
export const NO_FX: AssistFx = { moves: 0, heal: 0, mult: 1, line: 0, row: 0, bomb: 0, color: 0, seals: 0, reward: 0, sweep: false, burn: 0 };

export function skillFx(id: string, copies: number): AssistFx {
  const s = skillOf(id);
  if (!s || copies <= 0) return NO_FX;
  return { ...NO_FX, ...s.steps[skillStep(copies)] };
}

/** 氣血 → 步 for 討伐 (raid keeps its own step rule): 70 血 = 1 步. */
export const HEAL_PER_MOVE = 70;
export const raidMoves = (fx: Pick<SkillFx, "heal">) => Math.floor((fx.heal ?? 0) / HEAL_PER_MOVE);

/** `raid`: describe for 討伐, where a heal is paid out as +步 instead. */
export function describeFx(fx: SkillFx, { raid = false }: { raid?: boolean } = {}): string {
  const p: string[] = [];
  if (fx.sweep) p.push("橫掃最多的一色");
  if (fx.burn) p.push(`火燒 ${fx.burn} 行`);
  if (raid) {
    if (raidMoves(fx)) p.push(`+${raidMoves(fx)} 步`);
  } else if (fx.heal) p.push(`+${fx.heal} 血`);
  if (fx.color) p.push(`龍珠 ×${fx.color}`);
  if (fx.bomb) p.push(`金鑲玉 ×${fx.bomb}`);
  if (fx.row) p.push(`橫刻玉 ×${fx.row}`);
  if (fx.line) p.push(`刻玉 ×${fx.line}`);
  if (fx.seals) p.push(`化墨封 ${fx.seals} 層`);
  if (fx.mult && fx.mult > 1) p.push(`得分 ×${fx.mult.toFixed(2)}`);
  if (fx.reward) p.push(`星賞墨玉 +${Math.round(fx.reward * 100)}%`);
  return p.join(" · ") || "無";
}

/** Extra 墨玉 from a reward skill: only on new-star payouts, never on replays. */
export function rewardBonus(fx: Pick<AssistFx, "reward">, reward: number, prevStars: number, stars: number): number {
  if (!fx.reward || stars <= prevStars) return 0;
  return Math.round(reward * fx.reward);
}

export const ALL_SKILLS = BY_CHAR;
