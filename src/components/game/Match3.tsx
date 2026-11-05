import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Lock, Star } from "lucide-react";
import { cn, MoYu, Portrait, RarityMark } from "@/components/game/bits";
import { BY_ID, CHARACTERS, type Character } from "@/game/data";
import { RANK } from "@/game/logic";
import { NO_FX, STEP_NAMES, describeFx, rewardBonus, skillFx, skillOf, skillStep, type AssistFx, type Skill } from "@/game/skills";
import {
  NO_ASSIST,
  activateSkill,
  activationLabels,
  canActivate,
  chargeCost,
  resolveAssist,
  waveEnergy,
} from "@/game/assist";
import { BrushLine, brushWriteMs, loadBrushFont } from "@/components/game/Cinematic";
import { playAssist, playBonusDone, playJadeClear, playJadeMiss, playJadeTap, playMoveBonus, playVoice, playWaveSound, preloadVoice, stopVoice } from "@/game/audio";
import { holdForVoice, type VoiceHandle } from "@/game/voice-timing";
import { useSave } from "@/game/store";
import {
  allMoves,
  near,
  trySwap,
  type Board,
  type Effect,
  type Piece,
  type Pos,
  type SwapResult,
  type Wave,
} from "@/game/match3";
import {
  CHAPTERS,
  isChapterFinale,
  JADE_NAMES,
  LEVELS,
  MAX_STARS,
  REPLAY_INK,
  VOLUME_AWARD_INK,
  finalScore,
  goalStatus,
  goalsMet,
  isUnlocked,
  moveBonus,
  moveBonusPer,
  rewardPerStar,
  startBoard,
  startProgress,
  readyVolumes,
  starsFor,
  totalStars,
  volumeStars,
  type Goal,
  type LevelDef,
  type Progress,
} from "@/game/levels";

const JADE_SRC = [
  "/jade/jade-0-qing@2x.webp",
  "/jade/jade-1-bai@2x.webp",
  "/jade/jade-2-huang@2x.webp",
  "/jade/jade-3-mo@2x.webp",
  "/jade/jade-4-zi@2x.webp",
  "/jade/jade-5-hong@2x.webp",
] as const;

const SPECIAL_NAME = { row: "橫刻玉", col: "縱刻玉", bomb: "金鑲玉", color: "龍珠" } as const;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
const posKey = (p: Pos) => `${p.r},${p.c}`;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type View = { kind: "map" } | { kind: "level"; id: number; run: number };

