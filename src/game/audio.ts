import { storyVoiceChunks, storyVoiceLines, storyVoiceProfile, storyVoiceSpokenText } from "./story-voice.ts";
import { STORY_VOICE_LANG } from "./story-voice-cast.ts";
import type { Rarity } from "./data";
import { voiceFallback } from "./voice-zh.ts";
import type { VoiceEnd, VoiceHandle } from "./voice-timing.ts";

let ctx: AudioContext | null = null;

export function ensureAudio() {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const NOTES: Record<Rarity, number[]> = {
  R: [494, 659],
  S: [523, 659, 784],
  SS: [659, 831, 1046],
  SSR: [523, 659, 784, 1046, 1318],
};

function tone(freq: number, when: number, dur: number, type: OscillatorType, gain: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(gain, when + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

export function playRitual(muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  tone(196, audio.currentTime, 0.4, "sine", 0.05);
  tone(392, audio.currentTime + 0.18, 0.5, "triangle", 0.03);
}

function clink(freq: number, when: number, gain: number) {
  tone(freq, when, 0.12, "sine", gain);
  tone(freq * 2.4, when, 0.07, "sine", gain * 0.4);
  tone(freq * 3.8, when + 0.004, 0.04, "triangle", gain * 0.22);
}

export function playJadeTap(muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  clink(1568, audio.currentTime, 0.07);
}

export function playJadeMiss(muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  clink(392, audio.currentTime, 0.05);
}

export function playJadeClear(count: number, muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const notes = [784, 1046, 1318, 1760];
  const n = Math.min(notes.length, 2 + Math.floor(count / 3));
  notes.slice(0, n).forEach((freq, i) => {
    clink(freq, audio.currentTime + i * 0.08, 0.08);
  });
}

export function playRarity(rarity: Rarity, muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const type: OscillatorType = rarity === "SSR" ? "triangle" : "sine";
  const gain = rarity === "SSR" ? 0.07 : 0.05;
  NOTES[rarity].forEach((freq, i) => {
    tone(freq, audio.currentTime + i * 0.11, 0.55, type, gain);
  });
}

/* ── 三消 sound set ────────────────────────────────────────────────────────
 * All synthesized with WebAudio (no files), tuned to a D gong pentatonic so
 * everything sits together; quiet master gain + compressor so stacked cascades
 * never clip. Every function respects the global 靜音 (muted) switch.
 *   match  – jade clinks, one note higher per cascade step
 *   line   – guqin glissando run + a breathy filtered-noise sweep (橫掃)
 *   bomb   – low thump with a dropping pitch, dark noise burst, low gong ring
 *   color  – 龍珠: shimmering bell cascade over a soft high swell
 *   assist – deep plucked string + singing-bowl hum + rising wind, then voice
 */
const PENTA = [293.7, 329.6, 370, 440, 493.9]; // D E F# A B
const penta = (step: number) => PENTA[((step % 5) + 5) % 5]! * 2 ** Math.floor(step / 5);

let bus: GainNode | null = null;
function out(audio: AudioContext): AudioNode {
  if (bus) return bus;
  const comp = audio.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  bus = audio.createGain();
  bus.gain.value = 0.9;
  bus.connect(comp);
  comp.connect(audio.destination);
  return bus;
}

let noiseBuf: AudioBuffer | null = null;
function noise(audio: AudioContext) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(audio: AudioContext, when: number, attack: number, dur: number, gain: number) {
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  g.connect(out(audio));
  return g;
}

function osc(audio: AudioContext, type: OscillatorType, freq: number, when: number, dur: number, gain: number, attack = 0.005, slideTo?: number) {
  const o = audio.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
  o.connect(env(audio, when, attack, dur, gain));
  o.start(when);
  o.stop(when + dur + 0.05);
}

function hiss(audio: AudioContext, when: number, dur: number, gain: number, type: BiquadFilterType, from: number, to: number, q = 1) {
  const src = audio.createBufferSource();
  src.buffer = noise(audio);
  src.loop = true;
  const f = audio.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, when);
  f.frequency.exponentialRampToValueAtTime(to, when + dur);
  src.connect(f);
  f.connect(env(audio, when, Math.min(0.08, dur / 3), dur, gain));
  src.start(when);
  src.stop(when + dur + 0.05);
}

/** A plucked string: bright attack that darkens, a little detune for body. */
function pluck(audio: AudioContext, freq: number, when: number, dur: number, gain: number) {
  const f = audio.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(freq * 8, when);
  f.frequency.exponentialRampToValueAtTime(freq * 1.5, when + dur * 0.6);
  f.connect(env(audio, when, 0.004, dur, gain));
  for (const [mult, type, g] of [[1, "triangle", 1], [2, "sine", 0.35], [1.003, "sawtooth", 0.18]] as const) {
    const o = audio.createOscillator();
    o.type = type;
    o.frequency.value = freq * mult;
    const og = audio.createGain();
    og.gain.value = g;
    o.connect(og);
    og.connect(f);
    o.start(when);
    o.stop(when + dur + 0.05);
  }
}

/** Bell with inharmonic partials (small jade bell / bowl). */
function bell(audio: AudioContext, freq: number, when: number, dur: number, gain: number) {
  for (const [m, g] of [[1, 1], [2.76, 0.42], [5.4, 0.2], [8.93, 0.08]] as const) osc(audio, "sine", freq * m, when, dur / Math.sqrt(m), gain * g, 0.003);
}

/** (1) Normal match: two or three jade clinks, pitched up per cascade step. */
export function playMatch(count: number, chain: number, muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const t = audio.currentTime;
  const base = 5 + Math.min(chain, 6);
  const n = count >= 5 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const f = penta(base + i * 2);
    osc(audio, "sine", f * 2, t + i * 0.055, 0.16, 0.07);
    osc(audio, "sine", f * 4.8, t + i * 0.055, 0.06, 0.02);
  }
}

/** (2) 刻玉 line clear: fast guqin run across the row plus a wind sweep. */
export function playLine(muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const t = audio.currentTime;
  for (let i = 0; i < 7; i++) pluck(audio, penta(3 + i), t + i * 0.032, 0.5, 0.05);
  hiss(audio, t, 0.38, 0.05, "bandpass", 600, 5200, 2.5);
}

/** (3) 金鑲玉 bomb: a muffled drum hit, dark burst, low gong tail. */
export function playBomb(muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const t = audio.currentTime;
  osc(audio, "sine", 140, t, 0.45, 0.32, 0.003, 38);
  hiss(audio, t, 0.35, 0.16, "lowpass", 1800, 120, 0.7);
  bell(audio, 98, t + 0.02, 1.4, 0.06);
}

/** (4) 龍珠 colour clear: a bright bell cascade over a soft rising swell. */
export function playColor(muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const t = audio.currentTime;
  for (let i = 0; i < 9; i++) bell(audio, penta(14 - i), t + i * 0.05, 0.9, 0.035);
  osc(audio, "sine", penta(10), t, 0.9, 0.04, 0.25, penta(15));
  osc(audio, "triangle", penta(5), t, 1.0, 0.025, 0.3);
  hiss(audio, t, 0.7, 0.025, "highpass", 4000, 9000);
}

/** One sound for a resolved wave: the biggest special decides. */
export function playWaveSound(effects: { type: string }[], removed: number, chain: number, muted: boolean) {
  if (effects.some((e) => e.type === "color" || e.type === "board")) playColor(muted);
  else if (effects.some((e) => e.type === "bomb")) playBomb(muted);
  else if (effects.some((e) => e.type === "row" || e.type === "col")) playLine(muted);
  else playMatch(removed, chain, muted);
}

/** (5) 助陣 發動: a deep pluck, a singing bowl and a wind rising under the cut-in. */
export function playAssist(rarity: Rarity, muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const t = audio.currentTime;
  hiss(audio, t, 0.7, 0.06, "bandpass", 300, 3000, 1.2);
  pluck(audio, penta(-5), t + 0.05, 1.6, 0.12);
  pluck(audio, penta(0), t + 0.12, 1.4, 0.07);
  bell(audio, penta(0) / 2, t + 0.1, 2.4, 0.07);
  const top = rarity === "SSR" ? 4 : rarity === "SS" ? 3 : 2;
  for (let i = 0; i <= top; i++) bell(audio, penta(7 + i * 2), t + 0.35 + i * 0.09, 1.1, 0.025);
}

/** (6) 餘步加分: one small jade bell per cashed-in move, climbing the scale. */
export function playMoveBonus(index: number, muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const t = audio.currentTime;
  const f = penta(7 + Math.min(index, 9));
  bell(audio, f, t, 0.35, 0.03);
  osc(audio, "sine", f * 2, t, 0.08, 0.02);
}

/** (7) 餘步加分 done: a short rising pluck pair and a bright bell. */
export function playBonusDone(muted: boolean) {
  const audio = ensureAudio();
  if (!audio || muted) return;
  const t = audio.currentTime;
  pluck(audio, penta(5), t, 0.7, 0.06);
  pluck(audio, penta(9), t + 0.07, 0.8, 0.05);
  bell(audio, penta(14), t + 0.14, 1.0, 0.035);
}

/* ── Voices (SSR/SS only): Chinese listening-trial mp3s in public/voice/.
 * Original Japanese clips remain in /workspace/bak/voice-ja-mp3/; voice-ja.ts keeps their text.
 * Browser fallback follows STORY_VOICE_LANG. S / R remain silent. */
let voiceEl: HTMLAudioElement | null = null; // one shared element: iOS unlocks it once (primeVoice) and it stays usable
let voiceStop: (() => void) | null = null; // settles the current clip's handle as "stopped"
let primed = false;
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
function sharedVoice() {
  if (!voiceEl) {
    voiceEl = new Audio();
    voiceEl.preload = "auto";
  }
  return voiceEl;
}
/**
 * Call from a tap (召喚 / 預覽): plays a silent clip on the shared voice element, so iOS Safari / WKWebView in-app
 * browsers let it play the love-line voice later, when the brush starts writing (seconds after the tap).
 */
export function primeVoice() {
  if (typeof window === "undefined" || primed) return;
  const a = sharedVoice();
  if (!a.paused) return;
  primed = true;
  a.src = SILENCE;
  void a.play().then(
    () => {
      if (a.src === SILENCE) a.pause();
    },
    () => {
      primed = false;
    },
  );
}
export function stopVoice() {
  const settle = voiceStop;
  voiceStop = null;
  settle?.();
  if (voiceEl) voiceEl.pause();
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
export type VoiceClip = "assist" | "line" | "love";
/** URL of a voice clip, or null when the character has none (S / R). */
export function voiceSrc(id: string, clip: VoiceClip = "assist"): string | null {
  if (!voiceFallback(id, "", clip)) return null;
  return clip === "assist" ? `/voice/${id}.mp3` : `/voice/${id}-${clip}.mp3`;
}
export function preloadVoice(id: string, clip: VoiceClip = "assist") {
  const src = voiceSrc(id, clip);
  if (typeof window === "undefined" || !src) return;
  const a = new Audio();
  a.preload = "auto";
  a.src = src;
}
/**
 * Play a character's Chinese-trial voice clip (stops any other). Returns a handle whose `done` settles when the clip ends,
 * fails (load error / autoplay blocked: the browser's language-matched speech synthesis then reads the text, untimed) or is
 * stopped; null when muted, server-side or the character is unvoiced (S / R).
 */
export function playVoice(id: string, line: string, muted: boolean, clip: VoiceClip = "assist"): VoiceHandle | null {
  const src = voiceSrc(id, clip);
  if (typeof window === "undefined" || muted || !src) return null;
  const fallback = voiceFallback(id, line, clip);
  stopVoice();
  const speak = () => {
    if (!("speechSynthesis" in window) || !fallback) return;
    const u = new SpeechSynthesisUtterance(fallback.text);
    u.lang = fallback.lang;
    u.rate = 0.9;
    u.pitch = 0.8;
    const voices = window.speechSynthesis.getVoices();
    const prefix = fallback.lang.split("-")[0];
    const v = voices.find(x => x.lang.replace("_", "-").toLowerCase() === fallback.lang.toLowerCase())
      ?? voices.find(x => x.lang.toLowerCase().startsWith(prefix));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  };
  const a = sharedVoice();
  let settle!: (end: VoiceEnd) => void;
  const done = new Promise<VoiceEnd>((resolve) => {
    let over = false;
    settle = (end) => {
      if (over) return;
      over = true;
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      if (voiceStop === stopThis) voiceStop = null;
      resolve(end);
    };
  });
  const onEnded = () => settle("ended");
  const onError = () => {
    if (voiceStop !== stopThis) return;
    settle("failed");
    speak();
  };
  const stopThis = () => settle("stopped");
  voiceStop = stopThis;
  a.addEventListener("ended", onEnded);
  a.addEventListener("error", onError);
  a.volume = 1;
  a.src = src;
  void a.play().catch(onError);
  return {
    done,
    stop: () => {
      if (voiceStop === stopThis) stopVoice();
    },
  };
}

const storyVoiceCache = new Map<string, Blob>();
const STORY_VOICE_CACHE_MAX = 80;

function rememberStoryVoice(key: string, blob: Blob) {
  if (storyVoiceCache.has(key)) storyVoiceCache.delete(key);
  storyVoiceCache.set(key, blob);
  while (storyVoiceCache.size > STORY_VOICE_CACHE_MAX) {
    const first = storyVoiceCache.keys().next().value;
    if (first === undefined) break;
    storyVoiceCache.delete(first);
  }
}

function speakStoryVoiceSynth(text: string, speaker: string, onDone: (end: VoiceEnd) => void, isCurrent: () => boolean) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    onDone("failed");
    return;
  }
  const synth = window.speechSynthesis;
  const chunks = storyVoiceChunks(text);
  if (!chunks.length) {
    onDone("ended");
    return;
  }
  const profile = storyVoiceProfile(speaker);
  let current: SpeechSynthesisUtterance | null = null;
  const speak = (index: number) => {
    if (!isCurrent()) return;
    if (index >= chunks.length) { onDone("ended"); return; }
    const utterance = new window.SpeechSynthesisUtterance(chunks[index]);
    current = utterance;
    utterance.lang = STORY_VOICE_LANG === "zh" ? "zh-TW" : "ja-JP";
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;
    const voices = synth.getVoices();
    const norm = (lang: string) => lang.replace(/_/g, "-").toLowerCase();
    const prefix = STORY_VOICE_LANG === "zh" ? "zh" : "ja";
    const voice = voices.find(v => norm(v.lang) === norm(utterance.lang))
      ?? voices.find(v => norm(v.lang).startsWith(prefix));
    if (voice) utterance.voice = voice;
    utterance.onend = () => speak(index + 1);
    utterance.onerror = () => onDone("failed");
    try { synth.speak(utterance); } catch { onDone("failed"); }
  };
  const start = () => {
    if (!isCurrent()) return;
    speak(0);
  };
  if (synth.getVoices().length) start();
  else {
    const ready = () => {
      synth.removeEventListener("voiceschanged", ready);
      start();
    };
    synth.addEventListener("voiceschanged", ready);
    window.setTimeout(ready, 300);
  }
  void current;
}

