/**
 * t516 三角色專屬被動（霍去病「少年驍騎」、李白「將進酒」、劉徹「帝王號令」）。
 *
 * Pure, fight-local state — NEVER serialized into a save, reset by `freshTrioPassives`
 * at every battle start (and the Game remounts on 重開戰). Every function returns the
 * charge GRANTS (`id → +n`); the caller feeds them through the battle's normal
 * `addEnergy`, which caps each member at their personal cost (no overflow is banked).
 *
 * 有效消除 = one successful PLAYER swap that actually clears jades. All natural gravity
 * waves of that swap are the same hand (one `handId`). Skill strikes, gifted specials,
 * post-skill reshuffles, 天命連攜, 命器 bonuses and enemy turns are never hands.
 * Hands of ANY colour / any teammate count — there is no acting-character attribution.
 *
 * 李白「將進酒」timing: `liEvaluate` ARMS when 0 < HP < 70% max (team in the fight has
 * 李白, fewer than 2 grants so far, not already armed). The host calls it only at
 * settled moments: after a player hand + its jade heals finish, after the 墨厄 hurts
 * the player, and after a skill heal — never in the middle of a hand, so the hand that
 * arms can never consume itself. The NEXT `finishHand` consumes the arm (+12). Once
 * armed, the promise stays even if a heal later lifts HP to ≥70%. Full HP never arms.
 */
export const TRIO_IDS = ["huo", "libai", "liuche"] as const;
export const TRIO_PASSIVES = {
  huo: { name: "少年驍騎", every: 3, gain: 8, max: 3 },
  libai: { name: "將進酒", below: 0.7, gain: 12, max: 2 },
  liuche: { name: "帝王號令", jades: 4, gain: 15, ally: 5 },
} as const;

export type TrioState = {
  team: string[];
  seenHands: Set<number>;
  seenCasts: Set<string>;
  huoHands: number;
  huoGrants: number;
  liArmed: boolean;
  liGrants: number;
  liuFour: boolean;
  liuAlly: boolean;
};

export function freshTrioPassives(team: readonly string[]): TrioState {
  return { team: [...team], seenHands: new Set(), seenCasts: new Set(), huoHands: 0, huoGrants: 0, liArmed: false, liGrants: 0, liuFour: false, liuAlly: false };
}

export type Grant = { id: string; gain: number; passive: string };
const on = (s: TrioState, id: string) => s.team.includes(id);

/** 李白 low-HP arm check. Returns true when it armed just now. */
export function liEvaluate(s: TrioState, hp: number, maxHp: number): boolean {
  const P = TRIO_PASSIVES.libai;
  if (!on(s, "libai") || s.liArmed || s.liGrants >= P.max) return false;
  if (!(hp > 0 && maxHp > 0 && hp < maxHp * P.below)) return false;
  s.liArmed = true;
  return true;
}

/**
 * One successful player hand fully resolved (all its gravity waves, normal charge and
 * jade heals done, before the 墨厄 turn). `cleared` = jades removed over all its waves.
 * A repeated `handId` (re-entry) is ignored.
 */
export function finishHand(s: TrioState, handId: number, cleared: number): Grant[] {
  if (cleared <= 0 || s.seenHands.has(handId)) return [];
  s.seenHands.add(handId);
  const out: Grant[] = [];
  const H = TRIO_PASSIVES.huo;
  if (on(s, "huo")) {
    s.huoHands += 1;
    if (s.huoHands % H.every === 0 && s.huoGrants < H.max) {
      s.huoGrants += 1;
      out.push({ id: "huo", gain: H.gain, passive: H.name });
    }
  }
  const L = TRIO_PASSIVES.libai;
  if (on(s, "libai") && s.liArmed && s.liGrants < L.max) {
    s.liArmed = false;
    s.liGrants += 1;
    out.push({ id: "libai", gain: L.gain, passive: L.name });
  }
  const U = TRIO_PASSIVES.liuche;
  if (on(s, "liuche") && !s.liuFour && cleared >= U.jades) {
    s.liuFour = true;
    out.push({ id: "liuche", gain: U.gain, passive: U.name });
  }
  return out;
}

/**
 * A skill cast COMPLETELY finished (strike, gifts, seals, damage, heal). `token` must be
 * unique per cast in the fight (e.g. `liuche:1`); a repeated token is ignored.
 * 劉徹's first complete cast gives every OTHER current teammate +5, once per fight.
 */
export function afterCast(s: TrioState, id: string, token: string): Grant[] {
  if (s.seenCasts.has(token)) return [];
  s.seenCasts.add(token);
  if (id !== "liuche" || !on(s, "liuche") || s.liuAlly) return [];
  s.liuAlly = true;
  return s.team.filter((m) => m !== "liuche").map((m) => ({ id: m, gain: TRIO_PASSIVES.liuche.ally, passive: TRIO_PASSIVES.liuche.name }));
}

/** Grants → the `addEnergy` gains map (same id twice in one batch is summed). */
export function grantMap(grants: readonly Grant[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const g of grants) m[g.id] = (m[g.id] ?? 0) + g.gain;
  return m;
}
