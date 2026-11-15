/**
 * 召喚揭曉「一筆牽緣，墨門逢君」— the whole overlay: opening → (十連 omen → 墨印) → performances → 結果.
 *
 * The cards passed in are ALREADY settled and persisted by store.pull() before this mounts. Nothing here
 * grants, re-rolls or recomputes a reward; skipping / replaying / closing only changes what is on screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Character } from "@/game/data";
import type { PullCard } from "@/game/logic";
import { stopVoice } from "@/game/audio";
import { useSave } from "@/game/store";
import {
  OPENING,
  REVEAL_RARITY,
  highestRarity,
  markSummonWatched,
  readPrefs,
  revealMode,
  settlementOf,
  writePrefs,
  type SummonPrefs,
} from "@/game/summon-reveal";
import { sfxFast, sfxRankUp, stopSummonSfx } from "@/game/summon-sfx";
import { Omen, Opening, Performance, PrefToggle, SealGrid } from "@/components/game/SummonStage";
import { SummonResults } from "@/components/game/SummonResults";
import { cn } from "@/components/game/bits";

type Phase =
  | { k: "opening" }
  | { k: "omen" }
  | { k: "seals" }
  | { k: "show"; index: number; replay: boolean }
  | { k: "results" };

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

export function SummonReveal({
  cards,
  n,
  demo = false,
  startAtResults = false,
  saveNote = null,
  onClose,
  onAgain,
  onOpenCodex,
}: {
  cards: PullCard[];
  n: 1 | 10;
  /** Dev preview with test data: nothing is saved or marked. */
  demo?: boolean;
  /** Re-entering an interrupted summon: go straight to its result page. */
  startAtResults?: boolean;
  saveNote?: string | null;
  onClose: () => void;
  onAgain: (n: 1 | 10) => void;
  onOpenCodex: (character: Character) => void;
}) {
  const ten = n === 10 && cards.length > 1;
  const [prefs, setPrefsState] = useState<SummonPrefs>(() => readPrefs());
  const setPrefs = (p: SummonPrefs) => {
    setPrefsState(p);
    writePrefs(p);
  };
  const reduce = useReducedMotion();
  const lite = prefs.lite || reduce;
  const [phase, setPhase] = useState<Phase>(() => (startAtResults ? { k: "results" } : { k: "opening" }));
  const [flipped, setFlipped] = useState<boolean[]>(() => cards.map(() => startAtResults));
  const [skipSignal, setSkipSignal] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [beat, setBeat] = useState<PullCard | null>(null);
  const top = useMemo(() => highestRarity(cards), [cards]);
  const timers = useRef<number[]>([]);
  const muted = useSave((s) => s.muted);
  const queue = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  // leaving the animation (unmount / results / background) stops every summon cue and voice
  useEffect(
    () => () => {
      clearTimers();
      stopSummonSfx();
      stopVoice();
    },
    [],
  );
  useEffect(() => {
    if (muted) {
      stopSummonSfx();
      stopVoice();
    }
  }, [muted]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        stopSummonSfx();
        stopVoice();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const toResults = useCallback(() => {
    clearTimers();
    stopSummonSfx();
    stopVoice();
    setBeat(null);
    setFlipped(cards.map(() => true));
    setPhase({ k: "results" });
  }, [cards]);

  useEffect(() => {
    if (phase.k === "results" && !demo) markSummonWatched();
  }, [phase.k, demo]);

  /* ── 十連 sequencing ── */
  const flip = (i: number) => setFlipped((f) => f.map((v, j) => (j === i ? true : v)));

  const runNext = () => {
    const i = queue.current.shift();
    if (i === undefined) {
      later(toResults, lite ? 300 : 900);
      return;
    }
    const card = cards[i]!;
    if (!lite && revealMode(card, true) === "full") {
      setRevealed(false);
      setPhase({ k: "show", index: i, replay: false });
      return;
    }
    flip(i);
    sfxFast(card.character.rarity, useSave.getState().muted);
    const fast = lite ? 120 : REVEAL_RARITY[card.character.rarity].fastMs;
    if (card.bondUp && !lite) {
      later(() => {
        setBeat(card);
        sfxRankUp(useSave.getState().muted);
      }, fast);
      later(() => {
        setBeat(null);
        runNext();
      }, fast + 1500);
    } else later(runNext, fast);
  };

  const modeRef = useRef<"each" | "all">("each");
  const startEach = () => {
    clearTimers();
    modeRef.current = "each";
    setAwaiting(false);
    queue.current = cards.map((_, i) => i);
    setPhase({ k: "seals" });
    runNext();
  };
  const startAll = () => {
    clearTimers();
    modeRef.current = "all";
    setAwaiting(false);
    setFlipped(cards.map(() => true));
    // 全部揭曉: all ten face up at once; SSR 專屬演出 still play (each skippable), in draw order.
    queue.current = lite ? [] : cards.flatMap((c, i) => (c.character.rarity === "SSR" ? [i] : []));
    later(() => {
      const i = queue.current.shift();
      if (i === undefined) return toResults();
      setRevealed(false);
      setPhase({ k: "show", index: i, replay: false });
    }, 1100);
  };

  const afterOpening = () => {
    if (!ten) {
      setRevealed(false);
      setPhase({ k: "show", index: 0, replay: false });
      return;
    }
    if (lite) {
      setFlipped(cards.map(() => true));
      setPhase({ k: "seals" });
      later(toResults, 700);
      return;
    }
    setPhase({ k: "omen" });
  };

  const afterOmen = () => {
    setPhase({ k: "seals" });
    if (prefs.autoPlay) later(() => (prefs.tenMode === "all" ? startAll() : startEach()), 900);
  };

  const [awaiting, setAwaiting] = useState(true); // seals laid out, waiting for 逐一 / 全部
  useEffect(() => {
    if (phase.k === "omen") setAwaiting(true);
  }, [phase.k]);

  /** Finished looking at one close-up (tap 繼續 / auto after hold). */
  const nextFromShow = () => {
    if (phase.k !== "show") return;
    stopVoice();
    stopSummonSfx();
    if (phase.replay) {
      setPhase({ k: "results" });
      return;
    }
    if (!ten) return toResults();
    flip(phase.index);
    setPhase({ k: "seals" });
    if (modeRef.current === "all") {
      const i = queue.current.shift();
      if (i === undefined) return later(toResults, 500);
      setRevealed(false);
      setPhase({ k: "show", index: i, replay: false });
      return;
    }
    later(runNext, 250);
  };

  // SS close-ups in 自動播放 move on by themselves after a hold; SSR always waits for a tap.
  useEffect(() => {
    if (phase.k !== "show" || !revealed || phase.replay) return;
    const card = cards[phase.index]!;
    if (!prefs.autoPlay || card.character.rarity === "SSR") return;
    const id = window.setTimeout(nextFromShow, card.bondUp ? 3200 : 2000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealed, prefs.autoPlay]);

  /* ── render ── */
  const showing = phase.k === "show" ? cards[phase.index] : null;

  if (phase.k === "results") {
    return (
      <SummonResults
        cards={cards}
        demo={demo}
        saveNote={saveNote}
        prefs={prefs}
        reduce={reduce}
        onPrefs={setPrefs}
        onClose={onClose}
        onAgain={onAgain}
        onOpenCodex={onOpenCodex}
        onReplay={(i) => {
          setRevealed(false);
          setSkipSignal(0);
          setPhase({ k: "show", index: i, replay: true });
        }}
      />
    );
  }

  const skipOneLabel = "略過此張";
  const skipAllLabel = ten ? "略過全部" : "略過動畫";

  return (
    <div
      className={cn("sm-overlay", lite && "sm-lite", `sm-top-${top}`, "sm-overlay-gate")}
      role="dialog"
      aria-modal="true"
      aria-label="召喚 · 一筆牽緣，墨門逢君"
      data-phase={phase.k}
    >
      {demo ? <p className="sm-demo-badge">演出預覽 · 測試資料（不寫入存檔）</p> : null}

      {phase.k === "opening" ? (
        lite ? (
          <LiteOpening onDone={afterOpening} />
        ) : (
          <Opening onTap={afterOpening} auto={prefs.autoPlay} />
        )
      ) : null}

      {phase.k === "omen" ? <Omen top={top} onDone={afterOmen} /> : null}

      {phase.k === "seals" || (phase.k === "show" && ten && !phase.replay) ? (
        <div className={cn("sm-seal-stage", phase.k === "show" && "is-behind")}>
          <SealGrid cards={cards} flipped={flipped} pickable={false} />
          {phase.k === "seals" && awaiting && !lite ? (
            <div className="sm-ten-choice">
              <button
                type="button"
                className="sm-btn sm-btn-primary"
                onClick={() => {
                  setPrefs({ ...prefs, tenMode: "each" });
                  startEach();
                }}
              >
                逐一揭曉
              </button>
              <button
                type="button"
                className="sm-btn"
                onClick={() => {
                  setPrefs({ ...prefs, tenMode: "all" });
                  startAll();
                }}
              >
                全部揭曉
              </button>
            </div>
          ) : null}
          {beat ? <RankBeat card={beat} /> : null}
        </div>
      ) : null}

      {showing && phase.k === "show" ? (
        <Performance
          key={`${phase.index}-${phase.replay ? "r" : "p"}`}
          card={showing}
          withDrop={!ten && !phase.replay}
          lite={lite}
          skipSignal={skipSignal}
          onRevealed={() => setRevealed(true)}
          footer={
            revealed ? (
              <button type="button" className="sm-btn sm-btn-primary sm-continue" onClick={nextFromShow} autoFocus>
                {phase.replay ? "回到結果" : !ten ? "收下此緣" : queue.current.length > 0 ? "下一位" : "查看全部"}
              </button>
            ) : null
          }
        />
      ) : null}

      {/* persistent skip controls (top, inside the safe area; never over the card face) */}
      {(phase.k !== "opening" || !lite) && !(phase.k === "show" && revealed && (!ten || phase.replay)) ? (
        <div className="sm-skipbar">
          {phase.k === "show" && !revealed ? (
            ten || phase.replay ? (
              <button type="button" className="sm-btn sm-btn-ghost" onClick={() => setSkipSignal((x) => x + 1)}>
                {phase.replay ? "略過特寫" : skipOneLabel}
              </button>
            ) : null
          ) : null}
          {phase.k === "show" && phase.replay ? null : (
            <button
              type="button"
              className="sm-btn sm-btn-ghost"
              data-testid="summon-skip-all"
              onClick={() => {
                if (phase.k === "show" && !ten && !revealed) {
                  // single pull: 略過演出 → straight to the result page
                  return toResults();
                }
                toResults();
              }}
            >
              {skipAllLabel}
            </button>
          )}
        </div>
      ) : null}

      {phase.k === "opening" && !lite ? (
        <div className="sm-prefbar">
          <PrefToggle label="自動播放" on={prefs.autoPlay} onChange={(v) => setPrefs({ ...prefs, autoPlay: v })} />
          <PrefToggle label="精簡動畫" on={prefs.lite} onChange={(v) => setPrefs({ ...prefs, lite: v })} />
        </div>
      ) : null}
    </div>
  );
}

function LiteOpening({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, OPENING.liteMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="sm-lite-fade" aria-hidden />;
}

function RankBeat({ card }: { card: PullCard }) {
  const s = settlementOf(card);
  return (
    <div className="sm-rankbeat" role="status">
      <p className="sm-up-title">緣分升階 · {card.character.name}</p>
      <p className="sm-up-names">
        <span>{s.prevName}</span>
        <i aria-hidden>→</i>
        <strong>{s.levelName}</strong>
      </p>
      <p className="sm-up-gain">
        {s.unlocks
          .filter((u) => u.kind !== "ink")
          .map((u) => u.label)
          .join("、") || "緣分更深一層"}
        {s.tierInk > 0 ? ` · 墨玉 +${s.tierInk}（已入帳）` : ""}
      </p>
    </div>
  );
}

