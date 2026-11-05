import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Portrait, cn } from "@/components/game/bits";
import { destinyBook, type Character } from "@/game/data";
import type { PullCard } from "@/game/logic";
import { AdultGate } from "@/components/game/AdultGate";
import { confirmAdult, needsAdultGate } from "@/game/adult-gate";
import { BRUSH_FAMILY } from "@/game/brush-font";
import { playVoice, preloadVoice, stopVoice, voiceSrc } from "@/game/audio";
import { revealGate } from "@/game/voice-timing";
import { useSave } from "@/game/store";
import { BRUSH_PUNCT, brushPhrases, layoutBrushLines, measureBrushLine } from "@/game/brush-break";

export function Ritual({ onSkip }: { onSkip: () => void }) {
  return (
    <div
      className="ink-overlay ritual-screen fixed inset-0 z-40 flex flex-col items-center justify-center bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="召喚中"
    >
      <Seal label="墨線牽緣" />
      <button
        type="button"
        className="ink-ghost mt-8 min-h-11 rounded-full px-6 text-sm tracking-widest"
        onClick={onSkip}
      >
        跳過
      </button>
    </div>
  );
}

function Seal({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative grid h-32 w-32 place-items-center">
        <div className="ritual-glow" aria-hidden />
        <div className="seal-ring seal-spin" />
        <div className="seal-ring seal-ring-inner spin-rev" />
        <span className="ritual-seal-text relative font-serif text-4xl">緣</span>
      </div>
      <p className="ink-title mt-6 tracking-widest text-fg">{label}</p>
    </div>
  );
}


/** Warm the SSR portrait (and the brush face) while the ritual seal spins, so nothing flashes in late. */
export function prefetchReveal(cards: { character: Character }[]) {
  if (typeof window === "undefined") return;
  for (const card of cards) {
    if (card.character.rarity === "SS") loadBrushFont(card.character.line);
    if (card.character.rarity !== "SSR") continue;
    loadBrushFont(card.character.line);
    new Image().src = `/portraits/${card.character.id}.jpg?v=10`;
  }
}

/* ---- brush-written love line (專屬情話) ---- */
const BRUSH_STEP_MS = 55; // one character every 55ms; punctuation is a quick flick
const BRUSH_INK_MS = 460; // per-character sweep + ink spread
const PUNCT = BRUSH_PUNCT;

const BRUSH_FONT_WAIT_MS = 1200; // never hold the line back longer than this; past it, write (and re-measure on swap)

export function loadBrushFont(text: string): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return document.fonts.load(`400 1em "${BRUSH_FAMILY}"`, text).catch(() => {});
}

/**
 * True once the @font-face is actually loaded. Not document.fonts.check(): WebKit reports a still-downloading face
 * as status "error" for a moment on slow links (seen in Playwright WebKit), and check() then answers true.
 */
