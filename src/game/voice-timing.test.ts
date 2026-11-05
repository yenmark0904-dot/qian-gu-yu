import assert from "node:assert/strict";
import { test } from "node:test";
import {
  holdForVoice,
  revealGate,
  REVEAL_MIN_SHOW_MS,
  VOICE_MAX_MS,
  VOICE_TAIL_MS,
  type VoiceEnd,
  type VoiceHandle,
} from "./voice-timing.ts";

/** A fake clock: timers fire only when advanced. */
function clock() {
  let now = 0;
  let seq = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  const timers = {
    setTimeout: (fn: () => void, ms: number) => (due.set(++seq, { at: now + ms, fn }), seq),
    clearTimeout: (id: unknown) => void due.delete(id as number),
  };
  const flush = () => new Promise<void>((r) => setImmediate(r));
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      await flush();
      const next = [...due.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      due.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
    await flush();
  };
  return {
    timers,
    advance,
    get now() {
      return now;
    },
  };
}

function fakeVoice() {
  let settle!: (end: VoiceEnd) => void;
  let stops = 0;
  const handle: VoiceHandle = {
    done: new Promise<VoiceEnd>((r) => (settle = r)),
    stop: () => {
      stops++;
      settle("stopped");
    },
  };
  return { handle, settle: (end: VoiceEnd) => settle(end), stops: () => stops };
}

async function track(p: Promise<string>, c: ReturnType<typeof clock>) {
  const out: { why?: string; at?: number } = {};
  void p.then((why) => ((out.why = why), (out.at = c.now)));
  return out;
}

test("voice-timing: no voice (S/R, muted) keeps the base duration", async () => {
  const c = clock();
  const r = await track(holdForVoice(1750, null, { timers: c.timers }).done, c);
  await c.advance(1749);
  assert.equal(r.why, undefined);
  await c.advance(1);
  assert.deepEqual(r, { why: "base", at: 1750 });
});

test("voice-timing: overlay stays until the voice ends + 0.3s tail", async () => {
  const c = clock();
  const v = fakeVoice();
  const r = await track(holdForVoice(1750, v.handle, { timers: c.timers }).done, c);
  await c.advance(5000);
  assert.equal(r.why, undefined, "base passed, but the voice is still talking");
  await c.advance(6640); // lanling: 11.64s clip
  v.settle("ended");
  await c.advance(VOICE_TAIL_MS - 1);
  assert.equal(r.why, undefined);
  await c.advance(1);
  assert.deepEqual(r, { why: "voice", at: 11640 + VOICE_TAIL_MS });
  assert.equal(v.stops(), 0);
});

test("voice-timing: a voice shorter than the base never shortens the overlay", async () => {
  const c = clock();
  const v = fakeVoice();
  const r = await track(holdForVoice(1750, v.handle, { timers: c.timers }).done, c);
  await c.advance(800);
  v.settle("ended");
  await c.advance(800);
  assert.equal(r.why, undefined, "voice + tail done at 1.1s, base still running");
  await c.advance(200);
  assert.deepEqual(r, { why: "base", at: 1750 });
});

test("voice-timing: failed / autoplay-blocked / stopped voice falls back to the base duration", async () => {
  for (const end of ["failed", "stopped"] as const) {
    const c = clock();
    const v = fakeVoice();
    const r = await track(holdForVoice(1750, v.handle, { timers: c.timers }).done, c);
    await c.advance(100);
    v.settle(end);
    await c.advance(1650);
    assert.deepEqual(r, { why: "base", at: 1750 }, end);
    const late = fakeVoice();
    const r2 = await track(holdForVoice(1750, late.handle, { timers: c.timers }).done, c);
    await c.advance(3000);
    late.settle(end); // e.g. mute toggled after the base time: closes right away
    await c.advance(0);
    assert.deepEqual(r2, { why: "base", at: 1750 + 3000 }, `${end} late`);
  }
});

test("voice-timing: a voice that never ends is capped at 15s, and is stopped", async () => {
  const c = clock();
  const v = fakeVoice();
  const r = await track(holdForVoice(1750, v.handle, { timers: c.timers }).done, c);
  await c.advance(VOICE_MAX_MS - 1);
  assert.equal(r.why, undefined);
  await c.advance(1);
  assert.deepEqual(r, { why: "cap", at: VOICE_MAX_MS });
  assert.equal(v.stops(), 1);
  assert.equal(VOICE_MAX_MS, 15_000);
  assert.equal(VOICE_TAIL_MS, 300);
});