/** Read spoken story lines via ElevenLabs, sharing the exclusive voice channel with love clips. */
export function playStoryVoice(text: string, speaker: string, muted: boolean): VoiceHandle | null {
  stopVoice();
  if (typeof window === "undefined" || muted || !text.trim()) return null;
  const spoken = storyVoiceLines(text).join("。");
  if (!spoken) return null;
  let over = false;
  let objectUrl: string | null = null;
  let resolve!: (end: VoiceEnd) => void;
  const done = new Promise<VoiceEnd>((settle) => { resolve = settle; });
  const settle = (end: VoiceEnd) => {
    if (over) return;
    over = true;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    if (voiceStop === stopThis) voiceStop = null;
    resolve(end);
  };
  const stopThis = () => settle("stopped");
  const isCurrent = () => !over && voiceStop === stopThis;
  voiceStop = stopThis;
  const playBlob = (blob: Blob) => {
    if (!isCurrent()) return;
    const a = sharedVoice();
    const url = URL.createObjectURL(blob);
    objectUrl = url;
    const onEnded = () => {
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      settle("ended");
    };
    const onError = () => {
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      if (!isCurrent()) return;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      speakStoryVoiceSynth(storyVoiceSpokenText(text) || text, speaker, settle, isCurrent);
    };
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    a.volume = 1;
    a.src = url;
    void a.play().catch(onError);
  };
  const cacheKey = `${STORY_VOICE_LANG}\0${speaker}\0${spoken}`;
  const cached = storyVoiceCache.get(cacheKey);
  if (cached) {
    playBlob(cached);
    return { done, stop: () => { if (voiceStop === stopThis) stopVoice(); } };
  }
  void fetch("/api/story-voice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: spoken, speaker }),
  }).then(async (res) => {
    if (!isCurrent()) return;
    if (!res.ok) throw new Error("tts");
    const blob = await res.blob();
    if (blob.size < 64) throw new Error("tts");
    rememberStoryVoice(cacheKey, blob);
    playBlob(blob);
  }).catch(() => {
    if (isCurrent()) speakStoryVoiceSynth(storyVoiceSpokenText(text) || text, speaker, settle, isCurrent);
  });
  return { done, stop: () => { if (voiceStop === stopThis) stopVoice(); } };
}
