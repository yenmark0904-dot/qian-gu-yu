/**
 * 鎮厄司 lobby model (t470) — pure, display-only helpers for the BOSS picker / detail pane.
 * Every number here is READ from the real encounter + shared combat constants; nothing is tuned or invented.
 */
import { COMBAT, PLAYER, attackDamage, playerMaxHp } from "./combat.ts";
import type { RaidEncounter, RaidRecord, MatDrop } from "./raid.ts";
import { LEGACY_FIRST_INK } from "./raid.ts";
import type { MaterialId } from "./artifacts.ts";

/** 職業 display labels. Source: spec.txt 四 / 01-角色技能數值表.md (t467). Display only — combat ignores it. */
export type RaidClass = "破厄" | "承命" | "鎮守";
export const RAID_CLASS_ROLE: Record<RaidClass, string> = { 破厄: "攻擊", 承命: "輔助", 鎮守: "防禦" };
export const RAID_CLASS_DISPLAY: Record<string, RaidClass> = {
  qin: "破厄",
  zhouyu: "破厄",
  lanling: "鎮守",
  libai: "承命",
  liuche: "承命",
  sima: "破厄",
  zhuge: "承命",
  huo: "破厄",
  caocao: "承命",
  lishimin: "鎮守",
  nalan: "承命",
  panan: "破厄",
  songyu: "破厄",
  luyou: "鎮守",
  zhaoyun: "鎮守",
  sushi: "承命",
  hanxin: "破厄",
  dufu: "承命",
  yuefei: "鎮守",
  wangwei: "承命",
  xinqiji: "破厄",
  xiangyu: "破厄",
  lvbu: "破厄",
  weiqing: "鎮守",
  quyuan: "承命",
  liyu: "承命",
  liuxiu: "鎮守",
  sunce: "破厄",
  caozhi: "承命",
  wentingyun: "承命",
  zhaozhen: "鎮守",
  lishangyin: "承命",
  wanganshi: "承命",
  ouyangxiu: "鎮守",
  liuyong: "破厄",
  baijuyi: "鎮守",
  tao: "承命",
  dumu: "鎮守",
  meng: "承命",
  wangchangling: "破厄",
  machao: "破厄",
  zhoutai: "鎮守",
  luxun: "破厄",
  jiangwei: "破厄",
  shaonianchanggong: "破厄",
  xielingyun: "承命",
  luobinwang: "承命",
  chenziang: "承命",
  censhen: "破厄",
  weiyingwu: "承命",
  wangbo: "承命",
  hezhizhang: "承命",
  wangzhihuan: "破厄",
  gaoshi: "破厄",
  liuyuxi: "鎮守",
  yuanzhen: "承命",
  liuzongyuan: "承命",
  lihe: "承命",
  zhangruoxu: "承命",
  cuihao: "承命",
  qinguan: "承命",
  huangtingjian: "承命",
  yanjiandao: "承命",
  ganning: "破厄",
  taishici: "破厄",
};
export const classOf = (id: string): RaidClass | null => RAID_CLASS_DISPLAY[id] ?? null;

export type MechanicKey = "attack" | "ink" | "ice" | "vein" | "shield" | "drain" | "phase";
export type Mechanic = { key: MechanicKey; title: string; text: string };

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Phase-2 multipliers used by combat.enemyAttack (kept in one place for the copy). */
const PHASE2 = { shield: 1.3, drain: 1.4 } as const;

export function raidStats(enc: RaidEncounter) {
  const e = enc.enemy;
  const phased = e.phaseAt > 0;
  return {
    hp: e.hp,
    playerHp: playerMaxHp(enc.def.moves),
    every: e.attackEvery,
    everyPhase2: phased ? Math.max(1, e.attackEvery - 1) : e.attackEvery,
    hit: attackDamage(e, 1),
    hitPhase2: phased ? attackDamage(e, 2) : attackDamage(e, 1),
    shield: e.skills.includes("shield") ? e.shield : 0,
    shieldPhase2: e.skills.includes("shield") ? Math.round(e.shield * (phased ? PHASE2.shield : 1)) : 0,
  };
}

