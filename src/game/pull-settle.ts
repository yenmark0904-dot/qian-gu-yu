/**
 * One character-pull settlement shared by every way of paying (墨玉 / 千古召喚券 / 今日免費召喚).
 * Same pool, rates, pity (PITY = 50), first-pull SS gift, 緣分 / 墨痕 / tier 墨玉 — only the payment differs.
 */
import { dupOutcome } from "./bond.ts";
import { applyQuestEvent, freeSummonUsed, type QuestBook } from "./quests.ts";
import { COST_ONE, COST_TEN, DUP_REFUND, payTierUp, pullMany, type PullCard } from "./logic.ts";

export type PullPay = "ink" | "ticket" | "free";

export type PullState = {
  ink: number;
  pity: number;
  owned: Record<string, number>;
  totalPulls: number;
  history: string[];
  marks: number;
  tierInkPaid: Record<string, number>;
  charTickets: number;
};

export type PullPatch = Pick<
  PullState,
  "ink" | "pity" | "owned" | "totalPulls" | "history" | "marks" | "tierInkPaid" | "charTickets"
>;

export type PullError = "broke" | "no-tickets" | "invalid";

/** Pure: returns the full patch to commit in ONE set(), plus the settled cards. */
export function settleCharacterPull(
  state: PullState,
  n: 1 | 10,
  pay: PullPay = "ink",
): { ok: true; patch: PullPatch; cards: PullCard[] } | { ok: false; error: PullError } {
  if (n !== 1 && n !== 10) return { ok: false, error: "invalid" };
  if (pay === "free" && n !== 1) return { ok: false, error: "invalid" };
  const cost = pay === "ink" ? (n === 1 ? COST_ONE : COST_TEN) : 0;
  const tickets = pay === "ticket" ? n : 0;
  if (state.ink < cost) return { ok: false, error: "broke" };
  if (state.charTickets < tickets) return { ok: false, error: "no-tickets" };
  const rolled = pullMany(state.pity, n, state.totalPulls === 0);
  const owned = { ...state.owned };
  let ink = state.ink - cost;
  let marks = state.marks;
  let tierInkPaid = state.tierInkPaid;
  const cards: PullCard[] = rolled.cards.map((character) => {
    const prev = owned[character.id] ?? 0;
    const isNew = prev === 0;
    const count = prev + 1;
    const refund = isNew ? 0 : DUP_REFUND[character.rarity];
    const bond = dupOutcome(character.rarity, prev);
    owned[character.id] = count;
    const tier = payTierUp(tierInkPaid, character.id, bond.prevLevel, bond.level);
    tierInkPaid = tier.paid;
    ink += tier.ink; // duplicates: marks only (DUP_REFUND is 0)
    marks += bond.marks;
    return {
      character,
      isNew,
      count,
      refund,
      bond: bond.level,
      bondUp: bond.levelUp,
      marks: bond.marks,
      tierInk: tier.ink,
      overflow: bond.overflow,
    };
  });
  return {
    ok: true,
    cards,
    patch: {
      ink,
      marks,
      tierInkPaid,
      pity: rolled.pity,
      owned,
      totalPulls: state.totalPulls + n,
      history: [...rolled.cards.map((c) => c.id), ...state.history].slice(0, 40),
      charTickets: state.charTickets - tickets,
    },
  };
}

/**
 * 今日免費召喚 as one pure transaction: rejected if today's (Taipei 04:00) free pull is used; otherwise
 * the settled cards AND the quest-day's free-pull mark (每日緣起) are returned in the same patch.
 */
export function freeSummonTransaction(state: PullState & { questBook: QuestBook }, now: number) {
  if (freeSummonUsed(state.questBook, now)) return { ok: false as const, error: "used" as const };
  const res = settleCharacterPull(state, 1, "free");
  if (!res.ok) return { ok: false as const, error: "used" as const };
  return {
    ok: true as const,
    cards: res.cards,
    patch: { ...res.patch, questBook: applyQuestEvent(state.questBook, "DAILY_FREE_SUMMON_COMPLETED", now) },
  };
}
