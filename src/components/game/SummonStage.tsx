import { SummonInkPrelude } from "./SummonInkPrelude";
import { artifactImage, ARTIFACT_PLACEHOLDER, type ArtifactDef } from "@/game/artifacts";
/**
 * 召喚揭曉 · per-card performances (R 墨中初逢 / S 書頁相遇 / SS 畫卷映君 / SSR 天命赴約),
 * the shared ink-drop opening, the 十連 omen and the fast seal flip.
 * Pure presentation: every card handed in here has already been settled and saved by store.pull().
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Rarity } from "@/game/data";
import type { PullCard } from "@/game/logic";
import { playVoice, preloadVoice, stopVoice, voiceSrc } from "@/game/audio";
import {
  BEATS,
  OMEN,
  OPENING,
  REVEAL_RARITY,
  SSR_SUMMON,
  captionOf,
  portraitSrc,
  revealLine,
  settlementOf,
  ssrScene,
  type SsrScene,
} from "@/game/summon-reveal";
import {
  sfxBrush,
  sfxGateHum,
  sfxGateOpen,
  sfxInkDrop,
  sfxLightBell,
  sfxPageTurn,
  sfxRankUp,
  sfxReveal,
  sfxScene,
  sfxScroll,
} from "@/game/summon-sfx";
import { useSave } from "@/game/store";
import { MoHen, cn } from "@/components/game/bits";
import "./summon.css";

const d = (ms: number): CSSProperties =>
  ({ ["--d" as string]: `${Math.max(0, ms)}ms` }) as CSSProperties;

/* ───────────────────────── image loading (reserved box, explicit state, graceful fallback) ───────────────────────── */