function brushFontReady() {
  if (typeof document === "undefined" || !document.fonts) return true;
  const faces: FontFace[] = [];
  document.fonts.forEach((f) => {
    if (f.family.replace(/["']/g, "") === BRUSH_FAMILY) faces.push(f);
  });
  return faces.length === 0 || faces.some((f) => f.status === "loaded");
}

/** Start offset (ms) of each character: a full beat per glyph, half a beat per punctuation mark. */
function brushTimeline(text: string, step = BRUSH_STEP_MS) {
  let t = 0;
  return Array.from(text).map((ch) => {
    const at = t;
    t += PUNCT.test(ch) ? step / 2 : step;
    return { ch, at, punct: PUNCT.test(ch) };
  });
}

/** Time until the last character has finished inking. */
export function brushWriteMs(text: string, step = BRUSH_STEP_MS) {
  const marks = brushTimeline(text, step);
  return marks.length ? marks[marks.length - 1].at + BRUSH_INK_MS : 0;
}

/**
 * The love line, written character by character with a diagonal brush-sweep mask and a wet ink spread.
 * Lines break at phrase boundaries (after ，。！？…… etc.), balanced, never with a one- or two-character line or a
 * line that starts with punctuation (src/game/brush-break.ts). Until the sheet is measured (SSR / first pass) the
 * phrases are nowrap boxes with text-wrap: balance. The text itself is never altered.
 */
export function BrushLine({
  text,
  play,
  delay = 0,
  step = BRUSH_STEP_MS,
  className,
  onWrite,
}: {
  text: string;
  play: boolean;
  delay?: number;
  /** ms between glyphs (the 助陣 cut-in writes faster than the gacha reveal). */
  step?: number;
  className?: string;
  /** Fires once, as the first glyph starts writing (after `delay`, and after the 行書 face is ready). */
  onWrite?: () => void;
}) {
  const marks = brushTimeline(text, step);
  const writeMs = brushWriteMs(text, step);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  // Once the last glyph has dried, drop the animation classes: a finished animation with fill-mode `both`
  // keeps filter/transform/mask on every glyph (and the sheet), and iOS WebKit keeps those as low-res
  // composited layers, which reads as smeared ink. Settled, the glyphs are plain text again.
  const [settled, setSettled] = useState(false);
  // Wait for the 行書 face before writing or measuring: with font-display: swap a slow (or cold-cache) font would
  // otherwise be written, and line-broken, in the fallback serif.
  const [fontReady, setFontReady] = useState(brushFontReady);
  useEffect(() => {
    if (brushFontReady()) return setFontReady(true);
    setFontReady(false);
    const done = () => setFontReady(true);
    const poll = () => brushFontReady() && done();
    const t = window.setTimeout(done, BRUSH_FONT_WAIT_MS);
    const iv = window.setInterval(poll, 50);
    loadBrushFont(text).then(poll);
    document.fonts.addEventListener?.("loadingdone", poll);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(iv);
      document.fonts.removeEventListener?.("loadingdone", poll);
    };
  }, [text]);
  const go = play && fontReady;
  const onWriteRef = useRef(onWrite);
  useEffect(() => {
    onWriteRef.current = onWrite;
  }, [onWrite]);
  useEffect(() => {
    if (!go) return;
    const t = window.setTimeout(() => onWriteRef.current?.(), delay);
    return () => window.clearTimeout(t);
  }, [go, delay]);
  const writing = go && !settled;
  useEffect(() => {
    setSettled(false);
    if (!go) return;
    const t = window.setTimeout(() => setSettled(true), delay + writeMs + BRUSH_INK_MS + 120);
    return () => window.clearTimeout(t);
  }, [go, delay, writeMs, text]);
  useLayoutEffect(() => {
    const p = lineRef.current;
    if (!p) return;
    const run = () => {
      const next = layoutBrushLines(text, measureBrushLine(p));
      setLines((prev) => (prev && prev.join("\n") === next.join("\n") ? prev : next));
    };
    run();
    let raf = 0;
    const again = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    };
    // re-measure once the face is in (the first pass may have used the fallback's metrics)
    let live = true;
    loadBrushFont(text).then(() => live && again());
    document.fonts?.addEventListener?.("loadingdone", again);
    // the sheet shrink-wraps its lines, so watch every ancestor: whichever one sets the available width
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(again) : null;
    for (let el = p.parentElement; ro && el && el !== document.body; el = el.parentElement) ro.observe(el);
    window.addEventListener("resize", again);
    return () => {
      live = false;
      document.fonts?.removeEventListener?.("loadingdone", again);
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", again);
    };
  }, [text]);
  let at = 0;
  const ink = (ch: string) => {
    const mark = marks[at++];
    return (
      <span
        key={at}
        className={cn("rv-ink", ch === "." && "rv-ink-dot")}
        style={writing ? { animationDelay: `${delay + mark.at}ms` } : undefined}
      >
        {ch}
      </span>
    );
  };
  return (
    /* 宣紙 sheet: rice paper with fibres, deckled edges and a small seal (pure CSS/SVG, styles.css .xuan) */
    <div className={cn("xuan", writing && "xuan-play", play && !fontReady && "xuan-wait")}>
      <div className="xuan-sheet">
        {/* paper and its shadow are separate layers behind the text, so no filter, mask or transform ever covers the ink */}
        <span className="xuan-shadow" aria-hidden />
        <span className="xuan-paper" aria-hidden />
        <p ref={lineRef} className={cn("rv-brush-line", writing && "rv-brush-play", className)} aria-label={text}>
          {lines
            ? lines.map((line, li) => (
                <span key={li} className="rv-brush-row" aria-hidden>
                  {Array.from(line).map(ink)}
                </span>
              ))
            : brushPhrases(text).map((phrase, pi) => (
                <span key={pi} className="rv-brush-phrase" aria-hidden>
                  {Array.from(phrase).map(ink)}
                </span>
              ))}
        </p>
        <span className="xuan-seal" aria-hidden style={writing ? ({ "--xuan-seal-delay": `${delay + writeMs}ms` } as CSSProperties) : undefined} />
      </div>
    </div>
  );
}

/**
 * SSR: shadow → title → fill (colour floods the shadow in place) → settle (portrait glides to its
 * result-card slot) → full. SS: ss (≈1s combined entrance) → full. S/R start at full.
 */
type Stage = "shadow" | "title" | "fill" | "settle" | "ss" | "full";
const SSR_SHADOW_MS = 1300;
const SSR_TITLE_MS = 1450; // floor for stage 2; long love lines get time to finish writing
const SSR_TITLE_MAX_MS = 3600;
const SSR_LINE_DELAY_MS = 200;
const SSR_LINE_HOLD_MS = 650; // the finished line rests a beat before colour floods in
const SSR_FILL_MS = 560;
const SSR_SETTLE_MS = 440;
const SS_MS = 1000;
/** Stage 2 lasts long enough to write the whole love line (≈ proportional to its length, capped). */
function ssrTitleMs(line: string) {
  return Math.min(SSR_TITLE_MAX_MS, Math.max(SSR_TITLE_MS, SSR_LINE_DELAY_MS + brushWriteMs(line) + SSR_LINE_HOLD_MS));
}
function nextStage(stage: Stage, line: string): [Stage, number] | null {
  switch (stage) {
    case "shadow":
      return ["title", SSR_SHADOW_MS];
    case "title":
      return ["fill", ssrTitleMs(line)];
    case "fill":
      return ["settle", SSR_FILL_MS];
    case "settle":
      return ["full", SSR_SETTLE_MS];
    case "ss":
      return ["full", SS_MS];
    default:
      return null;
  }
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useRevealStage(character: Character) {
  const [reduce] = useState(reducedMotion);
  const [stage, setStage] = useState<Stage>(() =>
    reduce ? "full" : character.rarity === "SSR" ? "shadow" : character.rarity === "SS" ? "ss" : "full",
  );
  useEffect(() => {
    const next = nextStage(stage, character.line);
    if (!next) return;
    const id = window.setTimeout(() => setStage(next[0]), next[1]);
    return () => window.clearTimeout(id);
  }, [stage, character.line]);
  const [skipped, setSkipped] = useState(false);
  return {
    stage,
    reduce,
    skipped,
    skip: () => {
      setSkipped(true);
      setStage("full");
    },
  };
}

/** Stage 1: the real portrait pressed down into a near-black ink shadow, back-lit in gold/cinnabar. */
/** Per-portrait [contrast, brightness, glint strength] so each photo lands at the same "ink shadow" depth (they range from dim to bright). */
const SHADE_TUNE: Record<string, [number, number, number?]> = {
  qin: [1.4, 0.24],
  zhouyu: [1.25, 0.3],
  lanling: [1.15, 0.36],
  libai: [1.5, 0.13, 0.45],
  liuche: [1.05, 0.48],
};
function shadeVars(id: string) {
  const [c, b, g = 1] = SHADE_TUNE[id] ?? [1.35, 0.26];
  return { ["--sh-c" as string]: c, ["--sh-b" as string]: b, ["--sh-g" as string]: g } as CSSProperties;
}

/** Full-bleed: the shadow fills the whole screen (16:9 on landscape / desktop, full height on a portrait phone), cover-cropped, never letterboxed. */
function ShadowPortrait({ character }: { character: Character }) {
  return (
    <div className="rv-shade-wrap rv-shade-full relative h-full w-full" style={shadeVars(character.id)} data-testid="rv-shadow">
      <div className="rv-shade relative h-full w-full overflow-hidden">
        <Portrait id={character.id} name={character.name} className="rv-shade-img rv-bleed h-full w-full object-cover" />
        <div className="rv-shade-tint pointer-events-none absolute inset-0" aria-hidden />
        <Portrait id={character.id} name="" className="rv-shade-glint rv-bleed pointer-events-none absolute inset-0 h-full w-full object-cover" />
        <div className="rv-shade-rim pointer-events-none absolute inset-0" aria-hidden />
        <div className="rv-shade-flash pointer-events-none absolute inset-0" aria-hidden />
      </div>
    </div>
  );
}

/**
 * FLIP the in-place portrait onto the result card's portrait slot (laid out underneath, hidden),
 * so the coloured image never jumps: same box through shadow/title/fill, then one glide.
 */
function useSettleGlide(stage: Stage, target: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDivElement>(null);
  const [glide, setGlide] = useState<CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    if (stage !== "settle") return;
    const from = ref.current?.getBoundingClientRect();
    const to = target.current?.getBoundingClientRect();
    if (!from || !to || !from.width || !from.height) return;
    // full screen → card slot: the box itself moves and reshapes, the photo re-crops (object-cover) — no stretching
    const ease = `${SSR_SETTLE_MS - 40}ms cubic-bezier(.4,0,.2,1)`;
    setGlide({
      left: to.left,
      top: to.top,
      width: to.width,
      height: to.height,
      borderRadius: "0.5rem",
      overflow: "hidden",
      transition: ["left", "top", "width", "height", "border-radius"].map((p) => `${p} ${ease}`).join(", "),
    });
  }, [stage, target]);
  return { ref, glide };
}