test("voice-timing: tap-to-skip closes at once and stops the voice", async () => {
  const c = clock();
  const v = fakeVoice();
  const hold = holdForVoice(1750, v.handle, { timers: c.timers });
  const r = await track(hold.done, c);
  await c.advance(2500);
  hold.skip();
  await c.advance(0);
  assert.deepEqual(r, { why: "skip", at: 2500 });
  assert.equal(v.stops(), 1);
  hold.skip();
  await c.advance(20_000);
  assert.equal(v.stops(), 1, "settles once");
});

test("reveal auto-advance: idle player hears the whole line, then moves on (ended + tail)", async () => {
  const c = clock();
  const went: Array<[string, number]> = [];
  const g = revealGate((why) => went.push([why, c.now]), { timers: c.timers });
  await c.advance(1500);
  const v = fakeVoice();
  g.voice(v.handle);
  await c.advance(4000);
  g.shown(); // card on screen at 5500, voice still talking
  await c.advance(8000);
  assert.deepEqual(went, [], "never advances while the voice is talking");
  v.settle("ended");
  await c.advance(VOICE_TAIL_MS - 1);
  assert.deepEqual(went, []);
  await c.advance(1);
  assert.deepEqual(went, [["voice", 1500 + 4000 + 8000 + VOICE_TAIL_MS]]);
  assert.equal(v.stops(), 0, "a finished voice is not cut");
  g.voice(fakeVoice().handle);
  await c.advance(20000);
  assert.equal(went.length, 1);
});

test("reveal auto-advance: a short line still leaves the card on screen for the minimum", async () => {
  const c = clock();
  const went: Array<[string, number]> = [];
  const g = revealGate((why) => went.push([why, c.now]), { timers: c.timers });
  const v = fakeVoice();
  g.voice(v.handle);
  v.settle("ended");
  await c.advance(3000);
  assert.deepEqual(went, [], "voice over but the reveal animation is still running");
  g.shown();
  await c.advance(REVEAL_MIN_SHOW_MS - 1);
  assert.deepEqual(went, []);
  await c.advance(1);
  assert.deepEqual(went, [["voice", 3000 + REVEAL_MIN_SHOW_MS]]);
});

test("reveal auto-advance: muted / failed / stopped / never-started voice never auto-advances", async () => {
  for (const end of ["failed", "stopped"] as const) {
    const c = clock();
    const went: string[] = [];
    const g = revealGate((why) => went.push(why), { timers: c.timers });
    const v = fakeVoice();
    g.voice(v.handle);
    g.shown();
    v.settle(end);
    await c.advance(30000);
    assert.deepEqual(went, [], end);
  }
  for (const start of [true, false]) {
    const c = clock();
    const went: string[] = [];
    const g = revealGate((why) => went.push(why), { timers: c.timers });
    if (start) g.voice(null);
    g.shown();
    await c.advance(30000);
    assert.deepEqual(went, [], start ? "muted (null handle)" : "never started");
  }
});

test("reveal auto-advance: 15s cap moves on; a touch or unmount drops it without cutting the voice", async () => {
  const c = clock();
  const went: Array<[string, number]> = [];
  const g = revealGate((why) => went.push([why, c.now]), { timers: c.timers });
  const v = fakeVoice();
  g.voice(v.handle);
  g.shown();
  await c.advance(VOICE_MAX_MS);
  assert.deepEqual(went, [["cap", VOICE_MAX_MS]]);
  assert.equal(v.stops(), 1, "a stalled clip is stopped at the cap");

  for (const how of ["touch", "cancel"] as const) {
    const c2 = clock();
    const went2: string[] = [];
    const g2 = revealGate((why) => went2.push(why), { timers: c2.timers });
    const v2 = fakeVoice();
    g2.voice(v2.handle);
    g2.shown();
    await c2.advance(2000);
    g2[how]();
    v2.settle("ended");
    await c2.advance(30000);
    assert.deepEqual(went2, [], how);
    assert.equal(v2.stops(), 0, `${how} itself does not cut the voice`);
    assert.equal(g2.done, true);
  }
});
