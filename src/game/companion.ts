import { BY_ID } from "./data.ts";
import { bondLevel } from "./bond.ts";
import { COMPANION_LINES } from "./companion-lines.ts";
export type TimeSlot = "morning" | "day" | "evening" | "night";
export function timeSlot(hour = new Date().getHours()): TimeSlot {
  return hour >= 5 && hour < 11
    ? "morning"
    : hour >= 11 && hour < 17
      ? "day"
      : hour >= 17 && hour < 21
        ? "evening"
        : "night";
}
export const SLOT_LABELS = { morning: "早晨", day: "白日", evening: "傍晚", night: "深夜" };
export function resolveCompanion(id: unknown, owned: Record<string, number>): string | null {
  return typeof id === "string" &&
    Object.hasOwn(BY_ID, id) &&
    Number.isFinite(owned?.[id]) &&
    owned[id] > 0
    ? id
    : null;
}
export function companionTier(copies: number): "初識" | "熟稔" | "情深" {
  const rank = bondLevel(copies);
  return rank >= 6 ? "情深" : rank >= 3 ? "熟稔" : "初識";
}
/** All lines are spoiler-free; bond never stands in for story completion. */
export function interactionDeck(id: string, copies: number, slot: TimeSlot): string[] {
  const l = COMPANION_LINES[id];
  if (!l) return [];
  const rank = bondLevel(copies);
  return [
    ...new Set([
      l.first,
      l[slot],
      l.care,
      l.tease,
      l.gentle,
      ...(["morning", "day", "evening", "night"] as const)
        .filter((s) => s !== slot)
        .map((s) => l[s]),
      ...(rank >= 3 ? [l.familiar] : []),
      ...(rank >= 6 ? [l.deep] : []),
    ]),
  ];
}
export type InteractionRound = {
  index: number;
  taps: number[];
  rapidAt: number;
  last: string | null;
};
export const newRound = (): InteractionRound => ({
  index: 0,
  taps: [],
  rapidAt: -Infinity,
  last: null,
});
export function nextInteraction(
  id: string,
  copies: number,
  slot: TimeSlot,
  round: InteractionRound,
  now: number,
) {
  const deck = interactionDeck(id, copies, slot);
  const taps = [...round.taps.filter((t) => now - t < 900), now];
  const rapid = taps.length >= 3 && now - round.rapidAt > 2500;
  let index = round.index;
  let text = rapid ? COMPANION_LINES[id].rapid : deck[index++ % deck.length];
  if (text === round.last) text = deck[index++ % deck.length];
  return { text, round: { index, taps, rapidAt: rapid ? now : round.rapidAt, last: text } };
}
