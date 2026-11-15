/**
 * 召喚揭曉 SFX — all synthesized with WebAudio at runtime (no third-party audio files, nothing to license).
 * Every cue respects the global 靜音 switch and routes through one gain node, so `stopSummonSfx()`
 * silences everything still ringing the moment the player leaves the animation.
 */
import { ensureAudio } from "./audio.ts";
import type { SsrScene } from "./summon-reveal.ts";

let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function bus(): { a: AudioContext; out: GainNode } | null {
  const a = ensureAudio();
  if (!a) return null;
  if (!master || master.context !== a) {
    master = a.createGain();
    master.gain.value = 0.8;
    master.connect(a.destination);
  }
  return { a, out: master };
}

function noise(a: AudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === a.sampleRate) return noiseBuf;
  noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(a: AudioContext, out: AudioNode, when: number, attack: number, dur: number, gain: number) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  g.connect(out);
  return g;
}

function tone(type: OscillatorType, freq: number, at: number, dur: number, gain: number, slideTo?: number, attack = 0.01) {
  const b = bus();
  if (!b) return;
  const when = b.a.currentTime + at;
  const o = b.a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
  o.connect(env(b.a, b.out, when, attack, dur, gain));
  o.start(when);
  o.stop(when + dur + 0.05);
}

function hiss(at: number, dur: number, gain: number, type: BiquadFilterType, from: number, to: number, q = 1, attack = 0.05) {
  const b = bus();
  if (!b) return;
  const when = b.a.currentTime + at;
  const src = b.a.createBufferSource();
  src.buffer = noise(b.a);
  src.loop = true;
  const f = b.a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, when);
  f.frequency.exponentialRampToValueAtTime(to, when + dur);
  src.connect(f);
  f.connect(env(b.a, b.out, when, Math.min(attack, dur / 2), dur, gain));
  src.start(when);
  src.stop(when + dur + 0.05);
}

function bell(freq: number, at: number, dur: number, gain: number) {
  for (const [m, g] of [[1, 1], [2.76, 0.4], [5.4, 0.16]] as const) tone("sine", freq * m, at, dur / Math.sqrt(m), gain * g, undefined, 0.004);
}

function pluck(freq: number, at: number, dur: number, gain: number) {
  tone("triangle", freq, at, dur, gain, undefined, 0.004);
  tone("sine", freq * 2, at, dur * 0.6, gain * 0.3, undefined, 0.004);
}

/* ── cues ── */
export function sfxInkDrop(muted: boolean, at = 0) {
  if (muted) return;
  tone("sine", 900, at, 0.16, 0.05, 260);
  hiss(at + 0.02, 0.35, 0.025, "lowpass", 1800, 300, 0.7);
}
export function sfxPageTurn(muted: boolean, at = 0) {
  if (muted) return;
  hiss(at, 0.32, 0.035, "bandpass", 1200, 4200, 0.9);
}
export function sfxBrush(muted: boolean, at = 0) {
  if (muted) return;
  hiss(at, 0.55, 0.02, "bandpass", 2600, 900, 1.6, 0.12);
}
export function sfxLightBell(muted: boolean, at = 0) {
  if (muted) return;
  bell(1318, at, 1.2, 0.03);
}
export function sfxScroll(muted: boolean, at = 0) {
  if (muted) return;
  hiss(at, 1.1, 0.03, "lowpass", 500, 2400, 0.6, 0.3);
  tone("sine", 110, at, 1.0, 0.025, 165, 0.2);
}
export function sfxGateHum(muted: boolean, at = 0) {
  if (muted) return;
  tone("sine", 73.4, at, 2.2, 0.05, 98, 0.5);
  tone("triangle", 146.8, at + 0.4, 1.8, 0.018, undefined, 0.6);
}
export function sfxGateOpen(muted: boolean, at = 0) {
  if (muted) return;
  hiss(at, 0.9, 0.03, "lowpass", 300, 3000, 0.5, 0.25);
  bell(587, at + 0.25, 2.2, 0.035);
}
export function sfxReveal(rarity: "R" | "S" | "SS" | "SSR", muted: boolean, at = 0) {
  if (muted) return;
  if (rarity === "R") return; // R stays a single ink drop
  if (rarity === "S") return sfxLightBell(false, at);
  if (rarity === "SS") {
    bell(880, at, 1.6, 0.03);
    bell(1318, at + 0.12, 1.4, 0.022);
    return;
  }
  [523, 659, 784, 1046].forEach((f, i) => bell(f, at + i * 0.13, 2, 0.026));
}
export function sfxFast(rarity: "R" | "S" | "SS" | "SSR", muted: boolean) {
  if (muted) return;
  const f = { R: 880, S: 1046, SS: 1318, SSR: 1568 }[rarity];
  tone("sine", f, 0, 0.18, 0.03);
}
export function sfxRankUp(muted: boolean, at = 0) {
  if (muted) return;
  [587, 740, 880].forEach((f, i) => bell(f, at + i * 0.1, 1.1, 0.025));
}

/** Exclusive SSR scene beds (short, quiet). */
export function sfxScene(scene: SsrScene, muted: boolean, at = 0) {
  if (muted) return;
  switch (scene) {
    case "palace": // lamp catches, low hall resonance
      tone("sine", 98, at, 2.4, 0.03, undefined, 0.4);
      bell(392, at + 0.3, 2.4, 0.02);
      return;
    case "river": // ripples + qin strings
      hiss(at, 2.2, 0.015, "lowpass", 600, 300, 0.5, 0.4);
      [293.7, 370, 440, 587].forEach((f, i) => pluck(f, at + 0.25 + i * 0.32, 1.6, 0.035));
      return;
    case "snowgate": // wind that eases
      hiss(at, 2.6, 0.04, "bandpass", 900, 350, 1.2, 0.4);
      return;
    case "moon": // soft bell under water + a pluck
      bell(659, at + 0.2, 2.2, 0.022);
      pluck(440, at + 0.9, 1.4, 0.028);
      return;
    case "dawngate": // low drum + warm chord
      tone("sine", 82, at, 0.6, 0.06, 55, 0.01);
      [392, 494, 587].forEach((f) => tone("triangle", f, at + 0.5, 2.0, 0.014, undefined, 0.5));
      return;
  }
}

/** Cut every summon cue still sounding (leaving the animation, skip-all, closing). */
export function stopSummonSfx() {
  const a = ensureAudio();
  if (!a || !master) return;
  const old = master;
  master = null;
  try {
    old.gain.cancelScheduledValues(a.currentTime);
    old.gain.setValueAtTime(old.gain.value, a.currentTime);
    old.gain.linearRampToValueAtTime(0, a.currentTime + 0.08);
    window.setTimeout(() => old.disconnect(), 150);
  } catch {
    old.disconnect();
  }
}
