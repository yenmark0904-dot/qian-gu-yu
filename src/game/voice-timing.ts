/**
 * How long a voiced overlay (the 三消 助陣 cut-in) stays up: at least its usual `baseMs`, and with a voice playing,
 * until the voice has finished plus a short tail — capped, so a stalled clip can never trap the board.
 * A failed / blocked / muted voice (null or "failed") falls back to `baseMs`; a skip ends it at once and stops the voice.
 */
export const VOICE_TAIL_MS = 300;
export const VOICE_MAX_MS = 15_000;

/** "ended": played to the end · "failed": could not load / autoplay blocked · "stopped": stopVoice() (skip, mute, next clip). */
export type VoiceEnd = "ended" | "failed" | "stopped";
export interface VoiceHandle {
  done: Promise<VoiceEnd>;
  stop(): void;
}
export type HoldEnd = "base" | "voice" | "cap" | "skip";

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};
const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function holdForVoice(
  baseMs: number,
  voice: VoiceHandle | null,
  {
    tailMs = VOICE_TAIL_MS,
    maxMs = VOICE_MAX_MS,
    timers = realTimers,
  }: { tailMs?: number; maxMs?: number; timers?: Timers } = {},
): { done: Promise<HoldEnd>; skip: () => void } {
  let finish!: (why: HoldEnd) => void;
  const done = new Promise<HoldEnd>((resolve) => {
    let over = false;
    const ids: unknown[] = [];
    let baseOver = false;
    let voiceOver = !voice;
    finish = (why) => {
      if (over) return;
      over = true;
      ids.forEach((id) => timers.clearTimeout(id));
      // the overlay is going away: never leave its voice talking over the board (cap / skip)
      if (voice && (why === "cap" || why === "skip")) voice.stop();
      resolve(why);
    };
    const check = (why: HoldEnd) => baseOver && voiceOver && finish(why);
    ids.push(timers.setTimeout(() => ((baseOver = true), check("base")), baseMs));
    if (voice) {
      ids.push(timers.setTimeout(() => finish("cap"), Math.max(baseMs, maxMs)));
      void voice.done.then((end) => {
        if (over) return;
        if (end === "ended") {
          ids.push(timers.setTimeout(() => ((voiceOver = true), check("voice")), tailMs));
        } else {
          voiceOver = true;
          check("base");
        }
      });
    }
  });
  return { done, skip: () => finish("skip") };
}

/** If a gated reveal's voice has not started within this long (font stall, odd timing), the gate opens anyway. */
/** After an auto-advance-worthy voice end, the revealed card stays on screen at least this long. */
export const REVEAL_MIN_SHOW_MS = 1500;
export type GateOpen = "voice" | "cap";

/**
 * 抽卡 reveal (SSR / SS) auto-advance: nothing is locked — a tap skips at any time. An idle player instead hears the
 * whole love line: once the voice has ended (+ tail, capped at `maxMs`) and the card has been shown for `minShowMs`,
 * `onAdvance` moves on to the next card / the results. Muted / failed / blocked / stopped / never-started voice never
 * auto-advances (the screen just waits for a tap, as before). `touch()` (the player interacted) and `cancel()`
 * (unmount) drop the advance; neither calls back nor cuts the voice — skipping cuts it in the component.
 */
export function revealGate(
  onAdvance: (why: GateOpen) => void,
  {
    tailMs = VOICE_TAIL_MS,
    maxMs = VOICE_MAX_MS,
    minShowMs = REVEAL_MIN_SHOW_MS,
    timers = realTimers,
  }: { tailMs?: number; maxMs?: number; minShowMs?: number; timers?: Timers } = {},
) {
  let off = false;
  let started = false;
  let heard: GateOpen | null = null;
  let shownAt = false;
  let shownOver = false;
  let showTimer: unknown;
  const check = () => {
    if (off || !heard || !shownOver) return;
    off = true;
    onAdvance(heard);
  };
  return {
    get done() {
      return off;
    },
    /** The voice just started (or null: nothing will play). Later calls are ignored. */
    voice(handle: VoiceHandle | null) {
      if (off || started) return;
      started = true;
      if (!handle) return;
      void holdForVoice(0, handle, { tailMs, maxMs, timers }).done.then((end) => {
        if (end !== "voice" && end !== "cap") return;
        heard = end;
        check();
      });
    },
    /** The finished card is on screen (call once the reveal animation is over). */
    shown() {
      if (off || shownAt) return;
      shownAt = true;
      showTimer = timers.setTimeout(() => ((shownOver = true), check()), minShowMs);
    },
    /** The player touched / tapped / scrolled: they are in charge now, no auto-advance. */
    touch() {
      off = true;
      timers.clearTimeout(showTimer);
    },
    /** Unmount: drop timers without calling back. */
    cancel() {
      off = true;
      timers.clearTimeout(showTimer);
    },
  };
}