/** 三消: the level map and the 50 levels (five 卷). (閒弈 endless mode, which paid score 1:1 in 墨玉, was removed.) */
export function Match3({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "map" });
  const def = view.kind === "level" ? LEVELS.find((l) => l.id === view.id) : undefined;
  return (
    <div
      className="ink-overlay m3-screen fixed inset-0 z-40 flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="三消闖關"
    >
      {view.kind === "level" && def ? (
        <Game
          key={view.run}
          def={def}
          onMap={() => setView({ kind: "map" })}
          onPlay={(id) => setView(LEVELS.some((l) => l.id === id) ? { kind: "level", id, run: Date.now() } : { kind: "map" })}
        />
      ) : (
        <LevelMap onClose={onClose} onPick={(id) => setView({ kind: "level", id, run: Date.now() })} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ map */

function LevelMap({ onClose, onPick }: { onClose: () => void; onPick: (id: number) => void }) {
  const progress = useSave((s) => s.m3);
  const claimed = useSave((s) => s.volumeAwards);
  const stars = totalStars(progress);
  // 成就 · 卷滿 popup: opens by itself for the first full, unpaid 卷 whenever the map shows (e.g. back from
  // the level that completed it). 稍後 skips that 卷 until the map reopens; the header badge reopens it.
  const [skipped, setSkipped] = useState<number[]>([]);
  const [award, setAward] = useState<{ volume: number; paid: boolean } | null>(() => {
    const v = readyVolumes(progress, claimed)[0];
    return v ? { volume: v, paid: false } : null;
  });
  const nextAward = (skip: number[]) => {
    const v = readyVolumes(useSave.getState().m3, useSave.getState().volumeAwards).find((x) => !skip.includes(x));
    setAward(v ? { volume: v, paid: false } : null);
  };
  const current = LEVELS.find((l) => isUnlocked(l.id, progress) && !(progress[String(l.id)]?.stars ?? 0))?.id ?? null;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!current) return;
    const node = scroller.current?.querySelector<HTMLElement>(`[data-level="${current}"]`);
    if (node && scroller.current) {
      const top = node.offsetTop - scroller.current.clientHeight / 2;
      if (top > 0) scroller.current.scrollTop = top;
    }
  }, [current]);

  return (
    <>
      <div className="ink-bar safe-top flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="ink-title font-serif text-xl">三消 · 闖關</p>
          <p className="text-xs text-muted">首次過關依星數換墨玉</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="m3-star-count flex items-center gap-1 rounded-full px-3 py-1 text-sm tabular-nums" data-stars={stars}>
            <Star className="h-4 w-4 fill-current" aria-hidden />
            {stars}/{MAX_STARS}
          </span>
          <button type="button" className="ink-ghost min-h-11 rounded-full px-4 text-sm" onClick={onClose}>
            離開
          </button>
        </div>
      </div>
      <div ref={scroller} className="m3-map scroll-area flex-1 overflow-y-auto px-4 pb-8" data-testid="m3-map">
        {CHAPTERS.map((chapter, ci) => {
          const levels = LEVELS.filter((l) => l.id >= chapter.from && l.id <= chapter.to);
          const volume = ci + 1;
          const { got, max } = volumeStars(progress, volume);
          return (
            <section key={chapter.name} className={cn("m3-chapter mt-5 rounded-2xl px-3 pb-4 pt-3", `m3-chapter-${ci}`)}>
              <header className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-serif text-lg tracking-[0.2em]">{chapter.name}</h3>
                <span className="text-xs tabular-nums text-muted">
                  ★ {got}/{max}
                </span>
              </header>
              <VolumeAward
                volume={volume}
                got={got}
                max={max}
                claimed={claimed.includes(volume)}
                onClaim={() => setAward({ volume, paid: false })}
              />
              <ol className="m3-path grid grid-cols-5 gap-y-5">
                {levels.map((l, i) => {
                  const row = Math.floor(i / 5);
                  const col = row % 2 === 0 ? i % 5 : 4 - (i % 5);
                  const rec = progress[String(l.id)];
                  const open = isUnlocked(l.id, progress);
                  const state = rec?.stars ? "cleared" : open ? "open" : "locked";
                  return (
                    <li key={l.id} className="flex justify-center" style={{ gridRow: row + 1, gridColumn: col + 1 }}>
                      <button
                        type="button"
                        disabled={!open}
                        data-level={l.id}
                        data-state={state}
                        data-finale={isChapterFinale(l.id) || undefined}
                        className={cn("m3-node", `m3-node-${state}`, current === l.id && "m3-node-current", isChapterFinale(l.id) && "m3-node-boss")}
                        onClick={() => onPick(l.id)}
                        aria-label={`第 ${l.id} 關${isChapterFinale(l.id) ? "（章末關）" : ""}${state === "locked" ? "（未解鎖）" : rec?.stars ? `，${rec.stars} 星` : ""}`}
                      >
                        <span className="m3-node-disc">
                          {state === "locked" ? <Lock className="h-4 w-4" aria-hidden /> : <span className="font-serif">{l.id}</span>}
                          {l.goals.some((g) => g.type === "seal") && state !== "locked" ? <span className="m3-node-seal" aria-hidden /> : null}
                          {isChapterFinale(l.id) ? <span className="m3-node-boss-tag" aria-hidden>章末</span> : null}
                        </span>
                        <span className="m3-node-stars" aria-hidden>
                          {[1, 2, 3].map((n) => (
                            <i key={n} className={cn((rec?.stars ?? 0) >= n && "on")}>★</i>
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
      {award ? (
        <VolumeAwardPopup
          key={award.volume}
          volume={award.volume}
          paid={award.paid}
          onClaim={() => {
            const paid = useSave.getState().claimVolumeAward(award.volume);
            if (paid > 0) playBonusDone(useSave.getState().muted);
            if (paid > 0) setAward({ volume: award.volume, paid: true });
            else nextAward(skipped);
          }}
          onClose={() => {
            const skip = award.paid ? skipped : [...skipped, award.volume];
            setSkipped(skip);
            nextAward(skip);
          }}
        />
      ) : null}
    </>
  );
}

/** 成就 · 卷滿: a 卷's progress toward its one-time 2000 墨玉, under the 卷 header. */
function VolumeAward({ volume, got, max, claimed, onClaim }: { volume: number; got: number; max: number; claimed: boolean; onClaim: () => void }) {
  const ready = !claimed && max > 0 && got >= max;
  const pct = max > 0 ? Math.min(100, (got / max) * 100) : 0;
  return (
    <div
      className={cn("m3-achieve mb-4 flex items-center gap-3 rounded-xl px-2.5 py-2", ready && "m3-achieve-ready", claimed && "m3-achieve-done")}
      data-testid="m3-achieve"
      data-volume={volume}
      data-got={got}
      data-state={claimed ? "claimed" : ready ? "ready" : "progress"}
    >
      <span className="m3-achieve-seal grid h-9 w-9 shrink-0 place-items-center rounded-full" aria-hidden>
        <MoYu className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-xs">
          <span className="text-[0.6rem] tracking-[0.3em] text-gold">成就</span>
          <span className="truncate tracking-[0.06em]">
            集滿 {max}★ 得 {VOLUME_AWARD_INK} 墨玉
          </span>
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="m3-achieve-bar h-[3px] flex-1 overflow-hidden rounded-full">
            <div className="h-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[0.7rem] tabular-nums text-muted">
            {got}/{max}
          </span>
        </div>
      </div>
      {claimed ? (
        <span className="shrink-0 text-xs tracking-[0.2em] text-muted">已領</span>
      ) : ready ? (
        <button type="button" className="m3-achieve-claim min-h-10 shrink-0 rounded-full px-4 text-sm" onClick={onClaim} data-testid="m3-achieve-claim">
          領取
        </button>
      ) : null}
    </div>
  );
}

function VolumeAwardPopup({ volume, paid, onClaim, onClose }: { volume: number; paid: boolean; onClaim: () => void; onClose: () => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  const chapter = CHAPTERS[volume - 1];
  const max = chapter ? (chapter.to - chapter.from + 1) * 3 : 0;
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, paid]);
  return (
    <div className="m3-modal fixed inset-0 z-50 grid place-items-center p-5" data-testid="m3-achieve-popup" data-volume={volume} data-paid={paid ? "1" : "0"} onClick={onClose}>
      <div
        className="m3-card m3-card-win m3-achieve-card relative w-full max-w-xs overflow-hidden rounded-2xl p-6 text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="m3-achieve-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="m3-achieve-rays" aria-hidden />
        <p className="relative text-xs tracking-[0.4em] text-gold">成就達成</p>
        <h2 id="m3-achieve-title" className="m3-result-title relative mt-2 font-serif text-2xl tracking-[0.2em]">
          {chapter?.name ?? "卷"} · 卷滿
        </h2>
        <p className="relative mt-2 flex items-center justify-center gap-1 text-sm tabular-nums text-muted">
          <Star className="h-4 w-4 fill-current text-gold" aria-hidden /> {max}/{max} · 本卷盡數三星
        </p>
        <p className="m3-reward relative mt-5 flex items-center justify-center gap-2 text-3xl">
          <MoYu label className="h-10 w-10" /> +{VOLUME_AWARD_INK}
        </p>
        <p className="relative mt-1 h-4 text-xs text-muted">{paid ? "已收入墨池" : "每卷僅此一次"}</p>
        {paid ? (
          <button ref={primary} type="button" className="relative mt-5 min-h-11 w-full rounded-xl bg-gold" onClick={onClose} data-testid="m3-achieve-ok">
            好
          </button>
        ) : (
          <div className="relative mt-5 grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" className="ink-ghost min-h-11 rounded-xl text-sm" onClick={onClose}>
              稍後
            </button>
            <button ref={primary} type="button" className="min-h-11 rounded-xl bg-gold" onClick={onClaim} data-testid="m3-achieve-take">
              領取 {VOLUME_AWARD_INK} 墨玉
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- game */

type Nudge = { from: Pos; to: Pos; on: boolean };
type Float = { id: number; r: number; c: number; text: string; big?: boolean };
/** A level's end. `left` = moves still unused when the goals were met (assist +步 included); each is worth `per`. */
type Result = {
  won: boolean;
  score: number;
  left: number;
  per: number;
  bonus: number;
  final: number;
  stars: number;
  reward: number;
  prevStars: number;
  prevBest: number;
};

let floatSerial = 0;

function Game({
  def,
  onMap,
  onPlay,
}: {
  def: LevelDef;
  onMap: () => void;
  onPlay: (id: number) => void;
}) {
  const start = useMemo(
    () => startBoard(def),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { rows, cols } = start;
  const [board, setBoard] = useState<Board>(start);
  const [moves, setMoves] = useState(def.moves);
  const [progress, setProgress] = useState<Progress>(() => startProgress(start));
  const [phase, setPhase] = useState<"intro" | "play" | "busy" | "done">("intro");
  const [picked, setPicked] = useState<Pos | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [pop, setPop] = useState<Map<number, number>>(new Map());
  const [forge, setForge] = useState<Map<number, Piece>>(new Map());
  const [cracks, setCracks] = useState<Set<string>>(new Set());
  const [fx, setFx] = useState<{ key: number; effects: Effect[]; shatter: Pos[] } | null>(null);
  const [drop, setDrop] = useState<{ map: Map<number, number>; live: boolean }>({ map: new Map(), live: true });
  const [floats, setFloats] = useState<Float[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [hint, setHint] = useState<[Pos, Pos] | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const muted = useSave((s) => s.muted);
  useEffect(() => {
    if (muted) stopVoice();
  }, [muted]);
  const record = useSave((s) => s.m3[String(def.id)]);
  const clearLevel = useSave((s) => s.clearLevel);
  // 助陣: the picked (or strongest owned) character; their skill charges from clears.
  const chosen = useSave((s) => s.assist);
  const owned = useSave((s) => s.owned);
  const helperId = resolveAssist(chosen, owned, CHARACTERS);
  const helper = helperId ? BY_ID[helperId] : undefined;
  const helperSkill = helperId ? skillOf(helperId) : undefined;
  const helperCopies = helperId ? owned[helperId] ?? 0 : 0;
  const helperFx = helper && helperSkill ? skillFx(helper.id, helperCopies) : null;
  const cost = helper && helperFx ? chargeCost(helper.rarity, helperCopies) : 0;
  const energyRef = useRef(0);
  const [energy, setEnergy] = useState(0);
  const [uses, setUses] = useState(0);
  const [cutIn, setCutIn] = useState<{ key: number; who: Character; skill: Skill; fast: boolean } | null>(null);
  const skipRef = useRef<(() => void) | null>(null);
  const [gifts, setGifts] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  /** Score multiplier & reward share: live from the first 發動 on (never stacks). */
  const fxRef = useRef<AssistFx>(NO_FX);
  const busy = useRef(false);
  const live = useRef(true);
  const boardRef = useRef(board);
  const origin = useRef<{ x: number; y: number; cell: Pos } | null>(null);
  boardRef.current = board;
  const motion = reducedMotion();
  const step = motion ? 1 : 200;
  const fxMs = motion ? 1 : 360;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      stopVoice();
    };
  }, []);

  // Idle hint after a while.
  useEffect(() => {
    setHint(null);
    if (phase !== "play") return;
    const t = window.setTimeout(() => {
      const m = allMoves(boardRef.current);
      if (m.length) setHint(m[Math.floor(m.length / 2)]!);
    }, 7000);
    return () => window.clearTimeout(t);
  }, [phase, board]);

  const float = (r: number, c: number, text: string, big = false) => {
    floatSerial += 1;
    const id = floatSerial;
    setFloats((list) => [...list.slice(-4), { id, r, c, text, big }]);
    window.setTimeout(() => live.current && setFloats((list) => list.filter((f) => f.id !== id)), 900);
  };

  const finish = (p: Progress, movesLeft: number) => {
    const per = moveBonusPer(def.id);
    const prevBest = record?.best ?? 0;
    if (goalsMet(def, p)) {
      // 餘步加分: unused moves (assist +步 included) are cashed in before stars, best and saved score.
      const left = Math.max(0, movesLeft);
      const bonus = moveBonus(def.id, left);
      const final = finalScore(p.score, left, def.id);
      const stars = starsFor(def, final);
      const { reward, prevStars } = clearLevel(def.id, stars, final);
      const extra = rewardBonus(fxRef.current, reward, prevStars, stars);
      if (extra > 0) useSave.getState().gain(extra);
      setResult({ won: true, score: p.score, left, per, bonus, final, stars, reward: reward + extra, prevStars, prevBest });
      setPhase("done");
    } else if (movesLeft <= 0) {
      setResult({ won: false, score: p.score, left: 0, per, bonus: 0, final: p.score, stars: 0, reward: 0, prevStars: record?.stars ?? 0, prevBest });
      setPhase("done");
    }
  };

  /** Start a level. The 助陣 skill starts empty and charges from clears. */
  const begin = () => {
    fxRef.current = NO_FX;
    energyRef.current = 0;
    setEnergy(0);
    setUses(0);
    if (helper) {
      loadBrushFont(helper.line);
      preloadVoice(helper.id);
    }
    setPhase("play");
  };

  const chargeFrom = (w: Wave, index: number) => {
    if (!helperFx || cost <= 0) return;
    const was = energyRef.current;
    if (was >= cost) return;
    energyRef.current = Math.min(cost, was + waveEnergy(w, index));
    setEnergy(energyRef.current);
    if (energyRef.current >= cost && helper && helperSkill) setNote(`${helper.name}蓄勢已滿 · 點頭像發動「${helperSkill.name}」`);
  };

  /** Wait `ms` — and, while the assist voice plays, until it ends (+0.3s, ≤15s) — or less if the player taps the cut-in. */
  const hold = async (ms: number, voice: VoiceHandle | null = null) => {
    const h = holdForVoice(ms, voice);
    skipRef.current = h.skip;
    await h.done;
    if (skipRef.current === h.skip) skipRef.current = null;
  };

  /** 發動: cut-in with the love line, then the skill lands on the board. */
  const activate = async () => {
    if (!helper || !helperSkill || !helperFx) return;
    if (busy.current || !canActivate({ energy: energyRef.current, cost, uses }, phase, helperFx, moves)) return;
    busy.current = true;
    energyRef.current = 0;
    setEnergy(0);
    setUses((n) => n + 1);
    setPhase("busy");
    setPicked(null);
    setHint(null);
    setNote(null);
    const fx = helperFx;
    const first = fxRef.current === NO_FX;
    fxRef.current = fx;
    const act = activateSkill(boardRef.current, fx);
    const line = `「${helper.line}」`;
    const glyphStep = Math.max(26, Math.min(45, Math.round(1000 / Math.max(1, Array.from(line).length))));
    setCutIn({ key: Date.now(), who: helper, skill: helperSkill, fast: false });
    playAssist(helper.rarity, muted);
    const voice = playVoice(helper.id, helper.line, muted);
    await hold(motion ? 900 : Math.min(1750, 260 + brushWriteMs(line, glyphStep) + 280), voice);
    if (!live.current) return;
    setCutIn(null);
    let acc = progress;
    if (act.strike) {
      for (let i = 0; i < act.strike.waves.length; i++) {
        acc = await playWave(act.strike.waves[i]!, i, acc, false);
        if (!live.current) return;
      }
      setBoard(act.strike.board);
    }
    if (act.gifts.length) {
      setGifts(new Set(act.gifts.map(posKey)));
      setBoard(act.afterGifts);
      playJadeClear(Math.min(10, act.gifts.length * 2), muted);
      await wait(motion ? 1 : 560);
      if (!live.current) return;
      setGifts(new Set());
    }
    if (act.crackHits.length) {
      const shatter = act.crackHits.filter((p) => act.board.seal[p.r]![p.c] === 0);
      setCracks(new Set(act.crackHits.map(posKey)));
      setFx({ key: Date.now(), effects: [], shatter });
      acc = { ...acc, sealsLeft: Math.max(0, acc.sealsLeft - act.cracked) };
      setProgress(acc);
    }
    setBoard(act.board);
    const left = moves + act.moves;
    if (act.moves) setMoves(left);
    // the score/reward buff is switched on once; moves, jades and strikes land every time
    const labels = activationLabels(fx).filter((t) => first || t.endsWith("步"));
    labels.forEach((t, i) => float(Math.max(0, Math.floor(rows / 2) - 2 + i), Math.floor(cols / 2), t, true));
    setNote(`${helper.name} · ${helperSkill.name}`);
    await wait(motion ? 1 : 420);
    if (!live.current) return;
    setCracks(new Set());
    setFx(null);
    busy.current = false;
    if (goalsMet(def, acc)) finish(acc, left);
    else setPhase("play");
  };


  const playWave = async (w: Wave, index: number, acc: Progress, charge = true) => {
    const gained = Math.round(w.score * fxRef.current.mult);
    setBoard(w.before);
    const created = new Map<number, Piece>(w.created.map((x) => [x.piece.id, x.piece]));
    // Stagger the clears outward from whatever set them off.
    const origins = w.effects.map((e) => ({ r: e.r, c: e.c }));
    const delays = new Map<number, number>();
    w.removed.forEach((p, i) => {
      const id = w.removedIds[i]!;
      const d = origins.length ? Math.min(...origins.map((o) => Math.max(Math.abs(o.r - p.r), Math.abs(o.c - p.c)))) : 0;
      delays.set(id, motion ? 0 : Math.min(d * 34, 220));
    });
    const shatter = w.sealHits.filter((p) => w.after.seal[p.r]![p.c] === 0);
    if (w.effects.length || shatter.length) setFx({ key: Date.now() + index, effects: w.effects, shatter });
    setPop(delays);
    setForge(created);
    setCracks(new Set(w.sealHits.map(posKey)));
    playWaveSound(w.effects, w.removed.length, index, muted);
    const next: Progress = {
      ...acc,
      score: acc.score + gained,
      collected: acc.collected.map((n, k) => n + (w.collected[k] ?? 0)),
      sealsLeft: Math.max(0, acc.sealsLeft - w.sealsBroken),
    };
    setProgress(next);
    if (charge) chargeFrom(w, index);
    const at = w.created[0]?.pos ?? w.removed[Math.floor(w.removed.length / 2)] ?? { r: 0, c: 0 };
    float(at.r, at.c, `+${gained}`);
    if (index >= 1) float(Math.floor(rows / 2) - 1, Math.floor(cols / 2), `連消 ×${index + 1}`, true);
    if (w.created.length) setNote(`${SPECIAL_NAME[w.created[0]!.piece.special!]}成形`);
    await wait(w.effects.length ? fxMs + 80 : step + 40);
    if (!live.current) return next;
    setPop(new Map());
    setFx(null);
    setDrop({ map: w.drops, live: false });
    setBoard(w.after);
    await wait(34);
    if (!live.current) return next;
    setDrop({ map: w.drops, live: true });
    await wait(step + 70);
    setForge(new Map());
    setCracks(new Set());
    return next;
  };

  const playSwap = async (a: Pos, b: Pos) => {
    if (busy.current || phase !== "play" || !near(a, b)) return;
    if (b.r < 0 || b.c < 0 || b.r >= rows || b.c >= cols) return;
    busy.current = true;
    setPicked(null);
    setHint(null);
    playJadeTap(muted);
    const res: SwapResult = trySwap(boardRef.current, a, b);
    if (!res.ok) {
      if (res.reason === "sealed") {
        playJadeMiss(muted);
        setNote("封印中的玉動不了，先在旁邊消除");
        busy.current = false;
        return;
      }
      setNudge({ from: a, to: b, on: true });
      await wait(step);
      if (!live.current) return;
      setNudge({ from: a, to: b, on: false });
      playJadeMiss(muted);
      setNote("沒有連成三個");
      await wait(step);
      if (!live.current) return;
      setNudge(null);
      busy.current = false;
      return;
    }
    setPhase("busy");
    setNote(null);
    setNudge({ from: a, to: b, on: true });
    await wait(step);
    if (!live.current) return;
    setNudge(null);
    setBoard(res.swapped);
    const left = moves - 1;
    setMoves(left);
    let acc = progress;
    for (let i = 0; i < res.waves.length; i++) {
      acc = await playWave(res.waves[i]!, i, acc);
      if (!live.current) return;
    }
    if (res.reshuffled) {
      setNote("無步可走，重新洗牌");
      setShuffle(true);
      await wait(motion ? 1 : 260);
      if (!live.current) return;
      setBoard(res.board);
      await wait(motion ? 1 : 320);
      setShuffle(false);
    } else setBoard(res.board);
    busy.current = false;
    if (goalsMet(def, acc) || left <= 0) finish(acc, left);
    else setPhase("play");
  };

  const cellAt = (element: HTMLDivElement, x: number, y: number): Pos | null => {
    const rect = element.getBoundingClientRect();
    const c = Math.floor(((x - rect.left) / rect.width) * cols);
    const r = Math.floor(((y - rect.top) / rect.height) * rows);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    return { r, c };
  };

  const chapter = CHAPTERS.find((ch) => def.id >= ch.from && def.id <= ch.to) ?? null;
  const playable = phase === "play";
  const scoreMax = Math.round(def.stars[1] * 1.08);

  return (
    <>
      <div className="ink-bar safe-top flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" className="ink-ghost flex min-h-11 items-center gap-1 rounded-full px-3 text-sm" onClick={onMap}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          地圖
        </button>
        <div className="min-w-0 text-center">
          <p className="ink-title font-serif text-lg leading-tight">第 {def.id} 關</p>
          <p className="text-[0.7rem] tracking-widest text-muted">{chapter?.name}</p>
        </div>
        <div className={cn("m3-moves grid h-12 w-12 place-items-center rounded-full", moves <= 5 && "m3-moves-low")} data-moves={moves}>
          <span className="text-lg font-semibold leading-none tabular-nums">{moves}</span>
          <span className="-mt-1 text-[0.6rem] text-muted">步</span>
        </div>
      </div>

      <div className="m3-hud mx-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl px-3 py-2" data-testid="m3-hud">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {def.goals.map((g, i) => (
            <GoalChip key={i} goal={g} progress={progress} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-gold" data-score={progress.score}>
            {progress.score}
          </span>
          <div className="m3-bar relative h-2 flex-1 rounded-full" aria-hidden>
            <span className="m3-bar-fill" style={{ width: `${Math.min(100, (progress.score / scoreMax) * 100)}%` }} />
            {def.stars.map((s, i) => (
              <i
                key={s}
                className={cn("m3-bar-star", progress.score >= s && "on")}
                style={{ left: `${(s / scoreMax) * 100}%` }}
                title={`${i + 2}★ ${s}`}
              >
                ★
              </i>
            ))}
          </div>
        </div>
      </div>

      <p className="m3-note mt-1.5 h-5 text-center text-sm" aria-live="polite">
        {note ?? ""}
      </p>

      <div
        className={cn("jade-board m3-board relative mx-auto mt-1.5 w-[calc(100%-1.5rem)] touch-none rounded-2xl", shuffle && "m3-shuffle")}
        data-testid="m3-board"
        data-busy={phase === "busy" ? "1" : "0"}
        data-phase={phase}
        style={
          {
            aspectRatio: `${cols} / ${rows}`,
            maxWidth: `min(24rem, calc((100dvh - 19rem) * ${cols} / ${rows}))`,
            "--cols": cols,
            "--rows": rows,
          } as CSSProperties
        }
        onPointerDown={(event) => {
          if (!playable || busy.current) return;
          const cell = cellAt(event.currentTarget, event.clientX, event.clientY);
          if (!cell) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          origin.current = { x: event.clientX, y: event.clientY, cell };
        }}
        onPointerUp={(event) => {
          const from = origin.current;
          origin.current = null;
          if (!from || !playable || busy.current) return;
          const dx = event.clientX - from.x;
          const dy = event.clientY - from.y;
          if (Math.hypot(dx, dy) < 18) {
            if (board.seal[from.cell.r]![from.cell.c]! > 0) {
              setNote("封印中的玉動不了，先在旁邊消除");
              return;
            }
            if (picked && near(picked, from.cell)) void playSwap(picked, from.cell);
            else {
              setPicked(from.cell);
              playJadeTap(muted);
            }
            return;
          }
          const target =
            Math.abs(dx) > Math.abs(dy)
              ? { r: from.cell.r, c: from.cell.c + (dx > 0 ? 1 : -1) }
              : { r: from.cell.r + (dy > 0 ? 1 : -1), c: from.cell.c };
          void playSwap(from.cell, target);
        }}
      >
        {/* seals sit under the jades' glow but over the stone */}
        {board.seal.flatMap((line, r) =>
          line.map((level, c) =>
            level > 0 ? (
              <span
                key={`seal-${r}-${c}`}
                className={cn("m3-seal-bed", level > 1 && "m3-seal-bed-ice")}
                style={cellStyle(r, c, rows, cols)}
                aria-hidden
              />
            ) : null,
          ),
        )}
        {board.cells.flatMap((line, r) =>
          line.map((p, c) => {
            const shown = forge.get(p.id) ?? p;
            const delay = pop.get(p.id);
            const popping = delay !== undefined;
            const selected = picked?.r === r && picked.c === c;
            const placing = !drop.live && drop.map.size > 0;
            const moving = nudge !== null || (drop.live && drop.map.size > 0);
            const hinted = hint && ((hint[0].r === r && hint[0].c === c) || (hint[1].r === r && hint[1].c === c));
            return (
              <div
                key={p.id}
                className={cn("m3-cell absolute grid place-items-center", selected && "jade-picked z-10", hinted && "m3-hint")}
                data-r={r}
                data-c={c}
                data-kind={shown.kind}
                data-special={shown.special ?? ""}
                data-sealed={board.seal[r]![c]! || undefined}
                style={{
                  ...cellStyle(r, c, rows, cols),
                  transform: shift({ r, c }, nudge, drop.map.get(p.id) ?? 0, drop.live),
                  transition: placing ? "none" : moving ? `transform ${step}ms cubic-bezier(.3,.7,.4,1.05)` : "none",
                }}
              >
                <div
                  className={cn("m3-piece", popping && "m3-pop", forge.has(p.id) && "m3-forge", gifts.has(`${r},${c}`) && "m3-gift", shown.special && `m3-sp m3-sp-${shown.special}`)}
                  style={popping ? ({ "--d": `${delay}ms` } as CSSProperties) : undefined}
                >
                  {shown.special === "color" ? <Pearl /> : <Jade kind={shown.kind} />}
                </div>
              </div>
            );
          }),
        )}
        {board.seal.flatMap((line, r) =>
          line.map((level, c) =>
            level > 0 ? (
              <span
                key={`sealtop-${r}-${c}`}
                data-seal={level}
                className={cn("m3-seal", level > 1 ? "m3-seal-ice" : "m3-seal-ink", cracks.has(`${r},${c}`) && "m3-crack")}
                style={cellStyle(r, c, rows, cols)}
                aria-hidden
              />
            ) : null,
          ),
        )}
        {fx ? <Effects key={fx.key} effects={fx.effects} shatter={fx.shatter} rows={rows} cols={cols} /> : null}
        {floats.map((f) => (
          <span
            key={f.id}
            className={cn("m3-float", f.big && "m3-float-big")}
            style={{ left: `${((f.c + 0.5) * 100) / cols}%`, top: `${((f.r + 0.5) * 100) / rows}%` }}
            aria-hidden
          >
            {f.text}
          </span>
        ))}
      </div>

      <SkillDock
        who={helper}
        skill={helperSkill}
        copies={helperCopies}
        energy={energy}
        cost={cost}
        uses={uses}
        ready={phase === "play" && moves > 0}
        onActivate={() => void activate()}
        onPick={() => setPicking(true)}
      />
      {picking ? <AssistPicker onClose={() => setPicking(false)} /> : null}
      {cutIn ? (
        <SkillCutIn
          key={cutIn.key}
          who={cutIn.who}
          skill={cutIn.skill}
          fast={cutIn.fast}
          onTap={() => {
            setCutIn((c) => (c ? { ...c, fast: true } : c));
            stopVoice();
            window.setTimeout(() => skipRef.current?.(), motion ? 1 : 200);
          }}
        />
      ) : null}

      {phase === "intro" ? <Intro def={def} best={record} onStart={begin} onMap={onMap} /> : null}
      {phase === "done" && result ? (
        <LevelDone def={def} result={result} progress={progress} muted={muted} onMap={onMap} onRetry={() => onPlay(def.id)} onNext={() => onPlay(def.id + 1)} />
      ) : null}
    </>
  );
}

function cellStyle(r: number, c: number, rows: number, cols: number): CSSProperties {
  return { width: `${100 / cols}%`, height: `${100 / rows}%`, left: `${(c * 100) / cols}%`, top: `${(r * 100) / rows}%` };
}

function shift(cell: Pos, nudge: Nudge | null, drop: number, live: boolean): string {
  let x = 0;
  let y = !live && drop > 0 ? -drop * 100 : 0;
  if (nudge && nudge.on) {
    const dc = nudge.to.c - nudge.from.c;
    const dr = nudge.to.r - nudge.from.r;
    const sign = cell.r === nudge.from.r && cell.c === nudge.from.c ? 1 : cell.r === nudge.to.r && cell.c === nudge.to.c ? -1 : 0;
    x = dc * 100 * sign;
    y += dr * 100 * sign;
  }
  return x || y ? `translate(${x}%, ${y}%)` : "none";
}

function Jade({ kind }: { kind: number }) {
  return (
    <img
      src={JADE_SRC[kind] ?? JADE_SRC[0]}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      className="jade-piece pointer-events-none h-[88%] w-[88%] select-none object-contain"
    />
  );
}

/** 龍珠 — 墨玉金龍紋: a dark ink-green jade sphere (cloudy veining, inner glow, double gold rim, crisp specular) with a gold-inlaid 龍紋 — a coiled scroll-curl dragon vectorised from the user's reference. Static SVG markup generated offline (bg/longzhu/v4); per-instance ids via useId. Only transform/opacity animate (aura pulse, sheen sweep, glint twinkle, gold shimmer). */
const LONGZHU_SVG = "<defs><radialGradient id=\"@aura\" r=\"50\" cx=\"0\" cy=\"0\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0.78\" stop-color=\"#ffdc8e\" stop-opacity=\"0.42\"/><stop offset=\"0.9\" stop-color=\"#e2b257\" stop-opacity=\"0.12\"/><stop offset=\"1\" stop-color=\"#e2b257\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"@body\" cx=\"0.4\" cy=\"0.33\" r=\"0.75\"><stop offset=\"0\" stop-color=\"#2b6e50\"/><stop offset=\"0.3\" stop-color=\"#164a35\"/><stop offset=\"0.62\" stop-color=\"#0b2c1f\"/><stop offset=\"0.88\" stop-color=\"#05170f\"/><stop offset=\"1\" stop-color=\"#020a06\"/></radialGradient><radialGradient id=\"@glow\" cx=\"0.6\" cy=\"0.72\" r=\"0.46\"><stop offset=\"0\" stop-color=\"#3fcf94\" stop-opacity=\"0.42\"/><stop offset=\"0.55\" stop-color=\"#2a9e6c\" stop-opacity=\"0.14\"/><stop offset=\"1\" stop-color=\"#2a9e6c\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"@cloud\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#7fe0b4\" stop-opacity=\"0.2\"/><stop offset=\"1\" stop-color=\"#7fe0b4\" stop-opacity=\"0\"/></radialGradient><radialGradient id=\"@veil\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0.6\" stop-color=\"#020c07\" stop-opacity=\"0\"/><stop offset=\"0.9\" stop-color=\"#020c07\" stop-opacity=\"0.45\"/><stop offset=\"1\" stop-color=\"#020c07\" stop-opacity=\"0.8\"/></radialGradient><linearGradient id=\"@g\" x1=\"-30\" y1=\"-30\" x2=\"26\" y2=\"30\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fff2c2\"/><stop offset=\"0.28\" stop-color=\"#f3cd68\"/><stop offset=\"0.55\" stop-color=\"#d9a240\"/><stop offset=\"0.8\" stop-color=\"#b07a26\"/><stop offset=\"1\" stop-color=\"#8a5a18\"/></linearGradient><radialGradient id=\"@gs\" cx=\"-12\" cy=\"-16\" r=\"30\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fffbe6\" stop-opacity=\"0.55\"/><stop offset=\"1\" stop-color=\"#fffbe6\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"@rim\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#fff6d2\"/><stop offset=\"0.25\" stop-color=\"#e6bb5c\"/><stop offset=\"0.5\" stop-color=\"#8c5c1c\"/><stop offset=\"0.75\" stop-color=\"#f3d58c\"/><stop offset=\"1\" stop-color=\"#6e4410\"/></linearGradient><radialGradient id=\"@spec\" cx=\"0.5\" cy=\"0.5\" r=\"0.5\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\"0.9\"/><stop offset=\"0.45\" stop-color=\"#fff\" stop-opacity=\"0.35\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></radialGradient><linearGradient id=\"@glass\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#eafff5\" stop-opacity=\"0.2\"/><stop offset=\"0.42\" stop-color=\"#eafff5\" stop-opacity=\"0\"/></linearGradient><clipPath id=\"@clip\"><circle r=\"39\"/></clipPath><path id=\"@d\" d=\"M-1.5 32.3C-1.9 32 -2.5 31 -2.5 30.7C-2.5 29.9 -3.6 28.7 -4.3 28.7C-4.5 28.7 -5.2 29.2 -5.2 29.5C-5.2 29.6 -4.9 29.7 -4.6 29.7C-3.8 29.7 -3.6 30.2 -4.2 30.7C-4.9 31.4 -6.2 30.2 -5.9 29C-5.2 26.3 -1.2 26.1 0.6 28.7C1.6 30.2 4.1 31.4 5.3 31C7 30.3 7.2 28.7 5.8 27.2C2.2 23.3 1.6 17.7 4.5 14.5C6.8 12 10.6 12 13.6 14.5C17.9 18 15.7 25.2 10.3 25.2C7.9 25.2 6.4 23.9 5.6 21.3C5.2 20 6.8 17.5 8.3 17.1C11.1 16.4 13.4 20.1 11.3 21.7C9.5 23.1 7.2 21.1 8.7 19.4C9.4 18.6 10.9 19.4 10.4 20.4C10.2 20.7 10.2 20.7 10.2 20.3C10.2 19.4 9.3 19.2 8.7 19.8C8 20.5 8.5 21.6 9.5 21.6C11.2 21.6 11.9 19.5 10.5 18.4C9.2 17.3 7 18.3 6.6 20.2C6.2 22.5 9.1 24.6 11.2 23.5C15.5 21.3 13.8 15.6 9 15.6C4.1 15.5 2.5 22.8 6.7 25.5C7.9 26.3 10.7 26.7 12 26.3C12.5 26.1 12.7 26.2 13.5 26.5C15.8 27.6 21.4 27.1 21.4 25.9C21.4 25.8 21.2 25.8 20.8 25.9C19.1 26.3 16.2 26.1 15.9 25.6C15.9 25.5 16 25.3 16.3 25L16.7 24.6L17.3 25C19.8 26.7 23.6 24.4 23 21.7C22.7 20.6 21.6 20.1 21.3 21C21.2 21.3 21.4 21.5 21.8 21.7C22.5 22 21.7 22.6 20.8 22.4C19 22.1 19.4 19.5 21.3 18.7C24.9 17.2 26.5 23.6 23.2 25.8C22.9 26 22.3 26.4 21.8 26.7C21.3 27.1 20.7 27.4 20.4 27.4C20.1 27.5 19.4 27.6 19 27.8C18.5 27.9 17.3 28 16 28C12.9 28 12.2 28.2 12.2 29.4C12.2 30.7 14.1 31.1 14.5 29.8C14.6 29.4 14.8 29.4 15.2 29.8C15.9 30.5 15.4 31.1 13.9 31.9L12.8 32.4L7.9 32.4C4.2 32.4 3 32.4 2.7 32.2C1.9 31.7 1.3 31.7 1.2 32C1 32.5 -0.9 32.8 -1.5 32.3ZM-12.1 31.7C-13 31.4 -13.4 31 -13.5 30.1C-13.6 29.3 -13.3 29 -12.9 29.5C-12.8 29.8 -11.9 29.7 -11.6 29.4C-11 28.6 -11.8 27.3 -13.9 25.6C-16.4 23.7 -20.3 20.1 -21.3 18.8C-23 16.5 -24.3 14.3 -24.5 13C-24.6 12.1 -24.4 12.1 -24 13C-22.5 16.7 -19.2 20.5 -16.2 22.2C-16 22.3 -15.6 22.6 -15.3 22.8C-15 23 -14.1 23.6 -13.3 23.9C-11.9 24.6 -11.7 24.8 -11.2 25.5C-10 27.7 -10 30 -11.4 30.5C-11.6 30.6 -11.6 30.7 -11.4 30.8C-11.1 31.1 -10.4 30.8 -10 30.1C-9.6 29.4 -9.6 27.8 -9.9 26.6C-10.2 25.6 -10.1 25.4 -9.4 25.6C-8.5 25.7 -8.3 26.3 -8.3 28C-8.3 30.8 -10 32.5 -12.1 31.7ZM-7.5 24.5C-9.6 24.2 -11.7 23.6 -13.3 22.9C-14.1 22.5 -14.8 22.1 -14.9 22.1C-15.1 22.1 -16.4 21.2 -17.7 20.2C-19.1 19.2 -20.5 17.3 -22 14.6C-22.8 13.2 -23.8 10 -23.5 9.9C-23.5 9.9 -22.9 9.9 -22.3 9.8C-21.7 9.8 -20.7 9.6 -20.1 9.4C-18.9 9 -18.8 9.1 -18.6 10C-18.4 11.6 -17.7 13 -16.7 14C-15.7 14.9 -15.2 15.2 -13.3 15.7C-11.2 16.3 -10.3 17.6 -11.7 17.9C-12.3 18 -12.3 18.1 -11.8 18.8C-10.7 20 -8.4 18.9 -8.4 17.1C-8.3 15.8 -9.1 14.5 -10.5 13.4L-11 13L-10.8 12.3C-10 10.4 -12.3 8.3 -13.8 9.6C-15.1 10.8 -13.9 13 -12.3 12.2C-11.9 12 -11.8 12 -11.9 12.1C-12.1 12.8 -13.9 13 -14.8 12.4C-15.5 11.9 -16 10.4 -16 9C-16 7.7 -15.7 6.6 -14.7 4.7C-14.3 3.9 -14.1 2.5 -14.4 2.3C-14.5 2.3 -14.9 2.9 -15.3 3.7C-16.8 6.7 -19.9 8.9 -22.6 8.9C-24.2 8.9 -25.8 8.1 -26.9 6.9C-27.4 6.3 -28.7 3.7 -28.7 3.3C-28.7 2.9 -29.3 3.2 -29.4 3.7C-29.7 4.4 -29.5 5.6 -28.6 8.3C-27.7 11.5 -27.7 11.5 -28 12.1C-28.3 12.7 -28.7 12.9 -29.5 12.9C-30.1 12.9 -30.2 12.8 -29.8 12.2C-29.4 11.6 -29.6 9.9 -30.1 8C-30.9 5.4 -31.1 4.8 -31.2 3.6C-31.3 2.2 -31 1 -30.2 0C-29.1 -1.3 -28.8 -2.4 -29.4 -2.9C-30 -3.6 -30.7 -3.2 -30.1 -2.6C-29.5 -1.8 -30.6 -1.3 -31.2 -2C-32.2 -3 -30.6 -4.5 -29 -4.1C-27.5 -3.8 -26.9 -2.7 -26.6 -0.1C-26.3 2.8 -25.7 3.6 -23.4 3.9C-18.5 4.7 -14.1 1.4 -15.2 -2.3C-16.1 -5.3 -19.9 -6.1 -21.5 -3.7C-22.2 -2.7 -22.2 -2.1 -21.6 -0.9C-20.5 1.2 -17.5 0.7 -17.5 -1.6C-17.5 -2.6 -17.7 -2.9 -18.5 -3C-19.1 -3.1 -19.2 -3 -18.8 -2.5C-18 -1.5 -19.3 -0.4 -20.3 -1.2C-20.9 -1.6 -20.9 -2.9 -20.3 -3.4C-19.7 -4 -18.3 -4.1 -17.6 -3.6C-15.4 -2.1 -16 0.8 -18.7 1.7C-23.5 3.6 -27 -2.3 -23.3 -6.1C-21 -8.5 -17.8 -8.7 -12.8 -6.8C-10.8 -6.1 -9.9 -5.9 -6.9 -5.8C-2.1 -5.6 0.8 -7.2 1.6 -10.3C1.9 -11.7 2.2 -11.2 2.2 -9.1C2.3 -5 -1 -2.6 -6.8 -2.6C-10.3 -2.6 -12.9 0.3 -12.9 4C-12.9 6.7 -12.2 8.1 -10.2 9.6C-9.3 10.4 -8.9 10.5 -7.4 11C-6.5 11.2 -1.9 11.2 -0.5 10.9C0.1 10.8 1.5 10.4 2.7 10C8 8.2 12.6 8.3 15.2 10.2C16 10.8 16.2 10.7 16.6 9.9C18.2 6.1 23.8 5.8 25.1 9.4C26.3 12.7 23.3 15.6 21.1 13.4C20.4 12.6 20.2 12.1 20.6 11.4C20.8 11.1 21.2 11 21.2 11.3C21.2 12.1 22.3 12.3 22.9 11.8C23.9 10.8 22.9 9.1 21.3 9.1C18.1 9.1 17.7 13.9 20.8 15.4C24.4 17.3 27.5 15.3 27.5 11.1C27.5 7.5 25.9 6.1 17.2 1.7C16.4 1.3 14.2 -0.2 13.9 -0.6C13.8 -0.8 13.3 -1.4 12.9 -1.9C12.4 -2.4 12 -2.9 12 -3C12 -3.1 11.8 -3.5 11.6 -3.9C9.1 -8.6 13.2 -15.9 18.5 -15.9C20.7 -15.9 23.3 -14.2 24.4 -12.1C25.1 -10.8 25.1 -8.2 24.4 -7C22.1 -3 16.2 -4 16.2 -8.5C16.2 -11.3 19.9 -12.6 21.3 -10.5C22.6 -8.6 20.7 -6.5 18.9 -7.6C17.6 -8.3 18.6 -10.4 19.9 -9.8C20.3 -9.6 20.3 -9.6 19.7 -9.4C18.7 -9 18.6 -7.9 19.6 -7.7C21.2 -7.3 21.9 -9 20.7 -10.1C19.2 -11.6 17 -10.2 17.3 -8C17.5 -6 20.3 -4.9 22 -6.2C24.6 -8.2 23.7 -12.3 20.3 -13.1C16.9 -14 13.9 -11.6 14 -8C14 -5.6 15.7 -3.7 19 -2.1C19.6 -1.9 20.5 -1.4 21.2 -1C21.8 -0.6 22.4 -0.3 22.5 -0.3C22.6 -0.3 24.8 1.1 25 1.3C25.1 1.4 25.4 1.7 25.6 1.8C27.6 3 30.1 6 31 8.1L31.6 9.5L31.5 11.7C31.5 13.8 31.4 13.9 30.9 15.1C29.5 18.1 26 20.4 25.2 19C24.4 17.9 22 17.5 20.4 18.3C20 18.5 19.6 18.6 19.2 18.5C18.7 18.4 18.7 18.4 18.3 20C17.9 21.4 17.2 22.7 16.4 23.6C15.4 24.6 15.3 24.5 16.1 22.9C19.7 15.2 11.5 7.9 4.3 12.5C1.3 14.4 0 18.4 0.9 22.5C1.3 23.8 1.3 23.8 0.1 24.1C-1.9 24.6 -5 24.7 -7.5 24.5ZM-9.8 17.2C-10.1 16.3 -10.3 16 -10.7 15.5C-11 15.2 -11.5 14.9 -11.9 14.8C-12.2 14.8 -12.5 14.6 -12.5 14.5C-12.6 14.2 -12 14.2 -11.5 14.6C-11.3 14.7 -10.9 15 -10.7 15.1C-9.9 15.4 -9.1 16.9 -9.5 17.3C-9.6 17.5 -9.7 17.4 -9.8 17.2ZM-5.9 10.6C-7.8 10.4 -10.1 8.7 -11.3 6.8C-12.3 5.2 -12.1 2 -10.9 0.7C-10.4 0.2 -10.4 0.4 -10.5 2.4C-10.6 5.6 -9.6 7.3 -6.7 8.8C-5.2 9.6 -1.7 9.6 -0.5 8.9C1.2 7.9 1.9 6 1 4.9C0.3 4 -2 4.5 -2 5.6C-2 6.4 -1.1 6.9 -0.7 6.3C-0.1 5.7 0 6.6 -0.5 7.3C-1.6 8.7 -4.5 8.1 -5.3 6.4C-6.4 4.2 -5.4 1.8 -3.1 0.8C-1 -0.1 1.7 1 2 2.9C2 3.4 2.2 3.7 2.5 3.8C3.1 4.1 3.3 4.7 3.3 5.9C3.3 9.1 -1 11.3 -5.9 10.6ZM-12.4 10.4C-12.6 10.3 -12.9 10.3 -13.1 10.4C-13.3 10.4 -13.4 10.4 -13.3 10.3C-13.2 9.8 -11.9 10 -11.9 10.5C-11.9 10.7 -12 10.6 -12.4 10.4ZM-3.3 -1.4C-4 -1.6 -4.1 -1.7 -3.7 -1.8C-1.9 -2.1 -1.4 -2.3 -0.4 -2.8C5.2 -5.5 4.2 -15.3 -1.7 -15.3C-3.3 -15.3 -4 -14.6 -4 -13.2C-4 -11.7 -3.4 -11.1 -2 -11.1C-0.8 -11.1 -0.1 -12.5 -0.9 -13.1C-1.4 -13.5 -1.9 -13.3 -1.9 -12.7C-1.9 -12.1 -2.2 -12 -2.6 -12.4C-3.3 -13.1 -2.5 -14.3 -1.4 -14.3C1.1 -14.3 1.4 -10.1 -1.1 -8.7C-2.5 -7.8 -3.9 -8 -5.2 -9.1C-6.4 -10.1 -6.7 -11.2 -6.3 -13.6C-6.3 -13.9 -6.5 -14.1 -7.1 -14.6C-8.1 -15.4 -8.5 -16.2 -8.2 -17.4C-7.8 -19 -6.2 -19.8 -5.1 -19C-4.5 -18.4 -4.5 -18.1 -5.3 -18.2C-7 -18.6 -6.6 -16.5 -4.8 -15.9C-1.9 -15.1 2.2 -16.6 3.2 -18.9C4.7 -22.4 0.5 -25.7 -1.7 -22.7C-2.8 -21.3 -1.5 -19 0.1 -19.6C0.5 -19.7 0.4 -20.1 -0.2 -20.4C-1.2 -20.9 -0.7 -22.5 0.6 -22.5C2.3 -22.5 2.5 -19.9 0.8 -19C-2.4 -17.2 -7 -20.5 -7.8 -25.3C-8 -26.7 -8.3 -26 -8.3 -23.9C-8.2 -22.5 -8.3 -22 -8.4 -22C-8.7 -22 -10 -23 -10 -23.2C-10 -23.3 -10.2 -23.7 -10.3 -24C-11.9 -26.9 -10.6 -30.2 -7.4 -31.8L-6.1 -32.4L-5.5 -32.1C-4.4 -31.5 -3.9 -31 -3.7 -30.4C-3.2 -29.1 -4.2 -28.1 -5.4 -28.6C-5.8 -28.7 -5.7 -29.3 -5.3 -29.4C-4.9 -29.5 -4.9 -30.1 -5.4 -30.3C-6 -30.7 -6.8 -30 -6.8 -29.2C-6.7 -28.2 -6.2 -27.8 -4.7 -27.4C-0.6 -26.5 0.8 -26 2.9 -24.6C4 -24 6.1 -22.3 6.4 -21.9C6.4 -21.8 6.9 -21.3 7.3 -20.7C11.9 -15 10 -5.7 3.7 -2.5C1.8 -1.6 -1.7 -1 -3.3 -1.4ZM5.2 -5.1C6 -5.7 7.1 -7.9 7.6 -9.7C8.7 -13.4 7.8 -18 5.6 -20.5C4.6 -21.6 4.5 -21.5 4.5 -20C4.5 -18.8 4.5 -18.7 5.1 -18.1C6.6 -16.1 7.6 -11.5 6.8 -9.7L6.6 -9.2L6.5 -10.1C6.1 -12.8 4.7 -16.2 3.9 -16.7C3.6 -16.9 3.5 -16.9 3.1 -16.6C2.3 -16 2.3 -15.7 2.8 -15.1C5.2 -12.2 5.8 -9.3 4.7 -6C4.2 -4.3 4.3 -4.2 5.2 -5.1ZM-27.7 -6C-28 -6.5 -27.9 -7.8 -27.5 -8.7C-26.9 -9.8 -26 -11.3 -25.6 -12C-25 -12.9 -24.6 -14.2 -24.6 -15.4C-24.5 -16.5 -24.5 -16.6 -23.4 -18C-22.4 -19.3 -21.5 -20.2 -20.5 -20.8C-19.6 -21.3 -19.5 -21.5 -20.1 -21.5C-21 -21.5 -25.1 -18 -25.1 -17.3C-25.1 -17 -26.6 -16.3 -27 -16.4C-28 -16.6 -28.2 -18 -27.2 -18C-26.3 -18.1 -25.5 -18.7 -23.6 -20.6C-20.9 -23.3 -19.6 -23.9 -17.5 -23.4C-16.1 -23 -15.5 -23.2 -15.4 -24C-15.3 -24.5 -15.6 -24.6 -15.9 -24.2C-16.1 -23.9 -16.7 -24 -16.9 -24.3C-17.1 -24.6 -17 -24.7 -16.7 -25.1C-15.6 -26.2 -13.9 -24.6 -14.1 -22.6C-14.2 -20.9 -15.5 -20.1 -18.1 -20.1C-20 -20.1 -20.9 -19.7 -21.6 -18.4C-22.6 -16.4 -23.2 -14 -22.9 -12.5C-22.8 -11.4 -22.3 -11.2 -19.2 -10.9C-16.4 -10.6 -15.6 -10.3 -14.5 -9.2C-13.5 -8.3 -13.6 -8.1 -15 -8.6C-17 -9.4 -20.5 -9.2 -22.4 -8.2L-23.5 -7.6L-24.2 -8C-25.9 -8.7 -27.3 -7.8 -27 -6.1C-26.9 -5.5 -27.3 -5.4 -27.7 -6ZM25.1 -13.5C24.8 -13.8 25 -14.1 25.6 -14.1C26.7 -14.1 28.6 -15.7 28.5 -16.4C28.5 -16.9 28.1 -17.1 28.1 -16.7C28.1 -15.8 26.7 -15 24.9 -14.8C23.7 -14.7 23.6 -14.8 22.4 -15.4C21.8 -15.8 20.9 -16.2 20.5 -16.3C20.1 -16.4 19.7 -16.6 19.7 -16.6C19.7 -16.9 21.7 -16.8 23.2 -16.4C25.1 -15.9 26.4 -15.8 26.8 -16.3C27.2 -16.7 27.1 -17.4 26.7 -17.7C26.2 -18 26.6 -18.5 27.5 -18.5C29.7 -18.6 30.1 -15.6 28.1 -13.9C27.2 -13.1 25.7 -12.9 25.1 -13.5ZM10.8 -17.3C10.5 -17.5 9.8 -19 9.9 -19.1C10 -19.1 10.6 -19.1 11.3 -19C14.1 -18.6 16.6 -19.8 16.5 -21.5C16.4 -22.3 16.2 -22.3 15.8 -21.4C15.2 -20.2 13.4 -19.6 11.6 -20C9.7 -20.3 8.8 -20.7 8.4 -21.2C6.9 -23 4.4 -25 2 -26.4L1.4 -26.7L1.9 -26.8C2.5 -26.9 5.4 -25.5 7.8 -23.9C10.1 -22.3 12.5 -21.1 13.2 -21.1C13.8 -21.1 14.9 -22 14.9 -22.5C14.9 -22.7 14.6 -23.1 14.3 -23.4L13.7 -24L14.3 -24.2C17.5 -25.6 19.3 -20.8 16.4 -18.5C14.9 -17.3 11.9 -16.7 10.8 -17.3Z\"/><linearGradient id=\"@shn\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#fff\" stop-opacity=\"0\"/><stop offset=\"0.5\" stop-color=\"#f4fff8\" stop-opacity=\"0.34\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\"0\"/></linearGradient></defs><circle class=\"m3-lz-aura\" r=\"50\" fill=\"url(#@aura)\"/><ellipse cx=\"0\" cy=\"3\" rx=\"41.5\" ry=\"40.5\" fill=\"#000\" opacity=\"0.5\"/><circle r=\"40\" fill=\"url(#@body)\"/><circle r=\"40\" fill=\"url(#@glow)\"/><g clip-path=\"url(#@clip)\"><ellipse cx=\"-14\" cy=\"12\" rx=\"22\" ry=\"11\" transform=\"rotate(-28 -14 12)\" fill=\"url(#@cloud)\"/><ellipse cx=\"16\" cy=\"-12\" rx=\"20\" ry=\"8\" transform=\"rotate(34 16 -12)\" fill=\"url(#@cloud)\" opacity=\"0.8\"/><ellipse cx=\"8\" cy=\"22\" rx=\"16\" ry=\"6\" transform=\"rotate(-12 8 22)\" fill=\"url(#@cloud)\" opacity=\"0.7\"/><path d=\"M-36 8C-28 2 -22 12 -12 8C-4 5 2 -6 12 -4C20 -2 26 -10 37 -6\" fill=\"none\" stroke=\"#a4eccb\" stroke-opacity=\"0.07\" stroke-width=\"3.2\" stroke-linecap=\"round\"/><path d=\"M-31 -22C-25 -17 -17 -24 -9 -20C-1 -16 7 -27 16 -24\" fill=\"none\" stroke=\"#a4eccb\" stroke-opacity=\"0.06\" stroke-width=\"2.4\" stroke-linecap=\"round\"/><path d=\"M-26 27C-18 22 -10 31 0 27C8 24 15 33 26 26\" fill=\"none\" stroke=\"#a4eccb\" stroke-opacity=\"0.06\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M-35 -4C-28 -9 -20 -2 -13 -7C-7 -11 0 -5 6 -9M10 30C17 26 22 31 30 24\" fill=\"none\" stroke=\"#010806\" stroke-opacity=\"0.3\" stroke-width=\"0.4\" stroke-linecap=\"round\"/><circle cx=\"-6\" cy=\"16\" r=\"1.6\" fill=\"#7fe0b4\" opacity=\"0.08\"/><circle cx=\"20\" cy=\"6\" r=\"2.4\" fill=\"#7fe0b4\" opacity=\"0.06\"/></g><g class=\"drg\"><use href=\"#@d\" transform=\"translate(0.6 0.8)\" fill=\"#010805\" opacity=\"0.7\"/><use href=\"#@d\" transform=\"translate(-0.3 -0.3)\" fill=\"#fff0c4\" opacity=\"0.55\"/><use href=\"#@d\" fill=\"url(#@g)\" stroke=\"#6a400e\" stroke-width=\"0.35\" stroke-linejoin=\"round\"/><use class=\"m3-lz-gold\" href=\"#@d\" fill=\"url(#@gs)\"/></g><g clip-path=\"url(#@clip)\"><g transform=\"rotate(28)\"><rect class=\"m3-lz-sheen\" x=\"-7\" y=\"-48\" width=\"14\" height=\"96\" fill=\"url(#@shn)\"/></g></g><circle r=\"40\" fill=\"url(#@veil)\"/><circle r=\"39\" fill=\"url(#@glass)\"/><path d=\"M-30.5 -14A33 33 0 0 1 -12 -31.5\" fill=\"none\" stroke=\"#fff\" stroke-opacity=\"0.32\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><ellipse cx=\"-18\" cy=\"-21\" rx=\"8\" ry=\"3.6\" transform=\"rotate(-42 -18 -21)\" fill=\"url(#@spec)\" opacity=\"0.9\"/><circle class=\"m3-lz-glint\" cx=\"-21.5\" cy=\"-19\" r=\"1.1\" fill=\"#fff\"/><path d=\"M14 33A36 36 0 0 0 33 15\" fill=\"none\" stroke=\"#c6ffe4\" stroke-opacity=\"0.3\" stroke-width=\"1.1\" stroke-linecap=\"round\"/><circle r=\"41.3\" fill=\"none\" stroke=\"#1e1104\" stroke-opacity=\"0.9\" stroke-width=\"0.7\"/><circle r=\"40.5\" fill=\"none\" stroke=\"url(#@rim)\" stroke-width=\"1.5\"/><circle r=\"39.55\" fill=\"none\" stroke=\"#2a1806\" stroke-opacity=\"0.7\" stroke-width=\"0.35\"/><circle r=\"39.1\" fill=\"none\" stroke=\"url(#@rim)\" stroke-width=\"0.5\" opacity=\"0.9\"/>";
function Pearl() {
  const u = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const html = useMemo(() => LONGZHU_SVG.replaceAll("@", `lz${u}`), [u]);
  return (
    <span className="m3-pearl" aria-hidden>
      <svg className="m3-lz" viewBox="-50 -50 100 100" dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  );
}

function Effects({ effects, shatter, rows, cols }: { effects: Effect[]; shatter: Pos[]; rows: number; cols: number }) {
  const cx = (c: number) => ((c + 0.5) * 100) / cols;
  const cy = (r: number) => ((r + 0.5) * 100) / rows;
  return (
    <div className="m3-fx pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
      {effects.map((e, i) => {
        if (e.type === "row")
          return (
            <span
              key={i}
              className="m3-beam m3-beam-h"
              style={{ top: `${(e.r * 100) / rows}%`, height: `${100 / rows}%`, "--o": `${cx(e.c)}%` } as CSSProperties}
            />
          );
        if (e.type === "col")
          return (
            <span
              key={i}
              className="m3-beam m3-beam-v"
              style={{ left: `${(e.c * 100) / cols}%`, width: `${100 / cols}%`, "--o": `${cy(e.r)}%` } as CSSProperties}
            />
          );
        if (e.type === "bomb") {
          const span = e.radius * 2 + 1;
          return (
            <span
              key={i}
              className="m3-blast"
              style={{
                left: `${cx(e.c)}%`,
                top: `${cy(e.r)}%`,
                width: `${(span * 130) / cols}%`,
                aspectRatio: "1",
              }}
            />
          );
        }
        if (e.type === "board") return <span key={i} className="m3-flash" />;
        return (
          <span key={i}>
            <span className="m3-ripple" style={{ left: `${cx(e.c)}%`, top: `${cy(e.r)}%`, width: `${(400 / cols) * 1}%` }} />
            <svg className="m3-rays absolute inset-0 h-full w-full" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id={`ray-${i}`} x1="0" x2="1">
                  <stop offset="0" stopColor="#fff8e6" />
                  <stop offset="1" stopColor="#ffd58a" />
                </linearGradient>
              </defs>
              {e.targets.map((t, k) => (
                <line
                  key={k}
                  x1={e.c + 0.5}
                  y1={e.r + 0.5}
                  x2={t.c + 0.5}
                  y2={t.r + 0.5}
                  pathLength={1}
                  stroke={`url(#ray-${i})`}
                  className="m3-ray"
                  style={{ animationDelay: `${k * 18}ms` }}
                />
              ))}
            </svg>
            {e.targets.map((t, k) => (
              <span key={`t${k}`} className="m3-target" style={{ left: `${cx(t.c)}%`, top: `${cy(t.r)}%`, width: `${100 / cols}%`, animationDelay: `${80 + k * 18}ms` }} />
            ))}
          </span>
        );
      })}
      {shatter.map((p, i) => (
        <span key={`s${i}`} className="m3-shatter" style={{ left: `${cx(p.c)}%`, top: `${cy(p.r)}%`, width: `${100 / cols}%` }} />
      ))}
    </div>
  );
}

function GoalChip({ goal, progress }: { goal: Goal; progress: Progress }) {
  const { have, need, done } = goalStatus(goal, progress);
  const shown = Math.min(have, need);
  return (
    <span className={cn("m3-goal flex items-center gap-1 rounded-full py-0.5 pl-1 pr-2.5 text-sm tabular-nums", done && "m3-goal-done")} data-goal={goal.type} data-done={done ? "1" : "0"}>
      {goal.type === "collect" ? (
        <img src={JADE_SRC[goal.kind]} alt={JADE_NAMES[goal.kind]} className="h-6 w-6" />
      ) : goal.type === "seal" ? (
        <span className="m3-goal-seal" aria-label="墨封" />
      ) : (
        <span className="m3-goal-score" aria-label="得分">分</span>
      )}
      {done ? <span aria-label="完成">✓</span> : null}
      <span>
        {shown}/{need}
      </span>
    </span>
  );
}

function goalText(goal: Goal, sealCount: number) {
  if (goal.type === "score") return `得分達 ${goal.target}`;
  if (goal.type === "collect") return `收集 ${JADE_NAMES[goal.kind]} ×${goal.count}`;
  return `破除全部墨封（${sealCount} 處）`;
}

function Intro({ def, best, onStart, onMap }: { def: LevelDef; best?: { stars: number; best: number }; onStart: () => void; onMap: () => void }) {
  const sealCount = (def.seal ?? []).join("").replace(/\./g, "").length;
  const ice = (def.seal ?? []).join("").includes("2");
  const per = rewardPerStar(def.id);
  const [picking, setPicking] = useState(false);
  return (
    <div className="m3-modal fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5" data-testid="m3-intro">
      {picking ? <AssistPicker onClose={() => setPicking(false)} /> : null}
      <div className="m3-card w-full max-w-sm rounded-2xl p-5 text-center">
        <p className="text-xs tracking-[0.3em] text-muted">{CHAPTERS.find((c) => def.id >= c.from && def.id <= c.to)?.name}</p>
        <h2 className="mt-1 font-serif text-3xl tracking-[0.2em]">第 {def.id} 關</h2>
        {isChapterFinale(def.id) ? <p className="m3-boss-badge mx-auto mt-2 w-fit rounded-full px-3 py-0.5 text-xs tracking-[0.25em]" data-testid="m3-finale">章末關 · 難度提升</p> : null}
        <p className="mt-1 text-sm text-muted">{def.moves} 步之內</p>
        <ul className="mt-4 space-y-2 text-left">
          {def.goals.map((g, i) => (
            <li key={i} className="m3-intro-goal flex items-center gap-2 rounded-xl px-3 py-2">
              {g.type === "collect" ? (
                <img src={JADE_SRC[g.kind]} alt="" className="h-7 w-7" />
              ) : g.type === "seal" ? (
                <span className="m3-goal-seal h-7 w-7" />
              ) : (
                <span className="m3-goal-score h-7 w-7">分</span>
              )}
              <span>{goalText(g, sealCount)}</span>
            </li>
          ))}
        </ul>
        {ice ? <p className="mt-2 text-xs text-muted">冰封要碰兩次：先碎冰，再破墨。</p> : null}
        <AssistSlot onPick={() => setPicking(true)} />
        <div className="mt-4 flex items-center justify-center gap-4 text-sm tabular-nums">
          <span className="text-muted">★★ {def.stars[0]}</span>
          <span className="text-muted">★★★ {def.stars[1]}</span>
        </div>
        <p className="mt-1 text-xs text-muted">提早過關，剩餘每步 +{moveBonusPer(def.id)} 分</p>
        <p className="mt-2 flex items-center justify-center gap-1 text-sm">
          {best?.stars ? (
            <>
              已得 <span className="text-gold">{"★".repeat(best.stars)}</span> · {best.stars < 3 ? "補星再得每星" : "重玩"} <MoYu label /> {best.stars < 3 ? per : REPLAY_INK}
            </>
          ) : (
            <>
              首次過關每星 <MoYu label /> {per}
            </>
          )}
        </p>
        {def.tip ? <p className="m3-tip mt-3 rounded-xl px-3 py-2 text-left text-sm leading-relaxed">{def.tip}</p> : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="min-h-11 rounded-xl border border-line" onClick={onMap}>
            地圖
          </button>
          <button type="button" className="min-h-11 rounded-xl bg-gold" onClick={onStart} data-testid="m3-start">
            落子
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 餘步加分 count-up: after the card lands, each unused move is cashed in one by one
 * (a bell per move), the total and the stars climbing with it. Tap the card to skip;
 * with reduced motion it starts finished.
 */
function useBonusCount(result: Result, muted: boolean) {
  const left = result.won ? result.left : 0;
  const [cashed, setCashed] = useState(() => (reducedMotion() ? left : 0));
  useEffect(() => {
    if (cashed >= left) return;
    const delay = cashed === 0 ? 650 : Math.max(60, Math.min(150, 1500 / left));
    const t = window.setTimeout(() => setCashed((n) => Math.min(left, n + 1)), delay);
    return () => window.clearTimeout(t);
  }, [cashed, left]);
  useEffect(() => {
    if (cashed <= 0) return;
    if (cashed < left) playMoveBonus(cashed - 1, muted);
    else playBonusDone(muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashed]);
  return { cashed, left, done: cashed >= left, skip: () => setCashed(left) };
}

function LevelDone({
  def,
  result,
  progress,
  muted,
  onMap,
  onRetry,
  onNext,
}: {
  def: LevelDef;
  result: Result;
  progress: Progress;
  muted: boolean;
  onMap: () => void;
  onRetry: () => void;
  onNext: () => void;
}) {
  const hasNext = def.id < LEVELS.length;
  const sealCount = progress.sealsTotal;
  const { cashed, left, done, skip } = useBonusCount(result, muted);
  const bonusNow = cashed * result.per;
  const total = done ? result.final : result.score + bonusNow;
  const startStars = left > 0 && !reducedMotion() ? starsFor(def, result.score) : result.stars;
  const liveStars = done ? result.stars : starsFor(def, total);
  const record = done && result.final > result.prevBest;
  return (
    <div className="m3-modal fixed inset-0 z-50 grid place-items-center p-5" data-testid="m3-result" data-won={result.won ? "1" : "0"} data-stars={result.stars}>
      <div
        className={cn("m3-card w-full max-w-sm rounded-2xl p-5 text-center", result.won && "m3-card-win")}
        onClick={done ? undefined : skip}
        data-bonus-done={done ? "1" : "0"}
      >
        <p className="text-xs tracking-[0.3em] text-muted">第 {def.id} 關</p>
        <h2 className="m3-result-title mt-1 font-serif text-4xl tracking-[0.3em]">{result.won ? "過關" : "步盡"}</h2>
        {result.won ? (
          <>
            <div className="m3-stars mt-4 flex items-end justify-center gap-2" aria-label={`${result.stars} 星`}>
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={cn("m3-big-star", n === 2 && "m3-big-star-mid", liveStars >= n && "on")}
                  style={{ animationDelay: n <= startStars ? `${200 + n * 260}ms` : "0ms" }}
                >
                  ★
                </span>
              ))}
            </div>
            <dl className="mx-auto mt-4 grid max-w-[16rem] grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
              <dt className="text-left text-muted">得分</dt>
              <dd className="text-right">{result.score}</dd>
              <dt className="text-left text-muted">
                剩餘步數 {left} × {result.per}
              </dt>
              <dd className={cn("m3-bonus-val text-right", cashed > 0 && "on")} data-testid="m3-bonus" data-left={left} data-per={result.per} data-bonus={result.bonus}>
                +{bonusNow}
              </dd>
              {left > 0 ? (
                <dd className="col-span-2 flex flex-wrap justify-start gap-1 py-0.5" aria-hidden>
                  {Array.from({ length: left }, (_, i) => (
                    <i key={i} className={cn("m3-bonus-pip", i < cashed && "on")} />
                  ))}
                </dd>
              ) : null}
              <dt className="text-left">總分</dt>
              <dd className="text-right font-semibold text-gold" data-total={total}>
                {total}
              </dd>
            </dl>
            <p className={cn("mt-1 h-4 text-xs", done ? "text-gold" : "text-muted")} aria-live="polite">
              {!done ? "點一下略過" : record ? (result.prevBest > 0 ? `新紀錄 · 舊最佳 ${result.prevBest}` : "新紀錄") : `最佳 ${result.prevBest}`}
            </p>
            <p className={cn("m3-reward mt-3 flex items-center justify-center gap-1.5 text-xl", !done && "invisible")} data-reward={result.reward}>
              <MoYu label className="h-7 w-7" /> +{result.reward}
            </p>
            <p className={cn("mt-1 text-xs text-muted", !done && "invisible")}>
              {result.prevStars === 0
                ? `首次過關 · 每星 ${rewardPerStar(def.id)}`
                : result.stars > result.prevStars
                  ? `補足 ${result.stars - result.prevStars} 星`
                  : "重玩小賞"}
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">差一點。看看還差什麼：</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
              {def.goals.map((g, i) => (
                <li key={i}>
                  <GoalChip goal={g} progress={progress} />
                </li>
              ))}
            </ul>
            {def.goals.some((g) => g.type === "seal") ? <p className="mt-2 text-xs text-muted">墨封剩 {progress.sealsLeft}/{sealCount}</p> : null}
          </>
        )}
        <div className={cn("mt-5 grid gap-3", result.won && hasNext ? "grid-cols-3" : "grid-cols-2")}>
          <button type="button" className="min-h-11 rounded-xl border border-line text-sm" onClick={onMap}>
            地圖
          </button>
          <button type="button" className={cn("min-h-11 rounded-xl text-sm", result.won ? "border border-line" : "bg-gold")} onClick={onRetry}>
            再戰
          </button>
          {result.won && hasNext ? (
            <button type="button" className="min-h-11 rounded-xl bg-gold text-sm" onClick={onNext} data-testid="m3-next">
              下一關
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

/** Round 助陣 button: the portrait in a gold rim, the energy ring in the rarity colour. */
export function SkillButton({
  who,
  ratio,
  full,
  disabled,
  onTap,
  size = "lg",
}: {
  who: Character;
  ratio: number;
  full: boolean;
  disabled?: boolean;
  onTap?: () => void;
  size?: "lg" | "md";
}) {
  const pct = Math.round(ratio * 100);
  return (
    <button
      type="button"
      className={cn("m3-skill-btn", `m3-skill-btn-${size}`, `rar-${who.rarity}`, full && "full")}
      onClick={onTap}
      disabled={disabled}
      aria-label={full ? `發動 ${who.name} 的技能` : `${who.name} 蓄勢 ${pct}%`}
      data-testid="m3-skill"
      data-full={full ? "1" : "0"}
      data-ratio={ratio.toFixed(2)}
    >
      <svg className="m3-skill-ring" viewBox="0 0 68 68" aria-hidden>
        <circle className="m3-skill-ring-bg" cx="34" cy="34" r={RING_R} />
        <circle
          className="m3-skill-ring-fill"
          cx="34"
          cy="34"
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - ratio)}
          transform="rotate(-90 34 34)"
        />
      </svg>
      <span className="m3-skill-rim">
        <Portrait id={who.id} name={who.name} className="m3-skill-face" />
      </span>
      {full ? <span className="m3-skill-go">發動</span> : null}
    </button>
  );
}

/** Under the board: the skill button and what it does. */
function SkillDock({
  who,
  skill,
  copies,
  energy,
  cost,
  uses,
  ready,
  onActivate,
  onPick,
}: {
  who?: Character;
  skill?: Skill;
  copies: number;
  energy: number;
  cost: number;
  uses: number;
  ready: boolean;
  onActivate: () => void;
  onPick: () => void;
}) {
  if (!who || !skill) {
    return (
      <div className="m3-dock mx-auto mt-2 flex w-[calc(100%-1.5rem)] max-w-sm items-center gap-3 px-1" data-testid="m3-dock" data-empty="1">
        <button type="button" className="m3-skill-empty grid h-14 w-14 shrink-0 place-items-center rounded-full font-serif text-lg" onClick={onPick} data-testid="m3-skill-pick">
          助
        </button>
        <button type="button" className="min-w-0 flex-1 text-left text-sm text-gold" onClick={onPick}>
          選擇助陣
          <span className="block text-xs text-muted">帶一位已相逢的人，消除蓄勢，點頭像發動技能</span>
        </button>
      </div>
    );
  }
  const full = cost > 0 && energy >= cost;
  const step = skillStep(copies);
  return (
    <div className="m3-dock mx-auto mt-2 flex w-[calc(100%-1.5rem)] max-w-sm items-center gap-3 px-1" data-testid="m3-dock" data-energy={energy} data-cost={cost} data-uses={uses}>
      <SkillButton who={who} ratio={cost ? energy / cost : 0} full={full} disabled={!full || !ready} onTap={onActivate} />
      <div className="min-w-0 flex-1 text-left">
        <p className="flex items-baseline gap-1.5 text-sm">
          <span className="font-serif text-fg">{who.name}</span>
          <span className="m3-skill-name truncate">「{skill.name}」{STEP_NAMES[step]}</span>
        </p>
        <p className={cn("text-xs", full ? "m3-skill-ready" : "text-muted")} data-testid="m3-skill-state">
          {full ? "蓄滿 · 點頭像發動" : `消除蓄勢 ${energy}/${cost}`}
          {uses ? ` · 已發動 ${uses} 次` : ""}
        </p>
        <p className="truncate text-[0.68rem] text-gold/80">{describeFx(skill.steps[step])}</p>
      </div>
    </div>
  );
}

/** Activation cut-in: portrait sweeps in, ink & gold burst, the love line brush-written. */
function SkillCutIn({ who, skill, fast, onTap }: { who: Character; skill: Skill; fast: boolean; onTap: () => void }) {
  const line = `「${who.line}」`;
  const step = Math.max(26, Math.min(45, Math.round(1000 / Math.max(1, Array.from(line).length))));
  return (
    <div
      className={cn("m3-cutin fixed inset-0 z-[55]", `rar-${who.rarity}`, fast && "fast")}
      onClick={onTap}
      role="presentation"
      data-testid="m3-cutin"
    >
      <span className="m3-cutin-veil" aria-hidden />
      <span className="m3-cutin-burst" aria-hidden />
      <span className="m3-cutin-ink" aria-hidden />
      <div className="m3-cutin-band">
        <span className="m3-cutin-face-wrap">
          <Portrait id={who.id} name={who.name} className="m3-cutin-face" />
        </span>
        <div className="m3-cutin-text">
          <p className="m3-cutin-skill font-serif">
            {who.name} · 「{skill.name}」
          </p>
          <BrushLine text={line} play={!fast} delay={260} step={step} className="rv-love-card m3-cutin-line" />
        </div>
      </div>
      <span className="m3-cutin-motes" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ "--i": i } as CSSProperties} />
        ))}
      </span>
    </div>
  );
}

/** The 助陣 block in the level intro: who helps and what the skill does. */
function AssistSlot({ onPick }: { onPick: () => void }) {
  const chosen = useSave((s) => s.assist);
  const owned = useSave((s) => s.owned);
  const id = resolveAssist(chosen, owned, CHARACTERS);
  const who = id ? BY_ID[id] : undefined;
  const skill = who ? skillOf(who.id) : undefined;
  const copies = id ? owned[id] ?? 0 : 0;
  const step = skillStep(copies);
  const auto = !!who && chosen !== who.id;
  return (
    <div className="m3-assist mt-4 rounded-2xl px-3 py-3 text-left" data-testid="m3-assist">
      <p className="flex items-center justify-between text-xs tracking-[0.3em] text-gold">
        <span>助 陣</span>
        {auto ? <span className="m3-assist-auto rounded-full px-2 py-0.5 text-[0.65rem] tracking-wider">預設 · 最強</span> : null}
      </p>
      {who && skill ? (
        <div className="mt-2 flex items-center gap-3">
          <SkillButton who={who} ratio={1} full={false} size="md" onTap={onPick} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <RarityMark rarity={who.rarity} />
              <span className="font-serif text-base text-fg">{who.name}</span>
              <span className="m3-skill-name">「{skill.name}」{STEP_NAMES[step]}</span>
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-gold">{describeFx(skill.steps[step])}</span>
            <span className="mt-0.5 block text-[0.7rem] leading-snug text-muted">
              消除蓄勢 {chargeCost(who.rarity, copies)} · 蓄滿點頭像發動，可多次
            </span>
          </span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">尚未帶人助陣。帶一位已相逢的人，消除蓄勢，點頭像發動技能。</p>
      )}
      <button type="button" className="m3-assist-change mt-3 min-h-10 w-full rounded-xl text-sm" onClick={onPick} data-testid="m3-assist-change">
        {who ? "換人助陣" : "選擇助陣"}
      </button>
    </div>
  );
}

function AssistPicker({ onClose }: { onClose: () => void }) {
  const owned = useSave((s) => s.owned);
  const chosen = useSave((s) => s.assist);
  const current = resolveAssist(chosen, owned, CHARACTERS);
  const setAssist = useSave((s) => s.setAssist);
  const list: Character[] = CHARACTERS.filter((c) => (owned[c.id] ?? 0) > 0).sort(
    (a, b) => RANK[b.rarity] - RANK[a.rarity] || (owned[b.id] ?? 0) - (owned[a.id] ?? 0) || a.name.localeCompare(b.name, "zh-Hant"),
  );
  const choose = (id: string | null) => {
    setAssist(id);
    onClose();
  };
  return (
    <div className="m3-modal fixed inset-0 z-[60] grid place-items-center p-4" onClick={onClose} data-testid="m3-assist-picker">
      <div className="m3-card flex max-h-[86dvh] w-full max-w-sm flex-col rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-center font-serif text-xl tracking-[0.3em]">選擇助陣</h3>
        <p className="mt-1 text-center text-xs text-muted">消除蓄勢，蓄滿點頭像發動。稀有度越高越強；緣分三階、六階升段並蓄得更快</p>
        <div className="scroll-area mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          <button type="button" className={cn("m3-pick flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", !current && "on")} onClick={() => choose(NO_ASSIST)}>
            <span className="m3-assist-empty grid h-11 w-11 shrink-0 place-items-center rounded-full font-serif">無</span>
            <span className="text-sm text-muted">不帶助陣</span>
          </button>
          {list.length === 0 ? <p className="py-6 text-center text-sm text-muted">尚未相逢任何人物。先去召喚吧。</p> : null}
          {list.map((c) => {
            const copies = owned[c.id] ?? 0;
            const skill = skillOf(c.id);
            if (!skill) return null;
            const step = skillStep(copies);
            return (
              <button
                key={c.id}
                type="button"
                className={cn("m3-pick flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", current === c.id && "on")}
                onClick={() => choose(c.id)}
              >
                <Portrait id={c.id} name={c.name} className={cn("m3-pick-face h-11 w-11 shrink-0 rounded-full object-cover object-top", `rar-${c.rarity}`)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <RarityMark rarity={c.rarity} />
                    <span className="font-serif text-fg">{c.name}</span>
                    <span className="m3-skill-name text-xs">「{skill.name}」{STEP_NAMES[step]}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-gold">{describeFx(skill.steps[step])}</span>
                  <span className="block text-[0.7rem] leading-snug text-muted">{skill.flavor}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
