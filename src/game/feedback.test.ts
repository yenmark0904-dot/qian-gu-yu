import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_TEXT_MAX,
  QUESTIONS,
  RATE_WINDOW_MS,
  RateLimiter,
  SURVEY_INTRO,
  SURVEY_THANKS,
  cleanText,
  isComplete,
  shortUserAgent,
  shouldInvite,
  taipeiTimestamp,
  validateFeedback,
} from "./feedback.ts";

const full = () => {
  const answers: Record<string, string | string[]> = {};
  for (const q of QUESTIONS) answers[q.id] = q.multi ? [q.options[1], q.options[0]] : q.options[0];
  return { answers, other: "  想要更多劇情  ", deviceId: "abcDEF12-3456" };
};

test("copy is verbatim: 10 choice questions, multi only on Q2/Q5/Q8, ♡ kept", () => {
  assert.equal(QUESTIONS.length, 10);
  assert.deepEqual(QUESTIONS.filter((q) => q.multi).map((q) => q.id), ["q2", "q5", "q8"]);
  for (const q of QUESTIONS) assert.equal(q.multi, q.text.endsWith("（可複選）"), q.id);
  assert.ok(SURVEY_INTRO.at(-1)!.endsWith("♡"));
  assert.ok(SURVEY_THANKS.at(-1)!.endsWith("♡"));
  assert.equal(SURVEY_THANKS[0], "「千年一遇，幸得有你。」");
});

test("valid payload passes; multi-select de-duplicated in option order; text trimmed", () => {
  const r = validateFeedback(full());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.value.answers.q2, [QUESTIONS[1].options[0], QUESTIONS[1].options[1]]);
  assert.equal(r.value.other, "想要更多劇情");
  const dup = full();
  dup.answers.q5 = [QUESTIONS[4].options[2], QUESTIONS[4].options[2]];
  const r2 = validateFeedback(dup);
  assert.ok(r2.ok && (r2.value.answers.q5 as string[]).length === 1);
});

test("Q11 is optional", () => {
  const p = full() as Record<string, unknown>;
  delete p.other;
  const r = validateFeedback(p);
  assert.ok(r.ok && r.value.other === "");
});

test("required: every Q1–Q10 answered, multi ≥ 1", () => {
  const a = full();
  delete a.answers.q7;
  assert.deepEqual(validateFeedback(a), { ok: false, error: "missing" });
  const b = full();
  b.answers.q8 = [];
  assert.deepEqual(validateFeedback(b), { ok: false, error: "missing" });
  assert.equal(isComplete(a.answers), false);
  assert.equal(isComplete(b.answers), false);
  assert.equal(isComplete(full().answers), true);
});

test("rejects unknown options, wrong shapes, extra keys and bad device ids", () => {
  const bad = [
    null,
    "x",
    { ...full(), answers: { ...full().answers, q1: "超讚" } },
    { ...full(), answers: { ...full().answers, q1: ["非常滿意"] } },
    { ...full(), answers: { ...full().answers, q2: "抽卡召喚系統" } },
    { ...full(), answers: { ...full().answers, q2: ["抽卡召喚系統", "<script>"] } },
    { ...full(), answers: { ...full().answers, q99: "x" } },
    { ...full(), other: 42 },
    { ...full(), deviceId: "short" },
    { ...full(), deviceId: "has space in it!!" },
    { ...full(), deviceId: "x".repeat(65) },
  ];
  for (const b of bad) assert.equal(validateFeedback(b).ok, false, JSON.stringify(b)?.slice(0, 80));
});

test("free text capped at 1000 characters (counted by code point)", () => {
  assert.ok(validateFeedback({ ...full(), other: "墨".repeat(FREE_TEXT_MAX) }).ok);
  assert.ok(validateFeedback({ ...full(), other: "😀".repeat(FREE_TEXT_MAX) }).ok);
  assert.deepEqual(validateFeedback({ ...full(), other: "墨".repeat(FREE_TEXT_MAX + 1) }), { ok: false, error: "too_long" });
  assert.deepEqual(validateFeedback({ ...full(), other: "a".repeat(1_000_000) }), { ok: false, error: "too_long" });
});

test("cleanText strips control and bidi-override characters, keeps newlines", () => {
  assert.equal(cleanText("a\u0000b\r\nc\u202Ed", 10), "ab\ncd");
  assert.equal(cleanText(5, 10), "");
});

test("rate limiter: one per device per 10 minutes", () => {
  const rl = new RateLimiter(RATE_WINDOW_MS, 1);
  const t = 1_000_000;
  assert.ok(rl.allowed("dev", t));
  rl.record("dev", t);
  assert.equal(rl.allowed("dev", t + 1000), false);
  assert.equal(rl.allowed("dev", t + RATE_WINDOW_MS - 1), false);
  assert.ok(rl.allowed("other", t + 1000));
  assert.ok(rl.allowed("dev", t + RATE_WINDOW_MS));
});

test("rate limiter: per-IP cap of N within the window", () => {
  const rl = new RateLimiter(RATE_WINDOW_MS, 5);
  for (let i = 0; i < 5; i += 1) {
    assert.ok(rl.allowed("ip", i));
    rl.record("ip", i);
  }
  assert.equal(rl.allowed("ip", 10), false);
});

test("Taipei timestamp is UTC+8", () => {
  assert.equal(taipeiTimestamp(new Date("2026-11-05T13:40:12Z")), "2026-11-05 21:40:12");
  assert.equal(taipeiTimestamp(new Date("2026-12-31T20:00:00Z")), "2027-01-01 04:00:00");
});

test("short user agent", () => {
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  assert.equal(shortUserAgent(ios), "iPhone iOS 17.5 · Safari 17");
  const line = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.19.0";
  assert.equal(shortUserAgent(line), "iPhone iOS 18.1 · LINE 14");
  assert.ok(shortUserAgent("x".repeat(999)).length <= 160);
  assert.equal(shortUserAgent(null), "");
});

test("invite: only after playing, only once, never after dismiss or submit", () => {
  assert.equal(shouldInvite({}, false), false);
  assert.equal(shouldInvite({}, true), true);
  assert.equal(shouldInvite({ invited: true }, true), false);
  assert.equal(shouldInvite({ dismissed: true }, true), false);
  assert.equal(shouldInvite({ submittedAt: 1 }, true), false);
});
