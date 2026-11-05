/**
 * 今日領取 auto popup: when the home screen opens and today's 墨玉 is still unclaimed,
 * the gift pops up once. Claiming (lastDaily = today) or dismissing (prompted day = today)
 * keeps it from popping again until the next local day. The manual button in the hall stays.
 */
export const DAILY_PROMPT_KEY = "qiangu-yu:daily-prompt";

export function shouldPromptDaily(lastDaily: string | null, promptedDay: string | null, today: string): boolean {
  return lastDaily !== today && promptedDay !== today;
}

type KV = Pick<Storage, "getItem" | "setItem">;

function storage(): KV | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readPromptedDay(store: KV | null = storage()): string | null {
  try {
    const v = store?.getItem(DAILY_PROMPT_KEY) ?? null;
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function markPrompted(today: string, store: KV | null = storage()): void {
  try {
    store?.setItem(DAILY_PROMPT_KEY, today);
  } catch {
    /* private mode / quota: the popup may show again, which is harmless */
  }
}
