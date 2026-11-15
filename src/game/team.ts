import type { Rarity } from "./data.ts";
import { RANK } from "./logic.ts";
import { skillOf, skillStep } from "./skills.ts";
import { NO_ASSIST } from "./assist.ts";

/**
 * 三人戰隊 (no more single assist). Every fight — 主線、深宮、劇情三消、討伐 — brings up to three
 * owned characters with a skill. 「自動配對」 fills the empty seats:
 *   1. the 固定助陣 pin (if owned) sits first,
 *   2. then the best of the rest by rarity → 緣分 skill step → copies,
 *   3. inside the same rarity, a skill that adds a NEW kind of effect (strike / 補血 / 化封 / 得分 / 送特殊玉)
 *      beats one that only repeats what the team already has — diversity never outranks rarity.
 * Pure so the UI and tests share it.
 */
export const TEAM_SIZE = 3;

type Roster = readonly { id: string; rarity: Rarity }[];

export type SkillTag = "strike" | "heal" | "seals" | "score" | "gift";

/** What kinds of effect a character's current skill step has (empty = no skill). */
export function skillTags(id: string, copies: number): SkillTag[] {
  const s = skillOf(id);
  if (!s) return [];
  const fx = s.steps[skillStep(Math.max(1, copies))] ?? s.steps[0]!;
  const tags: SkillTag[] = [];
  if (fx.sweep || fx.burn) tags.push("strike");
  if (fx.heal) tags.push("heal");
  if (fx.seals) tags.push("seals");
  if ((fx.mult ?? 1) > 1 || fx.reward) tags.push("score");
  if (fx.color || fx.bomb || fx.row || fx.line) tags.push("gift");
  return tags;
}

const usable = (id: string, owned: Record<string, number>) => (owned[id] ?? 0) > 0 && !!skillOf(id);

/** Keep owned, skilled, unique ids — at most three, in order. */
export function cleanTeam(team: readonly unknown[] | undefined, owned: Record<string, number>): string[] {
  const out: string[] = [];
  for (const id of team ?? []) {
    if (typeof id !== "string" || out.includes(id) || !usable(id, owned)) continue;
    out.push(id);
    if (out.length >= TEAM_SIZE) break;
  }
  return out;
}

/**
 * 自動配對: keep `keep` (already seated, in order), put the pin first when it is not seated yet,
 * then fill up to three seats.
 */
export function autoTeam(
  roster: Roster,
  owned: Record<string, number>,
  { pinned = null, keep = [] }: { pinned?: string | null; keep?: readonly string[] } = {},
): string[] {
  const team = cleanTeam(keep, owned);
  // The pin leads an auto team; next to a hand-picked 編隊 it takes the first free seat.
  if (pinned && pinned !== NO_ASSIST && !team.includes(pinned) && usable(pinned, owned) && team.length < TEAM_SIZE) team.push(pinned);
  const covered = new Set<SkillTag>(team.flatMap((id) => skillTags(id, owned[id] ?? 0)));
  const pool = roster.map((c, i) => ({ ...c, i })).filter((c) => usable(c.id, owned) && !team.includes(c.id));
  while (team.length < TEAM_SIZE && pool.length) {
    let best = -1;
    let bestKey: number[] = [];
    pool.forEach((c, k) => {
      const n = owned[c.id] ?? 0;
      const fresh = skillTags(c.id, n).filter((t) => !covered.has(t)).length;
      const key = [RANK[c.rarity], fresh > 0 ? 1 : 0, skillStep(n), n, fresh, -c.i];
      if (best < 0 || greater(key, bestKey)) {
        best = k;
        bestKey = key;
      }
    });
    const [pick] = pool.splice(best, 1);
    team.push(pick!.id);
    for (const t of skillTags(pick!.id, owned[pick!.id] ?? 0)) covered.add(t);
  }
  return team;
}

function greater(a: number[], b: number[]): boolean {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k]! > b[k]!;
  return false;
}

/**
 * Who fights this time: the saved 編隊 topped up to three with 自動配對 (never a lone assist when more
 * are owned). An empty 編隊 is fully auto-filled. Fewer than three only when fewer are owned.
 */
export function fightTeam(saved: readonly unknown[] | undefined, owned: Record<string, number>, roster: Roster, pinned: string | null = null): string[] {
  return autoTeam(roster, owned, { pinned, keep: cleanTeam(saved, owned) });
}
