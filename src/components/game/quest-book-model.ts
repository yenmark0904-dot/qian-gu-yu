/** Presentation only: never mutate store rows or derive rewards from list positions. */
type QuestState = { id: string; completed: boolean; claimed: boolean };
export function claimableQuests<T extends QuestState>(rows: readonly T[]): T[] {
  return rows.filter((q) => q.completed && !q.claimed);
}
export function sortedQuests<T extends QuestState>(rows: readonly T[]): T[] {
  const rank = (q: T) => (q.claimed ? 2 : q.completed ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b));
}
