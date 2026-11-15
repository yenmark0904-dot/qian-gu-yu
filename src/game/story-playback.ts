/** Follow only the current path; choices belong to the player, never playback controls. */
export function nextStoryStop(
  beats: readonly { kind: string }[],
  index: number,
  next: (cursor: number) => number,
): number {
  const visited = new Set<number>();
  let cursor = index;
  while (beats[cursor] && beats[cursor].kind !== "choice" && !visited.has(cursor)) {
    visited.add(cursor);
    cursor = next(cursor);
  }
  return cursor;
}
