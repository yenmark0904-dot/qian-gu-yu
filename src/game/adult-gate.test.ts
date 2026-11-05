import assert from "node:assert/strict";
import { test } from "node:test";
import { ADULT_KEY, ADULT_NO, ADULT_PROMPT, ADULT_YES, adultConfirmed, confirmAdult, needsAdultGate, resetAdult } from "./adult-gate.ts";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
};

test("adult gate: exact wording", () => {
  assert.equal(ADULT_PROMPT, "以下內容含成人情節，僅限 18 歲以上閱讀。你已年滿 18 歲嗎？");
  assert.equal(ADULT_YES, "我已年滿 18 歲");
  assert.equal(ADULT_NO, "返回");
});

test("adult gate: SSR texts are gated until confirmed once per device; reset asks again", () => {
  const s = memory();
  for (const i of [0, 1, 2, 3]) assert.equal(needsAdultGate("SSR", i, s), true, `SSR ch${i}`);
  assert.equal(adultConfirmed(s), false);
  confirmAdult(s);
  assert.equal(s.m.get(ADULT_KEY), "1");
  for (const i of [0, 1, 2, 3]) assert.equal(needsAdultGate("SSR", i, s), false);
  resetAdult(s);
  assert.equal(needsAdultGate("SSR", 0, s), true);
});

test("adult gate: SS / S / R are never gated; no storage means always ask", () => {
  const s = memory();
  for (const r of ["SS", "S", "R"] as const) for (const i of [0, 1, 2, 3]) assert.equal(needsAdultGate(r, i, s), false, `${r} ch${i}`);
  assert.equal(needsAdultGate("SSR", 0, null), true);
});
