import test from "node:test";
import assert from "node:assert/strict";
import { DAILY_PROMPT_KEY, markPrompted, readPromptedDay, shouldPromptDaily } from "./daily.ts";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

test("daily popup shows only while today's gift is unclaimed and not yet dismissed", () => {
  const today = "2026-11-01";
  assert.equal(shouldPromptDaily(null, null, today), true);
  assert.equal(shouldPromptDaily("2026-10-31", null, today), true);
  assert.equal(shouldPromptDaily(today, null, today), false, "claimed today");
  assert.equal(shouldPromptDaily("2026-10-31", today, today), false, "dismissed today");
  assert.equal(shouldPromptDaily("2026-10-31", "2026-10-31", today), true, "dismissed yesterday pops again");
});

test("dismiss marker round-trips and ignores junk", () => {
  const s = mem();
  assert.equal(readPromptedDay(s), null);
  markPrompted("2026-11-01", s);
  assert.equal(s.m.get(DAILY_PROMPT_KEY), "2026-11-01");
  assert.equal(readPromptedDay(s), "2026-11-01");
  s.setItem(DAILY_PROMPT_KEY, "garbage");
  assert.equal(readPromptedDay(s), null);
  assert.equal(readPromptedDay(null), null);
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(readPromptedDay(broken), null);
  assert.doesNotThrow(() => markPrompted("2026-11-01", broken));
});