/** Full mechanic list, derived from the encounter + combat.enemyAttack rules (same order as a fight reads). */
export function raidMechanics(enc: RaidEncounter): Mechanic[] {
  const e = enc.enemy;
  const s = raidStats(enc);
  const out: Mechanic[] = [];
  const phased = e.phaseAt > 0;
  out.push({ key: "attack", title: "出手", text: `每 ${s.every} 回出手一次，傷你的氣血 ${s.hit}${phased ? `（半血後 ${s.hitPhase2}）` : ""}` });
  const seals = e.skills.includes("ink");
  if (seals && e.ink > 0) out.push({ key: "ink", title: "墨封", text: `每次出手封住 ${e.ink} 顆玉；在它身上或旁邊連線即可化開（盤面墨封最多 ${COMBAT.sealCap} 格）` });
  // combat.enemyAttack: ice layers land every attack on a non-boss 墨厄, and only in phase 2 on a boss.
  if (seals && e.ice > 0)
    out.push({
      key: "ice",
      title: "冰封",
      text: e.boss ? `生命低於${pct(e.phaseAt)}後，每次出手追加冰封 ${e.ice} 顆（要碰兩次：先碎冰再破墨）` : `每次出手追加冰封 ${e.ice} 顆（要碰兩次：先碎冰再破墨）`,
    });
  if ((e.spread ?? 0) > 0)
    out.push({ key: "vein", title: "墨紋", text: `沒化開的墨紋每回與每次出手向相鄰延伸 ${e.spread} 顆（最多 ${COMBAT.veinCap} 格）；化開方式同墨封` });
  if (s.shield > 0)
    out.push({ key: "shield", title: "護盾", text: `每次出手立盾 ${s.shield}${phased ? `（半血後 ${s.shieldPhase2}）` : ""}；盾在時傷害先扣盾，消除與連攜可削盾` });
  if (phased) {
    const extra = [`改為每 ${s.everyPhase2} 回出手`, `傷害 ×${PLAYER.phase2Mult}`];
    if (seals && e.ice > 0 && e.boss) extra.push("追加冰封");
    if (s.shield > 0) extra.push(`護盾 ×${PHASE2.shield}`);
    out.push({ key: "phase", title: "半血", text: `生命低於${pct(e.phaseAt)}：${extra.join("、")}` });
  }
  return out;
}

/** At most three short danger tags — the decision-making ones first. */
export function raidTags(enc: RaidEncounter): { key: MechanicKey; label: string }[] {
  const e = enc.enemy;
  const s = raidStats(enc);
  const tags: { key: MechanicKey; label: string }[] = [];
  if (s.shield > 0) tags.push({ key: "shield", label: `護盾 ${s.shield}` });
  if ((e.spread ?? 0) > 0) tags.push({ key: "vein", label: `墨紋延伸 ${e.spread}` });
  else if (e.skills.includes("ink") && (e.ink > 0 || e.ice > 0)) tags.push({ key: "ink", label: e.ice > 0 && !e.boss ? "墨封＋冰封" : "墨封" });
  if (tags.length < 3 && e.phaseAt > 0) tags.push({ key: "phase", label: `半血每 ${s.everyPhase2} 回出手` });
  return tags.slice(0, 3);
}

export type RewardLine = { id: MaterialId | "ink"; n: number };
export type RaidRewards = {
  /** Every win, fixed amounts (no random rolls in data). */
  every: RewardLine[];
  /** One-time first-win material bonus. */
  firstWin: { items: RewardLine[]; claimed: boolean };
  /** Legacy one-time 墨玉 first win (噬墨之影 only). */
  legacyInk: { n: number; claimed: boolean } | null;
};
const lines = (d: MatDrop): RewardLine[] =>
  (Object.entries(d) as [MaterialId, number][]).filter(([, n]) => (n ?? 0) > 0).map(([id, n]) => ({ id, n }));
export function raidRewards(enc: RaidEncounter, rec: RaidRecord | undefined): RaidRewards {
  const ink = LEGACY_FIRST_INK[enc.id] ?? 0;
  return {
    every: lines(enc.drops),
    firstWin: { items: lines(enc.firstDrops), claimed: !!rec?.firstDrop },
    legacyInk: ink > 0 ? { n: ink, claimed: !!rec?.rewardClaimed } : null,
  };
}

/** 「開始討伐」 the first time; 「再次討伐」 once started (tries) or won (clears / old `cleared`). */
export function raidChallenged(rec: RaidRecord | undefined): boolean {
  return !!rec && ((rec.tries ?? 0) > 0 || (rec.clears ?? 0) > 0 || rec.cleared);
}
export const raidActionLabel = (rec: RaidRecord | undefined) => (raidChallenged(rec) ? "再次討伐" : "開始討伐");

export type ClassNeed = { cls: RaidClass; why: string };
/** What the boss's REAL mechanics ask of a team (advice only). */
export function raidNeeds(enc: RaidEncounter): ClassNeed[] {
  const e = enc.enemy;
  const s = raidStats(enc);
  const out: ClassNeed[] = [];
  if (s.shield > 0) out.push({ cls: "破厄", why: `護盾 ${s.shield}：靠破厄削盾補傷害` });
  if (e.boss) out.push({ cls: "鎮守", why: `重擊 ${s.hit}（半血 ${s.hitPhase2}）：靠鎮守擋招減傷` });
  out.push({ cls: "承命", why: "墨封與冰封拖長戰線：靠承命治療續戰" });
  return out;
}
export type TeamFit = { level: "good" | "partial" | "none" | "empty"; missing: ClassNeed[]; text: string };
export function raidTeamFit(enc: RaidEncounter, team: readonly string[]): TeamFit {
  if (!team.length) return { level: "empty", missing: [], text: "尚無可出戰的人物" };
  const have = new Set(team.map(classOf).filter(Boolean));
  const needs = raidNeeds(enc);
  const missing = needs.filter((n) => !have.has(n.cls));
  if (!missing.length) return { level: "good", missing, text: "職業搭配合適，可放心出戰" };
  const level = missing.length === needs.length ? "none" : "partial";
  return { level, missing, text: `建議補上：${missing.map((m) => m.cls).join("、")}（僅供參考，不影響出戰）` };
}
