/**
 * Inventories store character ids, not rarity labels. The three people who
 * used to be SR (韓信、岳飛、辛棄疾) keep those ids and now resolve as S.
 * If an older save still has a rarity or tier field set to "SR", rewrite it.
 */
export function migrateLegacySr<T>(persisted: T): T {
  return rewriteSr(persisted) as T;
}

function rewriteSr(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteSr);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "rarity" || key === "tier") && child === "SR") out[key] = "S";
    else out[key] = rewriteSr(child);
  }
  return out;
}