type ImgState = "loading" | "ready" | "failed";
export function useImage(src: string): ImgState {
  const [state, setState] = useState<ImgState>("loading");
  useEffect(() => {
    setState("loading");
    const img = new Image();
    let live = true;
    img.onload = () => live && setState("ready");
    img.onerror = () => live && setState("failed");
    img.src = src;
    if (img.complete && img.naturalWidth > 0) setState("ready");
    // never hang on a slow network: after 8s treat it as failed so the clean fallback shows
    const t = window.setTimeout(
      () => live && setState((s) => (s === "loading" ? "failed" : s)),
      8000,
    );
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [src]);
  return state;
}

export function CardArt({
  card,
  className,
  style,
}: {
  card: PullCard;
  className?: string;
  style?: CSSProperties;
}) {
  const c = card.character;
  const state = useImage(portraitSrc(c.id));
  return (
    <div className={cn("sm-art", `sm-art-${c.rarity}`, className)} style={style} data-img={state}>
      {state === "ready" ? (
        <img src={portraitSrc(c.id)} alt={c.name} draggable={false} />
      ) : state === "loading" ? (
        <div className="sm-art-wait" role="status">
          <span className="sm-art-wait-dot" aria-hidden />
          墨跡未乾…
        </div>
      ) : (
        <div className="sm-art-fallback" aria-label={c.name}>
          <span>{c.name.slice(0, 1)}</span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── settlement strip under a revealed card ───────────────────────── */

export function SettleNote({ card, beat = true }: { card: PullCard; beat?: boolean }) {
  const s = settlementOf(card);
  if (s.kind === "new") {
    return (
      <div className="sm-note sm-note-new" data-kind="new">
        <span className="sm-seal-chop">初逢</span>
        <span>緣分自「{s.levelName}」起</span>
      </div>
    );
  }
  if (s.kind === "max") {
    return (
      <div className="sm-note sm-note-max" data-kind="max">
        <span className="sm-tag">重逢</span>
        <span>
          緣分已圓滿 · 整張化為墨痕 <MoHen /> +{s.marks}
        </span>
      </div>
    );
  }
  if (s.kind === "rankup") {
    return (
      <div className={cn("sm-note sm-note-up", beat && "sm-beat")} data-kind="rankup">
        <p className="sm-up-title">緣分升階</p>
        <p className="sm-up-names">
          <span>{s.prevName}</span>
          <i aria-hidden>→</i>
          <strong>{s.levelName}</strong>
        </p>
        <p className="sm-up-gain">
          重逢化墨痕 <MoHen /> +{s.marks}
          {s.tierInk > 0 ? <> · 墨玉 +{s.tierInk}（已入帳）</> : null}
        </p>
        {s.unlocks.filter((u) => u.kind !== "ink").length ? (
          <ul className="sm-up-unlocks" aria-label="新解鎖">
            {s.unlocks
              .filter((u) => u.kind !== "ink")
              .map((u) => (
                <li key={u.label}>新 · {u.label}</li>
              ))}
          </ul>
        ) : null}
        <p className="sm-up-next">
          {s.nextName ? `再得 ${s.toNext} 張，即可進入${s.nextName}` : "緣分已至頂"}
        </p>
      </div>
    );
  }
  return (
    <div className="sm-note sm-note-dupe" data-kind="dupe">
      <span className="sm-tag">重逢</span>
      <span>
        重逢化墨痕 <MoHen /> +{s.marks}
      </span>
      <span className="sm-note-sub">
        緣分 {s.levelName} · 再 {s.toNext} 張進入{s.nextName}
      </span>
    </div>
  );
}

/* ───────────────────────── caption (name / dynasty / rarity) ───────────────────────── */

function Caption({ card, at }: { card: PullCard; at: number }) {
  const c = card.character;
  return (
    <div className="sm-caption" style={d(at)}>
      <span className={cn("sm-rarity", `sm-rarity-${c.rarity}`)}>{captionOf(c)}</span>
      <h2 className="sm-name">{c.name}</h2>
      <p className="sm-era">
        {c.era} · {c.epithet}
      </p>
    </div>
  );
}

/* ───────────────────────── shared opening ───────────────────────── */

const GATE_CLOSED = "/summon/gate-closed.webp";

const RARITY_ACCENT: Record<Rarity, string> = {
  R: "#d2d5db",
  S: "#b8d6c3",
  SS: "#dac296",
  SSR: "#dfc897",
};

const SSR_ACCENT: Record<string, string> = {
  qin: "#e4c781",
  zhouyu: "#a7dbdf",
  lanling: "#c4dbec",
  libai: "#eac5d6",
  liuche: "#efbb78",
};

function summonAccent(r: Rarity, id?: string): string {
  if (r === "SSR" && id && SSR_ACCENT[id]) return SSR_ACCENT[id];
  return RARITY_ACCENT[r];
}

const PALACE_MOTES = Array.from({ length: 22 }, (_, i) => ({
  x: `${(i * 37 + 11) % 92}%`,
  t: `${5 + (i % 5)}s`,
  d: `${-(i * 0.75)}s`,
}));

/** Palace door stage from the owner's 宮門牽緣 prototype. Same image is the frame and the two swinging leaves. */
export function PalaceGate({
  open = false,
  charging = false,
  accent,
  children,
}: {
  open?: boolean;
  charging?: boolean;
  accent?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="pg-frame"
      aria-hidden
      style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}
    >
      <div className={cn("pg-stage", open && "is-open", charging && "is-charging")}>
        <div className="pg-interior" />
        <div className="pg-scene" style={{ backgroundImage: `url(${GATE_CLOSED})` }} />
        <div className="pg-door pg-left" style={{ backgroundImage: `url(${GATE_CLOSED})` }} />
        <div className="pg-door pg-right" style={{ backgroundImage: `url(${GATE_CLOSED})` }} />
        <div className="pg-shade" />
        <div className="pg-motes">
          {PALACE_MOTES.map((m, i) => (
            <i key={i} style={{ "--x": m.x, "--t": m.t, "--d": m.d } as CSSProperties} />
          ))}
        </div>
        <div className="pg-veil" />
        {children}
      </div>
    </div>
  );
}

export function Opening({
  onTap,
  auto,
  lite = false,
}: {
  onTap: () => void;
  auto: boolean;
  lite?: boolean;
}) {
  const muted = useSave((s) => s.muted);
  const [charging, setCharging] = useState(false);
  const [dropping, setDropping] = useState(false);
  const gone = useRef(false);
  const timer = useRef(0);
  const go = () => {
    if (gone.current) return;
    gone.current = true;
    if (lite || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      timer.current = window.setTimeout(onTap, 100);
    } else setDropping(true);
  };
  const afterInk = () => {
    setDropping(false);
    setCharging(true);
    timer.current = window.setTimeout(onTap, 480);
  };
  useEffect(() => {
    sfxInkDrop(muted, 0.35);
    if (auto) timer.current = window.setTimeout(go, OPENING.dropMs + 250);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button type="button" className="sm-opening" onClick={go} aria-label={OPENING.prompt}>
      <PalaceGate charging={charging}>
        <div className="pg-head">
          千古遇
          <span>一筆牽緣 · 墨門逢君</span>
        </div>
        {!dropping ? <span className="pg-sigil">牽緣</span> : null}
        {dropping ? <SummonInkPrelude onDone={afterInk} /> : null}
        {charging || dropping ? null : <span className="pg-hint">{OPENING.prompt}</span>}
      </PalaceGate>
    </button>
  );
}

/* ───────────────────────── 十連 omen (rarity hint only, no character imagery) ───────────────────────── */

export function Omen({ top, onDone }: { top: Rarity; onDone: () => void }) {
  const muted = useSave((s) => s.muted);
  const o = OMEN[top];
  useEffect(() => {
    sfxInkDrop(muted, 0);
    if (top === "S") sfxPageTurn(muted, 0.6);
    if (top === "SS") sfxScroll(muted, 0.4);
    if (top === "SSR") {
      sfxGateHum(muted, 0.3);
      sfxLightBell(muted, 1.9);
    }
    const t = window.setTimeout(onDone, o.ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={cn("sm-omen", `sm-omen-${o.style}`)} data-top={top} aria-label={o.label}>
      <PalaceGate charging={top === "SSR"} accent={RARITY_ACCENT[top]} />
      <div className="sm-ink-bloom" style={d(150)} aria-hidden />
      {o.style === "book" ? (
        <div className="sm-book sm-book-omen" style={d(450)} aria-hidden>
          <span className="sm-page sm-page-l" />
          <span className="sm-page sm-page-r" />
          <span className="sm-leaf" style={d(800)} />
          <span className="sm-leaf" style={d(1100)} />
        </div>
      ) : null}
      {o.style === "scroll" ? <ScrollFrame unfurlAt={350} landscape={false} /> : null}
      <p className="sm-omen-label">{o.label}</p>
    </div>
  );
}

/* ───────────────────────── 10 ink seals → cards ───────────────────────── */

export function SealGrid({
  cards,
  flipped,
  onPick,
  pickable,
}: {
  cards: PullCard[];
  flipped: boolean[];
  onPick?: (index: number) => void;
  pickable: boolean;
}) {
  return (
    <ol className="sm-seals" aria-label="十枚墨印">
      {cards.map((card, i) => {
        const c = card.character;
        const s = settlementOf(card);
        const open = flipped[i];
        return (
          <li key={i} className={cn("sm-seal-slot", open && "is-open")} style={d(i * 70)}>
            <button
              type="button"
              className="sm-seal-btn"
              disabled={!pickable || !open}
              onClick={() => onPick?.(i)}
              aria-label={
                open
                  ? `${c.rarity} ${c.name} ${s.kind === "new" ? "初逢" : "重逢"}`
                  : `第 ${i + 1} 枚墨印`
              }
            >
              <span className="sm-seal-back" aria-hidden>
                <span>緣</span>
              </span>
              <span className={cn("sm-seal-face", `sm-face-${c.rarity}`)}>
                {open ? (
                  <>
                    <CardArt card={card} className="sm-thumb" />
                    <span className={cn("sm-rarity sm-rarity-mini", `sm-rarity-${c.rarity}`)}>
                      {c.rarity}
                    </span>
                    <span className="sm-thumb-name">{c.name}</span>
                    {s.kind === "new" ? <span className="sm-mark sm-mark-new">初逢</span> : null}
                    {s.kind === "rankup" ? <span className="sm-mark sm-mark-up">升階</span> : null}
                    {s.kind === "max" ? <span className="sm-mark sm-mark-max">圓滿</span> : null}
                  </>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────── reusable layers ───────────────────────── */

function ScrollFrame({ unfurlAt, landscape }: { unfurlAt: number; landscape: boolean }) {
  return (
    <div className="sm-scroll" style={d(unfurlAt)} aria-hidden>
      <div className="sm-scroll-paper">{landscape ? <Landscape /> : null}</div>
      <span className="sm-rod sm-rod-l" />
      <span className="sm-rod sm-rod-r" />
    </div>
  );
}

/** 水墨山河, drawn in SVG (no image asset needed). */
function Landscape({ tone = "paper" }: { tone?: "paper" | "night" }) {
  const ink =
    tone === "paper" ? ["#c9bfae", "#a2988a", "#6f675e"] : ["#2b2f38", "#1f232b", "#14161b"];
  return (
    <svg className="sm-land" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
      <g className="sm-land-back">
        <path
          d="M0 210 L40 150 L80 180 L130 110 L170 160 L210 120 L260 170 L300 100 L350 150 L400 120 L400 300 L0 300Z"
          fill={ink[0]}
          opacity="0.55"
        />
      </g>
      <g className="sm-land-mid">
        <path
          d="M0 240 L60 190 L110 220 L170 170 L230 225 L290 180 L350 215 L400 190 L400 300 L0 300Z"
          fill={ink[1]}
          opacity="0.6"
        />
      </g>
      <g className="sm-land-front">
        <path
          d="M0 270 L70 240 L140 262 L220 235 L300 265 L400 245 L400 300 L0 300Z"
          fill={ink[2]}
          opacity="0.7"
        />
      </g>
    </svg>
  );
}

/* ───────────────────────── SSR exclusive scenes (CSS only; never the wrong person) ───────────────────────── */

function SsrSceneLayer({ scene, at }: { scene: SsrScene; at: number }) {
  const n = (k: number) => Array.from({ length: k }, (_, i) => i);
  return (
    <div className={cn("sm-scene", `sm-scene-${scene}`)} style={d(at)} aria-hidden>
      {scene === "palace" ? (
        <>
          <span className="sc-pillars" />
          <span className="sc-door sc-door-l" style={d(at + 500)} />
          <span className="sc-door sc-door-r" style={d(at + 500)} />
          <span className="sc-lamp" style={d(at + 150)} />
        </>
      ) : null}
      {scene === "river" ? (
        <>
          {n(4).map((i) => (
            <span key={i} className="sc-ripple" style={d(at + 150 + i * 380)} />
          ))}
          <span className="sc-strings">
            {n(7).map((i) => (
              <i key={i} style={d(at + 250 + i * 60)} />
            ))}
          </span>
          <span className="sc-mist sc-mist-l" style={d(at + 400)} />
          <span className="sc-mist sc-mist-r" style={d(at + 400)} />
        </>
      ) : null}
      {scene === "snowgate" ? (
        <>
          <span className="sc-citygate" />
          <svg className="sc-mask" viewBox="0 0 100 120" style={d(at + 500)}>
            <path
              d="M50 4 C82 4 94 30 92 62 C90 92 72 116 50 116 C28 116 10 92 8 62 C6 30 18 4 50 4Z M28 52 Q36 44 44 52 Q36 58 28 52Z M56 52 Q64 44 72 52 Q64 58 56 52Z"
              fillRule="evenodd"
            />
          </svg>
          <span className="sc-snow">
            {n(22).map((i) => (
              <i
                key={i}
                style={{
                  ...d(at + (i % 7) * 90),
                  ["--x" as string]: `${(i * 37) % 100}%`,
                  ["--s" as string]: `${2 + (i % 3)}px`,
                }}
              />
            ))}
          </span>
        </>
      ) : null}
      {scene === "moon" ? (
        <>
          <span className="sc-moon" style={d(at + 100)} />
          <Landscape tone="night" />
          <span className="sc-water" />
          <span className="sc-moon-reflect" style={d(at + 300)} />
          <span className="sc-petals">
            {n(12).map((i) => (
              <i
                key={i}
                style={{ ...d(at + 200 + i * 110), ["--x" as string]: `${(i * 29) % 90}%` }}
              />
            ))}
          </span>
        </>
      ) : null}
      {scene === "dawngate" ? (
        <>
          <span className="sc-vdoor sc-vdoor-l" />
          <span className="sc-vdoor sc-vdoor-r" />
          <span className="sc-dawn" style={d(at + 200)} />
          <span className="sc-banners">
            {n(4).map((i) => (
              <i
                key={i}
                style={{ ...d(at + 300 + i * 160), ["--x" as string]: `${8 + i * 24}%` }}
              />
            ))}
          </span>
        </>
      ) : null}
    </div>
  );
}

/* ───────────────────────── one card's full performance ───────────────────────── */

export type PerformanceProps = (
  | { card: PullCard; artifact?: never }
  | { card?: never; artifact: { def: ArtifactDef; isNew: boolean; essence?: number } }
) & {
  /** false inside a 十連 / replay: the ink-drop beat is not replayed. */
  withDrop: boolean;
  /** 精簡動畫 / reduced motion: short fade, then the card. */
  lite: boolean;
  /** Fires once when the character is fully visible (or immediately when skipped). */
  onRevealed?: () => void;
  /** Bumping this jumps straight to the revealed state (略過此張). */
  skipSignal: number;
  footer: ReactNode;
};

/** ms to subtract when there is no ink-drop beat (十連 close-ups / replays). */
const DROP_CUT: Record<Rarity, number> = { R: 300, S: 350, SS: 350, SSR: 420 };

export function Performance({
  card,
  artifact,
  withDrop,
  lite,
  onRevealed,
  skipSignal,
  footer,
}: PerformanceProps) {
  const c = card?.character;
  const r = artifact?.def.rarity ?? c!.rarity;
  const muted = useSave((s) => s.muted);
  const cut = withDrop ? 0 : DROP_CUT[r];
  const B = BEATS[r];
  const revealAt = lite ? OPENING.liteMs : B.revealAt - cut;
  const [skipped, setSkipped] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const firstSkip = useRef(skipSignal);
  const line = artifact
    ? { text: artifact.def.lore.replace(/[「」]/g, ""), voiced: false }
    : revealLine(c!);
  const scene = r === "SSR" ? ssrScene(artifact ? "artifact" : c!.id) : null;
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;

  // timeline: SFX are all scheduled up front through one bus, so leaving / skipping cuts them at once.
  useEffect(() => {
    if (lite) {
      sfxReveal(r, muted, 0.1);
    } else {
      const s = (ms: number) => Math.max(0, ms - cut) / 1000;
      if (withDrop) sfxInkDrop(muted, 0.32);
      if (r === "R") {
        /* a single, short ink drop — nothing more */
        if (!withDrop) sfxInkDrop(muted, 0);
      } else if (r === "S") {
        const b = BEATS.S;
        sfxPageTurn(muted, s(b.turn1));
        sfxPageTurn(muted, s(b.turn2));
        sfxBrush(muted, s(b.flow));
        sfxLightBell(muted, s(b.revealAt - 150));
      } else if (r === "SS") {
        const b = BEATS.SS;
        sfxScroll(muted, s(b.unfurl));
        sfxReveal("SS", muted, s(b.revealAt - 200));
      } else {
        const b = BEATS.SSR;
        sfxGateHum(muted, s(b.lines));
        sfxGateOpen(muted, s(b.open));
        if (scene) sfxScene(scene, muted, s(b.scene));
        sfxReveal("SSR", muted, s(b.revealAt - 250));
      }
    }
    const t = window.setTimeout(() => setRevealed(true), revealAt);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SS: the existing Japanese 情話 VO is exactly this line (Character.line) — play it only then.
  // SSR summon lines are new text with no VO: never voiced.
  useEffect(() => {
    if (artifact || !c || r !== "SS" || !line?.voiced || lite || muted) return;
    if (!voiceSrc(c.id, "line")) return;
    preloadVoice(c.id, "line");
    const t = window.setTimeout(
      () => playVoice(c.id, line.text, useSave.getState().muted, "line"),
      Math.max(0, BEATS.SS.line - cut),
    );
    return () => {
      window.clearTimeout(t);
      stopVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (muted) stopVoice();
  }, [muted]);

  useEffect(() => {
    if (skipSignal === firstSkip.current) return;
    setSkipped(true);
    setRevealed(true);
    stopVoice();
  }, [skipSignal]);

  useEffect(() => {
    if (revealed) {
      onRevealedRef.current?.();
      if (card?.bondUp) sfxRankUp(useSave.getState().muted, 0.5);
    }
  }, [revealed, card?.bondUp]);

  const style = REVEAL_RARITY[r].style;
  const mode = lite ? "lite" : skipped ? "skipped" : "play";
  const at = (ms: number) => ms - cut;

  return (
    <div
      className={cn(
        "sm-perf",
        `sm-perf-${style}`,
        `sm-mode-${mode}`,
        revealed && "is-revealed",
        scene && `sm-perf-scene-${scene}`,
      )}
      data-rarity={r}
      data-testid="summon-performance"
    >
      <PalaceGate
        open={r === "SSR" && (revealed || mode !== "play")}
        charging={mode === "play" && !revealed}
        accent={summonAccent(r, c?.id)}
      />
      {/* ── stage layers (decor only; palace doors replace the old circular ink-gate) ── */}
      {mode === "play" ? (
        <div className="sm-layers" aria-hidden>
          {r === "SSR" && scene && scene !== "palace" ? (
            <SsrSceneLayer scene={scene} at={at(BEATS.SSR.scene)} />
          ) : null}
          {r === "SSR" ? (
            <>
              <span className="sm-fog sm-fog-l" style={d(at(BEATS.SSR.fog))} />
              <span className="sm-fog sm-fog-r" style={d(at(BEATS.SSR.fog))} />
            </>
          ) : null}
          {line && (r === "SS" || r === "SSR") ? (
            <p
              className={cn("sm-line", `sm-line-${r}`)}
              style={{
                ...d(at(r === "SS" ? BEATS.SS.line : BEATS.SSR.line)),
                ["--hold" as string]: `${r === "SS" ? BEATS.SS.card - BEATS.SS.line - 250 : BEATS.SSR.fog - BEATS.SSR.line - 150}ms`,
              }}
            >
              「{line.text}」
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── the card: reserved box, full art (object-fit: contain, never cropped) ── */}
      <div className="sm-card-col">
        <div
          className="sm-card-wrap"
          style={d(lite ? 0 : at(r === "SSR" ? BEATS.SSR.fog : BEATS[r].card))}
        >
          {artifact ? (
            <img
              className="sm-card mq-reveal-art"
              src={artifactImage(artifact.def)}
              alt={artifact.def.name}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = ARTIFACT_PLACEHOLDER;
              }}
            />
          ) : (
            <CardArt card={card!} className="sm-card" />
          )}
          {r === "SSR" && scene === "dawngate" ? <span className="sm-warm" aria-hidden /> : null}
          <span
            className={cn("sm-first-seal", !(artifact?.isNew ?? card!.isNew) && "is-return")}
            style={d(lite || skipped ? 0 : revealAt + 250)}
          >
            {artifact ? (artifact.isNew ? "初獲" : "再獲") : card!.isNew ? "初逢" : "重逢"}
          </span>
        </div>
        {artifact ? (
          <div className="mq-reveal-caption" style={d(lite || skipped ? 0 : B.captionAt - cut)}>
            <p>{r}・命器</p>
            <h2>{artifact.def.name}</h2>
          </div>
        ) : (
          <Caption card={card!} at={lite || skipped ? 0 : B.captionAt - cut} />
        )}
        {revealed && line && (r === "SS" || r === "SSR") ? (
          <p className="sm-subline">「{line.text}」</p>
        ) : null}
        {revealed ? (
          artifact ? (
            <p className="sm-subline">
              {artifact.isNew
                ? "新命器已收入命器庫"
                : artifact.essence
                  ? `重複命器・已轉為 ${artifact.essence} 份命器精華`
                  : "重複命器・已保留為獨立實體"}
            </p>
          ) : (
            <SettleNote card={card!} />
          )
        ) : (
          <div className="sm-note-space" />
        )}
        {!artifact && r === "SSR" && SSR_SUMMON[c!.id] === undefined ? (
          <p className="sm-hint">（此 SSR 尚無專屬場景，使用通用墨門）</p>
        ) : null}
        <div className="sm-foot">{footer}</div>
      </div>
    </div>
  );
}

export function PrefToggle({
  label,
  on,
  onChange,
  disabled,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={cn("sm-pref", on && "is-on")}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
    >
      <span className="sm-pref-dot" aria-hidden />
      {label}
    </button>
  );
}