function RevealIntro({
  character,
  stage,
  onSkip,
  target,
  onWrite,
}: {
  character: Character;
  stage: Stage;
  onSkip: () => void;
  target: RefObject<HTMLElement | null>;
  onWrite: () => void;
}) {
  const { ref, glide } = useSettleGlide(stage, target);
  return (
    <div
      className={cn("rv-intro fixed inset-0 z-[60] flex items-center justify-center overflow-hidden", `rv-${stage}`)}
      role="button"
      tabIndex={0}
      aria-label="跳過演出"
      onClick={onSkip}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSkip();
      }}
    >
      <div className="rv-burst" aria-hidden />
      <div ref={ref} className="rv-glide fixed left-0 top-0 h-full w-full" style={glide}>
        <ShadowPortrait character={character} />
      </div>
      {stage === "title" || stage === "fill" ? (
        <div className="rv-words absolute inset-0 flex flex-col items-center justify-center text-center" aria-live="polite">
          <div className="rv-motes" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} style={{ ["--i" as string]: i }} />
            ))}
          </div>
          {/* only the love line: who it is stays a secret until the colour floods in */}
          <div className="px-4">
            <BrushLine text={character.line} play delay={SSR_LINE_DELAY_MS} className="rv-love" onWrite={onWrite} />
          </div>
        </div>
      ) : null}
      <p className="rv-tap">輕觸略過</p>
    </div>
  );
}

export function Cinematic({
  card,
  preview,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  card: PullCard;
  preview: boolean;
  primaryLabel: string;
  secondaryLabel: string | null;
  onPrimary: () => void;
  onSecondary: (() => void) | null;
}) {
  const character = card.character;
  const book = destinyBook(character);
  // Explicit (SSR) 天命書 stays closed until the once-per-device 18+ confirmation.
  const [showStory, setShowStory] = useState(() => Boolean(book) && !needsAdultGate(character.rarity, 0));
  const [gate, setGate] = useState(false);
  const toggleStory = () => {
    if (!showStory && needsAdultGate(character.rarity, 0)) return setGate(true);
    setShowStory((open) => !open);
  };
  const { stage, reduce, skipped, skip: skipStage } = useRevealStage(character);
  // SS writes its love line alongside the portrait entrance; the animation outlives the 1s stage
  const [ssWrite] = useState(() => !reduce && character.rarity === "SS");
  const brush = character.rarity === "SS" || character.rarity === "SSR";
  useEffect(() => {
    if (brush) loadBrushFont(character.line);
  }, [brush, character.line]);
  // 情話（其一）voice, SSR and SS: starts as the brush starts writing the line; skip / next card / close stops it,
  // so a ten-pull never stacks voices. (primeVoice() on the 召喚 tap lets iOS play it this late.)
  // 抽卡 SSR / SS: nothing is locked — a tap skips at any time (and cuts the voice). If the player touches nothing,
  // the reveal waits for the whole love line (+0.3s, cap 15s) and then moves on by itself (下一位 / 查看全部 / 收下).
  // Muted / failed / blocked voice: no auto-advance, it waits for a tap as before.
  const [gated] = useState(() => brush && !preview && !!voiceSrc(character.id, "line") && !useSave.getState().muted);
  const gateRef = useRef<ReturnType<typeof revealGate> | null>(null);
  const spoken = useRef(false);
  const advanceRef = useRef(onPrimary);
  advanceRef.current = onPrimary;
  useEffect(() => {
    if (!gated) return;
    const g = revealGate(() => advanceRef.current());
    gateRef.current = g;
    return () => {
      gateRef.current = null;
      g.cancel();
    };
  }, [gated]);
  const touched = () => gateRef.current?.touch();
  const speakLine = () => {
    if (spoken.current) return;
    spoken.current = true;
    const h = playVoice(character.id, character.line, useSave.getState().muted, "line");
    gateRef.current?.voice(h);
  };
  const muted = useSave((s) => s.muted);
  useEffect(() => {
    if (muted) stopVoice();
  }, [muted]);
  useEffect(() => {
    if (brush) preloadVoice(character.id, "line");
    // reduced motion writes nothing: the line is simply there, so speak it as the card appears
    if (brush && reduce) speakLine();
    return () => stopVoice();
  }, [brush, reduce, character.id, character.line]);
  // tapping to skip cuts the voice (never two voices at once) and hands control to the player
  const skip = () => {
    touched();
    spoken.current = true;
    stopVoice();
    skipStage();
  };
  const intro = stage === "shadow" || stage === "title" || stage === "fill" || stage === "settle";
  const portraitRef = useRef<HTMLDivElement>(null);
  // SSR: the result page fades in under the gliding portrait (settle), then the caption lands (full).
  // SS: one-beat entrance. Reduced motion: plain fade.
  const enter = skipped
    ? ""
    : reduce
      ? "rv-fade"
      : stage === "settle"
        ? "rv-settle"
        : character.rarity === "SSR"
          ? "rv-enter-ssr"
          : stage === "ss"
            ? "rv-enter-ss"
            : "";
  const hidden = stage === "shadow" || stage === "title" || stage === "fill";
  useEffect(() => {
    if (stage === "full") gateRef.current?.shown();
  }, [stage]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center [justify-content:safe_center] overflow-y-auto p-4 text-[#f6e7c1] ink-overlay cine-screen"
      style={{ color: "#f6e7c1" }}
      role="dialog"
      aria-modal="true"
      aria-label={`${character.name}登場`}
      onClick={stage === "ss" ? skip : undefined}
      // any touch / scroll / key on the result screen means the player is in charge: no auto-advance
      onPointerDownCapture={touched}
      onTouchStartCapture={touched}
      onWheelCapture={touched}
      onKeyDownCapture={touched}
    >
      {intro ? <RevealIntro character={character} stage={stage} onSkip={skip} target={portraitRef} onWrite={speakLine} /> : null}
      <div className={cn("rv-stage contents", hidden ? "rv-hidden" : enter)}>
      <div ref={portraitRef} className="rv-portrait relative w-full max-w-md" style={shadeVars(character.id)}>
        <Portrait
          id={character.id}
          name={character.name}
          className="aspect-card w-full rounded-lg object-cover object-center shadow-2xl"
        />
        <div className="rv-flash pointer-events-none absolute inset-0 rounded-lg" aria-hidden />
        <div className="rv-caption absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <div className="text-center">
            <div className="text-xs tracking-widest text-amber-300">{character.rarity}</div>
            <h1 className="font-serif text-3xl font-bold" style={{ color: "#f3eadc" }}>
              {character.name}
            </h1>
            <p className="text-sm text-stone-300">{character.epithet}</p>
          </div>
        </div>
      </div>

      {brush ? (
        <div className="rv-after mt-6 max-w-md text-center" style={{ color: "#f6e7c1" }}>
          <BrushLine text={`「${character.line}」`} play={ssWrite && !skipped} delay={300} className="rv-love-card" onWrite={speakLine} />
        </div>
      ) : (
        <div className="rv-after mt-6 max-w-md text-center text-lg leading-relaxed" style={{ color: "#f6e7c1" }}>
          「{character.line}」
        </div>
      )}
      {character.scene ? (
        <p className="mt-3 max-w-md text-center text-sm leading-relaxed" style={{ color: "#f3eadc" }}>
          {character.scene}
        </p>
      ) : null}
      {preview ? (
        <p className="mt-2 text-xs tracking-widest text-[#e7d7c3]">演出預覽</p>
      ) : null}

      {/* 正文來自 eroticStory。SSR 題為天命書，SS 與 S 題為專屬物語。 */}
      {book ? (
        <div className="mt-6 w-full max-w-md">
          <button
            type="button"
            onClick={toggleStory}
            className="min-h-11 w-full rounded-lg bg-rose-900/60 px-4 py-2 text-sm text-rose-100 hover:bg-rose-800/80"
          >
            {showStory ? `收起${book.title}` : `閱讀${book.title}`}
          </button>
          {showStory ? (
            <div
              className="tale-screen mt-4 max-h-[50dvh] overflow-y-auto rounded-lg border p-4"
              tabIndex={0}
              role="region"
              aria-label={`《${book.title}》`}
            >
              <h3 className="mb-2 text-center font-semibold">
                《{book.title}》
              </h3>
              {book.chapter ? <p className="tale-chapter mb-2 text-center text-sm tracking-widest">{book.chapter}</p> : null}
              <p className="tale-text whitespace-pre-line">{book.text}</p>
            </div>
          ) : null}
          {gate ? (
            <AdultGate
              onConfirm={() => {
                confirmAdult();
                setGate(false);
                setShowStory(true);
              }}
              onDecline={() => setGate(false)}
            />
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "mt-6 grid w-full max-w-md gap-3",
          secondaryLabel ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className="min-h-11 rounded-full border border-stone-500 px-6 py-2 text-sm hover:bg-stone-800"
            style={{ color: "#f3eadc" }}
          >
            {secondaryLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onPrimary}
          className="min-h-11 rounded-full border border-stone-500 px-6 py-2 text-sm hover:bg-stone-800"
          style={{ color: "#f3eadc" }}
        >
          {primaryLabel}
        </button>
      </div>
      </div>
    </div>
  );
}