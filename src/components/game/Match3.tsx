import { lockBattleEquipment } from "@/game/quick-equip";
import { Raid } from "./Raid";
import { StoryJourney } from "./StoryJourney";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Star } from "lucide-react";
import { cn, MoYu, Portrait } from "@/components/game/bits";
import { BY_ID, CHARACTERS, type Character } from "@/game/data";
import {
  NO_FX,
  rewardBonus,
  skillFx,
  skillOf,
  type AssistFx,
  type Skill,
} from "@/game/skills";
import {
  activateSkill,
  activationLabels,
  canActivate,
  chargeCost,
  freshCharge,
  waveEnergy,
} from "@/game/assist";
import { fightTeam } from "@/game/team";
import { afterCast, finishHand, freshTrioPassives, grantMap, liEvaluate, type Grant, type TrioState } from "@/game/trio-passives";
import {
  COMBAT,
  PLAYER,
  chainCast,
  clampHp,
  creepAfterMove,
  fightOutcome,
  boardHasSeal,
  comboHit,
  enemyForFloor,
  enemyForLevel,
  enemyTurn,
  feedLamp,
  forgetBroken,
  freshChain,
  hitWithWaves,
  hurt as hurtEnemy,
  hpEquivMoves,
  jadeHeal,
  playerMaxHp,
  purgeEnemySeals,
  skillHit,
  startEnemy,
  type ChainState,
  type EnemyDef,
  type EnemyState,
} from "@/game/combat";
import type { StoryEvent } from "@/game/story-events";
import {
  ComboBanner,
  EnemyPanel,
  EnemyPreview,
  StoryDone,
  TeamDock,
  TeamPicker,
  TeamSlot,
  type HitFx,
} from "@/components/game/CombatHud";
import { COACH_VERSION, CombatCoach } from "@/components/game/CombatCoach";
import { BrushLine, brushWriteMs, loadBrushFont } from "@/components/game/Cinematic";
import {
  playAssist,
  playBonusDone,
  playJadeClear,
  playJadeMiss,
  playJadeTap,
  playMoveBonus,
  playVoice,
  playWaveSound,
  preloadVoice,
  stopVoice,
} from "@/game/audio";
import { holdForVoice, type VoiceHandle } from "@/game/voice-timing";
import { useSave } from "@/game/store";
import { MainStoryReader } from "@/components/game/MainStory";
import {
  type MainStoryTarget,
  currentStoryChapterTab,
} from "@/game/main-story";
import { ARTIFACT_BY_ID, MATERIALS, artifactUnlocks } from "@/game/artifacts";
import { devArtifacts } from "@/game/artifact-dev";
import { LEGACY_FIRST_INK, RAID_TIER_NAME, type MatDrop, type RaidEncounter } from "@/game/raid";
import {
  artifactCast,
  artifactMove,
  resonanceDamage,
  slotsFor,
  startArtifactRun,
  waveInfo,
  type ArtifactRun,
} from "@/game/artifact-engine";
import {
  HEAL_CHANCE,
  HEAL_KIND,
  allMoves,
  near,
  sealsLeft,
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
  HEAL_JADE_NAME,
  isChapterFinale,
  JADE_NAMES,
  LEVELS,
  MAX_STARS,
  REPLAY_INK,
  VOLUME_AWARD_INK,
  finalScore,
  goalStatus,
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
  "/jade/jade-6-xin@2x.webp",
] as const;

const SPECIAL_NAME = { row: "橫刻玉", col: "縱刻玉", bomb: "金鑲玉", color: "龍珠" } as const;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
const posKey = (p: Pos) => `${p.r},${p.c}`;

function reducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type View = { kind: "raid" } | { kind: "map" } | { kind: "level"; id: number; run: number };

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
      {view.kind === "raid" ? (
        <Raid onClose={() => setView({ kind: "map" })} />
      ) : view.kind === "level" && def ? (
        <Game
          key={view.run}
          def={def}
          onMap={() => setView({ kind: "map" })}
          onPlay={(id) =>
            setView(
              LEVELS.some((l) => l.id === id)
                ? { kind: "level", id, run: Date.now() }
                : { kind: "map" },
            )
          }
        />
      ) : (
        <LevelMap
          onRaid={() => setView({ kind: "raid" })}
          onClose={onClose}
          onPick={(id) => setView({ kind: "level", id, run: Date.now() })}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ map */

function LevelMap({
  onClose,
  onPick,
  onRaid,
}: {
  onClose: () => void;
  onPick: (id: number) => void;
  onRaid: () => void;
}) {
  const progress = useSave((s) => s.m3);
  const claimed = useSave((s) => s.volumeAwards);
  const mainRead = useSave((s) => s.mainStoryRead);
  const prologueRead = useSave((s) => s.mainStoryPrologueRead);
  const hanRead = useSave((s) => s.mainStoryHanRead);
  const wuRead = useSave((s) => s.mainStoryWuRead);
  const qiRead = useSave((s) => s.mainStoryQiRead);
  const tangRead = useSave((s) => s.mainStoryTangRead);
  const stars = totalStars(progress);
  // Reading is opt-in: entering the map never blocks stage selection with a story.
  const [story, setStory] = useState<MainStoryTarget | null>(null);
  /** 主線章節切換：目前只開放秦朝篇；其餘朝代先鎖，待內容更新。 */
  const [storyTab, setStoryTab] = useState<1 | 2 | 3 | 4 | 5>(() =>
    currentStoryChapterTab(prologueRead, mainRead, hanRead, wuRead, qiRead, tangRead),
  );
  // 成就 · 卷滿 popup: opens by itself for the first full, unpaid 卷 whenever the map shows (e.g. back from
  // the level that completed it). 稍後 skips that 卷 until the map reopens; the header badge reopens it.
  const [skipped, setSkipped] = useState<number[]>([]);
  const [award, setAward] = useState<{ volume: number; paid: boolean } | null>(null);
  const nextAward = (skip: number[]) => {
    const v = readyVolumes(useSave.getState().m3, useSave.getState().volumeAwards).find(
      (x) => !skip.includes(x),
    );
    setAward(v ? { volume: v, paid: false } : null);
  };
  const openAwardIfReady = (skip: number[] = skipped) => {
    if (story != null) return; // wait until main story closes
    nextAward(skip);
  };
  // When map mounts with no pending story, show 卷滿 if ready.
  useEffect(() => {
    if (story != null) return;
    openAwardIfReady(skipped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);
  const current =
    LEVELS.find((l) => isUnlocked(l.id, progress) && !(progress[String(l.id)]?.stars ?? 0))?.id ??
    null;
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
      <div className="ink-bar journey-header safe-top flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="ink-title font-serif text-xl">
            山河行旅
          </p>
          <p className="text-sm text-muted">
            跨越五朝讀故事 · 過關集星換墨玉
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="m3-star-count flex items-center gap-1 rounded-full px-3 py-1 text-sm tabular-nums"
            data-stars={stars}
          >
            <Star className="h-4 w-4 fill-current" aria-hidden />
            {stars}/{MAX_STARS}
          </span>
          <button
            type="button"
            className="ink-ghost min-h-11 whitespace-nowrap rounded-full px-4 text-sm"
            onClick={onClose}
          >
            離開
          </button>
        </div>
      </div>
      <button className="ink-ghost min-h-11 text-sm" onClick={onRaid} data-testid="raid-entry">
        墨厄討伐 · 三人助陣
      </button>
      <div ref={scroller} className="m3-map journey-scroll" data-testid="m3-map">
        <div className="stage-journey">
          <section className="journey-landscape">
            <p className="ui-eyebrow">山河行旅 · 秦朝篇</p>
            <h2>{current ? `下一程 · 第 ${current} 關` : "五卷行旅 · 已盡數通關"}</h2>
            <p>循墨跡前行，拾一片相逢的星光。</p>
          </section>
          <StoryJourney
            chapter={storyTab}
            onChapter={setStoryTab}
            onRead={(target) => {
              if (target !== "prologue") setStoryTab(target.chapter);
              setStory(target);
            }}
            renderLevels={(volume) => {
              const ci = volume - 1;
              const chapter = CHAPTERS[ci];
              const levels = LEVELS.filter((l) => l.id >= chapter.from && l.id <= chapter.to);
              const { got, max } = volumeStars(progress, volume);
              return (
                <section
                  key={chapter.name}
                  tabIndex={-1}
                  className={cn("m3-chapter journey-levels rounded-2xl px-3 pb-4 pt-3", `m3-chapter-${ci}`)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="font-serif text-lg tracking-[0.2em]">{chapter.name}</h3>
                    <span className="text-xs tabular-nums text-muted">★ {got}/{max}</span>
                  </div>
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
                        <li
                          key={l.id}
                          className="flex justify-center"
                          style={{ gridRow: row + 1, gridColumn: col + 1 }}
                        >
                          <button
                            type="button"
                            disabled={!open}
                            data-level={l.id}
                            data-state={state}
                            data-finale={isChapterFinale(l.id) || undefined}
                            className={cn(
                              "m3-node",
                              `m3-node-${state}`,
                              current === l.id && "m3-node-current",
                              isChapterFinale(l.id) && "m3-node-boss",
                            )}
                            onClick={() => onPick(l.id)}
                            aria-label={`第 ${l.id} 關${isChapterFinale(l.id) ? "（章末關）" : ""}${state === "locked" ? "（未解鎖）" : rec?.stars ? `，${rec.stars} 星` : ""}`}
                          >
                            <span className="m3-node-disc">
                              {<span className="font-serif">{l.id}</span>}
                              {l.goals.some((g) => g.type === "seal") && state !== "locked" ? (
                                <span className="m3-node-seal" aria-hidden />
                              ) : null}
                              {isChapterFinale(l.id) ? (
                                <span className="m3-node-boss-tag" aria-hidden>
                                  章末
                                </span>
                              ) : null}
                            </span>
                            <span className="m3-node-stars" aria-hidden>
                              {[1, 2, 3].map((n) => (
                                <i key={n} className={cn((rec?.stars ?? 0) >= n && "on")}>
                                  ★
                                </i>
                              ))}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            }}
          />
        </div>
      </div>
      {story != null ? (
        <MainStoryReader
          target={story}
          onClose={() => {
            const st = useSave.getState();
            const closed = story;
            setStory(null);
            // Return to the stages paired with this Qin volume, rather than chaining more plot.
            const selector = closed === "prologue" || closed.chapter === 1
              ? `[data-journey-volume="${closed === "prologue" ? 1 : Math.min(closed.volume, 5)}"] .journey-levels`
              : `#journey-era-${closed.chapter}`;
            requestAnimationFrame(() => {
              const target = scroller.current?.querySelector<HTMLElement>(selector);
              target?.scrollIntoView({ block: "start", behavior: "auto" });
              target?.focus({ preventScroll: true });
            });
            const skip = skipped;
            const v = readyVolumes(st.m3, st.volumeAwards).find((x) => !skip.includes(x));
            setAward(v ? { volume: v, paid: false } : null);
          }}
        />
      ) : null}
      {story == null && award ? (
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
function VolumeAward({
  volume,
  got,
  max,
  claimed,
  onClaim,
}: {
  volume: number;
  got: number;
  max: number;
  claimed: boolean;
  onClaim: () => void;
}) {
  const ready = !claimed && max > 0 && got >= max;
  const pct = max > 0 ? Math.min(100, (got / max) * 100) : 0;
  return (
    <div
      className={cn(
        "m3-achieve mb-4 flex items-center gap-3 rounded-xl px-2.5 py-2",
        ready && "m3-achieve-ready",
        claimed && "m3-achieve-done",
      )}
      data-testid="m3-achieve"
      data-volume={volume}
      data-got={got}
      data-state={claimed ? "claimed" : ready ? "ready" : "progress"}
    >
      <span
        className="m3-achieve-seal grid h-9 w-9 shrink-0 place-items-center rounded-full"
        aria-hidden
      >
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
        <button
          type="button"
          className="m3-achieve-claim min-h-10 shrink-0 rounded-full px-4 text-sm"
          onClick={onClaim}
          data-testid="m3-achieve-claim"
        >
          領取
        </button>
      ) : null}
    </div>
  );
}

function VolumeAwardPopup({
  volume,
  paid,
  onClaim,
  onClose,
}: {
  volume: number;
  paid: boolean;
  onClaim: () => void;
  onClose: () => void;
}) {
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
    <div
      className="m3-modal fixed inset-0 z-50 grid place-items-center p-5"
      data-testid="m3-achieve-popup"
      data-volume={volume}
      data-paid={paid ? "1" : "0"}
      onClick={onClose}
    >
      <div
        className="m3-card m3-card-win m3-achieve-card relative w-full max-w-xs overflow-hidden rounded-2xl p-6 text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="m3-achieve-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="m3-achieve-rays" aria-hidden />
        <p className="relative text-xs tracking-[0.4em] text-gold">成就達成</p>
        <h2
          id="m3-achieve-title"
          className="m3-result-title relative mt-2 font-serif text-2xl tracking-[0.2em]"
        >
          {chapter?.name ?? "卷"} · 卷滿
        </h2>
        <p className="relative mt-2 flex items-center justify-center gap-1 text-sm tabular-nums text-muted">
          <Star className="h-4 w-4 fill-current text-gold" aria-hidden /> {max}/{max} · 本卷盡數三星
        </p>
        <p className="m3-reward relative mt-5 flex items-center justify-center gap-2 text-3xl">
          <MoYu label className="h-10 w-10" /> +{VOLUME_AWARD_INK}
        </p>
        <p className="relative mt-1 h-4 text-xs text-muted">
          {paid ? "已收入墨池" : "每卷僅此一次"}
        </p>
        {paid ? (
          <button
            ref={primary}
            type="button"
            className="relative mt-5 min-h-11 w-full rounded-xl bg-gold"
            onClick={onClose}
            data-testid="m3-achieve-ok"
          >
            好
          </button>
        ) : (
          <div className="relative mt-5 grid grid-cols-[1fr_2fr] gap-2">
            <button
              type="button"
              className="ink-ghost min-h-11 rounded-xl text-sm"
              onClick={onClose}
            >
              稍後
            </button>
            <button
              ref={primary}
              type="button"
              className="min-h-11 rounded-xl bg-gold"
              onClick={onClaim}
              data-testid="m3-achieve-take"
            >
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
type Float = { id: number; r: number; c: number; text: string; big?: boolean; tone?: "heal" | "hurt" };
/**
 * A level's end. `left` = remaining 氣血 converted to equivalent unused moves (hpEquivMoves, ≤ def.moves);
 * each is worth `per` (餘血加分).
 */
type Result = {
  won: boolean;
  score: number;
  left: number;
  /** 氣血 left / max when the fight ended. */
  hpLeft?: number;
  maxHp?: number;
  per: number;
  bonus: number;
  final: number;
  stars: number;
  reward: number;
  prevStars: number;
  prevBest: number;
  /** 深宮 only: line under the reward (rank / leaderboard note). */
  note?: string;
  /** 墨厄 defeated (破厄) this run — shown only, never changes stars or 墨玉. */
  purged?: boolean;
  enemyName?: string;
  /** 劇情三消: why the event ended. */
  reason?: string;
};

/** 劇情三消 event mode: no stars, no 墨玉, no map record; lamp-guarding win/lose. */
export type StoryMode = {
  event: StoryEvent;
  onClear: () => void;
  onLeave: () => void;
};

/**
 * 鎮厄司 raid mode: the SAME shared HP combat (氣血, 7×8, 青玉璧（綠色玉）, 三人戰隊, 天命連攜). No stars, no map record,
 * never 墨玉 per run — a win calls `onClear`, which records the drop (materials only).
 */
export type RaidMode = {
  enc: RaidEncounter;
  onClear: () => { drops: MatDrop; first: boolean; ink: number } | null;
  onLeave: () => void;
};
const MAT_NAME: Record<string, string> = Object.fromEntries(MATERIALS.map((m) => [m.id, m.name]));
export const dropText = (d: MatDrop) =>
  Object.entries(d)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => `${MAT_NAME[k] ?? k} ×${n}`)
    .join("、");
/** 命器共鳴 / 專屬 raid shield shred per firing wearer (墨厄討伐 only; limited). */
const RAID_SHRED = 80;

let floatSerial = 0;

/**
 * 深宮 tower mode for a level: no map record and no per-star / replay 墨玉 — the tower decides what a clear
 * is worth (one-time rank rewards only) through `onClear`, which returns the 墨玉 actually granted.
 */
export type TowerMode = {
  /** e.g. "第 12 層" */
  title: string;
  /** e.g. "御女 · 深宮" */
  sub: string;
  /** Intro line in place of the 墨玉-per-star line. */
  intro: string;
  onClear: (final: number) => { ink: number; note: string };
};

export function Game({
  def,
  onMap,
  onPlay,
  tower,
  story,
  raid,
}: {
  def: LevelDef;
  onMap: () => void;
  onPlay: (id: number) => void;
  tower?: TowerMode;
  story?: StoryMode;
  raid?: RaidMode;
}) {
  const start = useMemo(
    () => startBoard(def, Math.random, HEAL_CHANCE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { rows, cols } = start;
  const [board, setBoard] = useState<Board>(start);
  // 氣血 replaces the move count; `def.moves` stays a hidden balance number (max HP, 餘血加分, story nights).
  const maxHp = playerMaxHp(def.moves);
  const hpRef = useRef(maxHp);
  const [hp, setHpState] = useState(maxHp);
  const setHp = (n: number) => {
    hpRef.current = clampHp(n, maxHp);
    setHpState(hpRef.current);
  };
  const [hpHit, setHpHit] = useState<{ key: number; kind: "hurt" | "heal" } | null>(null);
  /** Player actions (swaps) taken this run — internal counter only (no longer a win path). */
  const actsRef = useRef(0);
  const [acts, setActs] = useState(0);
  const [progress, setProgress] = useState<Progress>(() => startProgress(start));
  const equipmentRelease = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<"intro" | "play" | "busy" | "done">("intro");
  const [picked, setPicked] = useState<Pos | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [pop, setPop] = useState<Map<number, number>>(new Map());
  const [forge, setForge] = useState<Map<number, Piece>>(new Map());
  const [cracks, setCracks] = useState<Set<string>>(new Set());
  const [fx, setFx] = useState<{ key: number; effects: Effect[]; shatter: Pos[] } | null>(null);
  const [drop, setDrop] = useState<{ map: Map<number, number>; live: boolean }>({
    map: new Map(),
    live: true,
  });
  const [floats, setFloats] = useState<Float[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [hint, setHint] = useState<[Pos, Pos] | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [raidWin, setRaidWin] = useState<{ drops: MatDrop; first: boolean; ink: number } | null>(null);
  const muted = useSave((s) => s.muted);
  useEffect(() => {
    if (muted) stopVoice();
  }, [muted]);
  const mapRecord = useSave((s) => s.m3[String(def.id)]);
  const record = tower || raid ? undefined : mapRecord;
  const clearLevel = useSave((s) => s.clearLevel);
  // 助陣: the picked (or strongest owned) character; their skill charges from clears.
  const chosen = useSave((s) => s.assist);
  const owned = useSave((s) => s.owned);
  // 命器: the 助陣's equipped instance runs through the shared engine (same code for 主線 and 深宮).
  const artifactSave = useSave((s) => s.artifacts);
  const artifactRun = useRef<ArtifactRun | null>(null);
  // 共用戰鬥: always a 三人戰隊 (shared 編隊) — empty / short seats are filled by 自動配對 (pin first).
  const savedTeam = useSave((s) => s.raid.team);
  const team = useMemo(() => fightTeam(savedTeam, owned, CHARACTERS, chosen), [savedTeam, owned, chosen]);
  const multi = team.length > 1;
  const teamArtifacts = Object.fromEntries(
    slotsFor(artifactSave, team).map((sl) => [sl.wearerId, ARTIFACT_BY_ID[sl.eid]?.name]),
  );
  const enemyDef: EnemyDef = useMemo(
    () => (raid ? raid.enc.enemy : story ? story.event.enemy : tower ? enemyForFloor(def.id, def) : enemyForLevel(def)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const lampRule = story?.event.lamp ?? null;
  const [enemy, setEnemyState] = useState<EnemyState>(() => startEnemy(enemyDef, lampRule ? lampRule.start : null));
  const enemyRef = useRef(enemy);
  const setEnemy = (e: EnemyState) => {
    enemyRef.current = e;
    setEnemyState(e);
  };
  // 墨紋延伸 (t438u): the 墨厄's own seals read as creeping ink veins on stages where they spread.
  const veins = new Set(enemy.placed);
  const [hitFx, setHitFx] = useState<HitFx | null>(null);
  const [attackFx, setAttackFx] = useState<{ key: number } | null>(null);
  const [combo, setCombo] = useState<{ key: number; kind: "duo" | "trio" | "purge"; ids: string[] } | null>(null);
  const [boardHit, setBoardHit] = useState(0);
  const [teamPicking, setTeamPicking] = useState(false);
  const coachSeen = useSave((s) => s.coachSeen);
  const [coach, setCoach] = useState(false);
  useEffect(() => {
    if (!boardHit) return;
    const t = window.setTimeout(() => live.current && setBoardHit(0), 460);
    return () => window.clearTimeout(t);
  }, [boardHit]);
  type Member = { energy: number; uses: number };
  const membersRef = useRef<Record<string, Member>>({});
  const [members, setMembersState] = useState<Record<string, Member>>({});
  const setMembers = (m: Record<string, Member>) => {
    membersRef.current = m;
    setMembersState(m);
  };
  const chainRef = useRef<ChainState>(freshChain());
  const [chainIds, setChainIds] = useState<string[]>([]);
  const turnRef = useRef(0);
  const moveGainRef = useRef(0);
  /** t516 三角色專屬被動: fight-local only (never saved); reset at begin / finish / unmount. */
  const trioRef = useRef<TrioState>(freshTrioPassives([]));
  const costOf = (id: string) => chargeCost(BY_ID[id]!.rarity, owned[id] ?? 0);
  const freshMember = (id: string): Member => {
    const { energy, uses } = freshCharge(costOf(id), BY_ID[id]!.rarity);
    return { energy, uses };
  };
  const [cutIn, setCutIn] = useState<{
    key: number;
    who: Character;
    skill: Skill;
    fast: boolean;
  } | null>(null);
  const skipRef = useRef<(() => void) | null>(null);
  const [gifts, setGifts] = useState<Set<string>>(new Set());
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
      trioRef.current = freshTrioPassives([]);
      equipmentRelease.current?.();
      equipmentRelease.current = null;
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

  const float = (r: number, c: number, text: string, big = false, tone?: Float["tone"]) => {
    floatSerial += 1;
    const id = floatSerial;
    setFloats((list) => [...list.slice(-4), { id, r, c, text, big, tone }]);
    window.setTimeout(
      () => live.current && setFloats((list) => list.filter((f) => f.id !== id)),
      900,
    );
  };

  const finish = (p: Progress) => {
    const per = moveBonusPer(def.id);
    const prevBest = record?.best ?? 0;
    const purged = enemyRef.current.defeated;
    const enemyName = enemyDef.name;
    const hpLeft = hpRef.current;
    const outcome = fightOutcome({ defeated: purged, hp: hpLeft, lamp: story ? (enemyRef.current.lamp ?? 0) : null });
    if (!outcome) return;
    trioRef.current = freshTrioPassives([]); // t516: the fight is over — no passive survives into the next one
    if (raid) {
      // 鎮厄司: a win records the material drop (never 墨玉 per run); a loss costs nothing.
      const won = outcome === "win";
      if (won) setRaidWin(raid.onClear());
      setResult({
        won,
        score: p.score,
        left: 0,
        hpLeft,
        maxHp,
        per: 0,
        bonus: 0,
        final: p.score,
        stars: 0,
        reward: 0,
        prevStars: 0,
        prevBest: 0,
        purged,
        enemyName,
      });
      setPhase("done");
      return;
    }
    if (story) {
      // 劇情三消: 破厄 while the lamp still burns = success; lamp out or 氣血 gone = fail.
      const lamp = enemyRef.current.lamp ?? 0;
      const won = outcome === "win";
      if (won) story.onClear();
      setResult({
        won,
        score: p.score,
        left: 0,
        hpLeft,
        maxHp,
        per: 0,
        bonus: 0,
        final: p.score,
        stars: 0,
        reward: 0,
        prevStars: 0,
        prevBest: 0,
        purged,
        enemyName,
        reason: won
          ? `擊退${enemyName}，燈火還剩 ${lamp}。`
          : lamp <= 0
            ? `${enemyName}吞盡了燈火。`
            : `氣血耗盡，燈火無人守住。`,
      });
      setPhase("done");
      return;
    }
    if (outcome === "win") {
      // 過關 = 破厄 only. 餘血加分: remaining 氣血 → equivalent unused moves (≤ def.moves) → the old leftover bonus.
      const left = hpEquivMoves(hpLeft, maxHp, def.moves);
      const bonus = moveBonus(def.id, left);
      const final = finalScore(p.score, left, def.id);
      const stars = starsFor(def, final);
      if (tower) {
        // 深宮: never clearLevel (map 墨玉) and no assist share — only the tower's one-time rank rewards.
        const { ink, note } = tower.onClear(final);
        setResult({
          won: true,
          score: p.score,
          left,
          hpLeft,
          maxHp,
          per,
          bonus,
          final,
          stars,
          reward: ink,
          prevStars: 0,
          prevBest,
          note,
          purged,
          enemyName,
        });
        setPhase("done");
        return;
      }
      const { reward, prevStars } = clearLevel(def.id, stars, final);
      const extra = rewardBonus(fxRef.current, reward, prevStars, stars);
      if (extra > 0) useSave.getState().gain(extra);
      setResult({
        won: true,
        score: p.score,
        left,
        hpLeft,
        maxHp,
        per,
        bonus,
        final,
        stars,
        reward: reward + extra,
        prevStars,
        prevBest,
        purged,
        enemyName,
      });
      setPhase("done");
    } else {
      setResult({
        won: false,
        score: p.score,
        left: 0,
        hpLeft: 0,
        maxHp,
        per,
        bonus: 0,
        final: p.score,
        stars: 0,
        reward: 0,
        prevStars: record?.stars ?? 0,
        prevBest,
        purged,
        enemyName,
      });
      setPhase("done");
    }
  };

  /** 氣血 change with a little flash on the HP badge and a floating number over the board. */
  const changeHp = (delta: number, where: Pos | null = null) => {
    if (!delta) return;
    const before = hpRef.current;
    setHp(before + delta);
    const real = hpRef.current - before;
    if (!real) return;
    setHpHit({ key: Date.now() + Math.random(), kind: real > 0 ? "heal" : "hurt" });
    const at = where ?? { r: 0, c: Math.floor(cols / 2) };
    float(at.r, at.c, real > 0 ? `+${real} 血` : `−${-real} 血`, real < 0, real > 0 ? "heal" : "hurt");
  };

  /** Start a run. Every assist's skill starts empty and charges from clears; the 墨厄 starts fresh. */
  const begin = () => {
    equipmentRelease.current?.();
    equipmentRelease.current = lockBattleEquipment();
    setTeamPicking(false);
    // 自動配對 at fight start: an empty (or short) 編隊 is saved as the auto-filled team, never a lone assist.
    if (team.length && team.join() !== savedTeam.join()) useSave.getState().setRaidTeam(team);
    artifactRun.current = startArtifactRun(
      slotsFor(useSave.getState().artifacts, team),
      {
        mode: raid ? "raid" : story ? "story" : tower ? "tower" : "main",
        // 鎮厄司 boards start clean but the 墨厄 seals them, so seal rules stay live there.
        hasSeal: sealsLeft(start) > 0 || (!!raid && raid.enc.enemy.skills.includes("ink")),
        hasMilestone: !story && !raid, // 主線 / 深宮: the 2★ / 3★ score lines
        hasGoal: def.goals.length > 0,
      } as Parameters<typeof startArtifactRun>[1],
      artifactUnlocks(useSave.getState().m3, devArtifacts()).resonance, // always current unlock
    );
    fxRef.current = NO_FX;
    setHp(maxHp);
    actsRef.current = 0;
    setActs(0);
    setMembers(Object.fromEntries(team.map((id) => [id, freshMember(id)])));
    chainRef.current = freshChain();
    setChainIds([]);
    turnRef.current = 0;
    trioRef.current = freshTrioPassives(team);
    setEnemy(startEnemy(enemyDef, lampRule ? lampRule.start : null));
    if (story) useSave.getState().recordStoryEvent(story.event.id, "try");
    // 動畫教學指引: once per save (new players, and old saves meeting the 墨厄 UI for the first time).
    if (coachSeen < COACH_VERSION) window.setTimeout(() => live.current && setCoach(true), motion ? 50 : 450);
    for (const id of team) {
      const c = BY_ID[id];
      if (!c) continue;
      loadBrushFont(c.line);
      preloadVoice(c.id);
    }
    setPhase("play");
  };


  /** Normal (player-move) clears charge EVERY assist; a team is capped per move. Skill clears never charge. */
  const chargeFrom = (w: Wave, index: number) => {
    if (!team.length) return;
    let gain = waveEnergy(w, index);
    if (multi) {
      gain = Math.min(gain, Math.max(0, COMBAT.energyPerMoveCap - moveGainRef.current));
      moveGainRef.current += gain;
    }
    if (gain <= 0) return;
    addEnergy(Object.fromEntries(team.map((id) => [id, gain])));
  };

  const addEnergy = (gains: Record<string, number>, share = false) => {
    const m = { ...membersRef.current };
    const ready: string[] = [];
    for (const id of team) {
      const cost = costOf(id);
      const cur = m[id] ?? freshMember(id);
      if (cost <= 0 || cur.energy >= cost) continue;
      const add = share ? Math.round(cost * (gains[id] ?? 0)) : (gains[id] ?? 0);
      if (add <= 0) continue;
      const energy = Math.min(cost, cur.energy + add);
      m[id] = { ...cur, energy };
      if (energy >= cost) ready.push(id);
    }
    setMembers(m);
    if (ready.length) {
      const c = BY_ID[ready[0]!]!;
      setNote(`${c.name}蓄勢已滿 · 點頭像發動「${skillOf(c.id)?.name ?? ""}」`);
    }
  };

  /** t516: passive charge goes through the normal energy path (capped at each member's cost). */
  const applyTrio = (grants: Grant[]) => {
    if (!grants.length) return;
    addEnergy(grantMap(grants));
    const names = [...new Set(grants.map((g) => g.passive))];
    float(Math.max(0, Math.floor(rows / 2) - 3), Math.floor(cols / 2), `${names.join("、")} · 蓄勢`, true);
  };

  /** 墨厄 took damage: shake + number; on 0 HP → 破厄 (own seals melt, team charge gift). */
  const strike = (next: EnemyState, dealt: number, kind: HitFx["kind"], board: Board | null) => {
    const was = enemyRef.current;
    setEnemy(next);
    if (dealt > 0) setHitFx({ key: Date.now() + Math.random(), amount: dealt, kind });
    if (!was.defeated && next.defeated) {
      // 破厄: the 墨厄's own seals melt once the move / cast has fully settled (see applyPurge).
      purgeRef.current = next.placed;
      setEnemy({ ...next, placed: [] });
      setCombo({ key: Date.now(), kind: "purge", ids: [] });
      window.setTimeout(() => live.current && setCombo(null), motion ? 600 : 1500);
      addEnergy(Object.fromEntries(team.map((id) => [id, COMBAT.defeatCharge])), true);
      playBonusDone(muted);
    }
    return board;
  };

  const purgeRef = useRef<string[] | null>(null);
  /** Apply a pending 破厄 to the settled board; returns the board to keep using. */
  const applyPurge = (board: Board): Board => {
    const placed = purgeRef.current;
    if (!placed) return board;
    purgeRef.current = null;
    const purge = purgeEnemySeals({ ...enemyRef.current, placed }, board);
    if (!purge.cleared.length) return board;
    setBoard(purge.board);
    boardRef.current = purge.board;
    setFx({ key: Date.now() + 7, effects: [], shatter: purge.cleared });
    return purge.board;
  };

  /** Wait `ms` — and, while the assist voice plays, until it ends (+0.3s, ≤15s) — or less if the player taps the cut-in. */
  const hold = async (ms: number, voice: VoiceHandle | null = null) => {
    const h = holdForVoice(ms, voice);
    skipRef.current = h.skip;
    await h.done;
    if (skipRef.current === h.skip) skipRef.current = null;
  };

  /** 發動: cut-in with the love line, then the skill lands on the board and hits the 墨厄. Costs no move. */
  const activate = async (id: string = team[0] ?? "") => {
    const who = BY_ID[id];
    const skill = who ? skillOf(id) : undefined;
    if (!who || !skill) return;
    const copies = owned[id] ?? 0;
    const fxNow = skillFx(id, copies);
    const cost = costOf(id);
    const mem = membersRef.current[id] ?? freshMember(id);
    if (busy.current || !canActivate({ energy: mem.energy, cost, uses: mem.uses }, phase, fxNow, hpRef.current)) return;
    busy.current = true;
    const firstCast = mem.uses === 0;
    const m = { ...membersRef.current, [id]: { energy: 0, uses: mem.uses + 1 } };
    setMembers(m);
    setPhase("busy");
    setPicked(null);
    setHint(null);
    setNote(null);
    // Team stack cap: strongest score / reward buff wins (never multiplied); heals land in full (capped at max 氣血).
    const prev = fxRef.current;
    fxRef.current = { ...fxNow, mult: Math.max(prev.mult, fxNow.mult), reward: Math.max(prev.reward, fxNow.reward) };
    const fx = fxNow;
    let armedNames: string[] = [];
    let resonance: ReturnType<typeof artifactCast>["resonance"] = [];
    if (artifactRun.current) {
      const cast = artifactCast(artifactRun.current, id, skill.id);
      artifactRun.current = cast.run;
      armedNames = cast.armed;
      resonance = cast.resonance;
    }
    const act = activateSkill(boardRef.current, fx);
    const line = `「${who.line}」`;
    const glyphStep = Math.max(26, Math.min(45, Math.round(1000 / Math.max(1, Array.from(line).length))));
    setCutIn({ key: Date.now(), who, skill, fast: false });
    playAssist(who.rarity, muted);
    const voice = playVoice(who.id, who.line, muted);
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
    let after: Board = act.board;
    setBoard(after);
    boardRef.current = after;
    // the skill itself strikes the 墨厄
    const sk = skillHit(enemyDef, enemyRef.current, act.crackHits.length, after);
    after = strike(sk.state, sk.dealt, "skill", after) ?? after;
    if (boardHasSeal(after) && sk.dealt === 0) setNote("墨封未解 · 傷不到墨厄");
    // 命器共鳴: the wearer's own skill resonates with the 命器 passive (bounded extra on THIS hit; no energy).
    if (resonance.length && !enemyRef.current.defeated) {
      const extra = resonanceDamage(sk.dealt, resonance);
      if (extra > 0) {
        const r = hurtEnemy(enemyRef.current, extra);
        after = strike(r.state, r.dealt, "skill", after) ?? after;
      }
      float(Math.max(0, Math.floor(rows / 2) - 3), Math.floor(cols / 2), `命器共鳴 · ${resonance.map((f) => f.name).join("、")}`, true);
    }
    if (lampRule) setEnemy(feedLamp(enemyRef.current, lampRule.perCast));
    // 天命連攜: different assists back-to-back → 墨痕共鳴 / 天命共鳴 (chain resets after three; never loops)
    const ch = chainCast(chainRef.current, id, turnRef.current, Date.now());
    chainRef.current = ch.chain;
    setChainIds(ch.combo === "trio" ? [] : ch.chain.ids);
    if (ch.combo && !enemyRef.current.defeated) {
      setCombo({ key: Date.now(), kind: ch.combo, ids: ch.ids });
      playAssist("SSR", muted);
      await wait(motion ? 300 : 700);
      if (!live.current) return;
      const c = comboHit(enemyDef, enemyRef.current, ch.combo, after);
      after = strike(c.state, c.dealt, ch.combo, after) ?? after;
      setBoardHit(Date.now());
      window.setTimeout(() => live.current && setCombo((x) => (x && x.kind !== "purge" ? null : x)), motion ? 300 : 800);
    }
    after = applyPurge(after);
    if (act.heal > 0) {
      const before = hpRef.current;
      setHp(before + act.heal);
      if (hpRef.current > before) setHpHit({ key: Date.now(), kind: "heal" });
    }
    liEvaluate(trioRef.current, hpRef.current, maxHp); // t516: a skill heal is never a hand — only (re)checks the arm
    const labels = activationLabels(fx).filter((t) => firstCast || t.endsWith("血"));
    labels.forEach((t, i) => float(Math.max(0, Math.floor(rows / 2) - 2 + i), Math.floor(cols / 2), t, true, t.endsWith("血") ? "heal" : undefined));
    setNote(`${who.name} · ${skill.name}${armedNames.length ? ` · 命器「${armedNames.join("、")}」待發` : ""}`);
    await wait(motion ? 1 : 420);
    if (!live.current) return;
    setCracks(new Set());
    setFx(null);
    // t516 帝王號令: the cast is complete (strike, gifts, seals, hits, heal) — 劉徹's first one charges the others once.
    applyTrio(afterCast(trioRef.current, id, `${id}:${mem.uses + 1}`));
    busy.current = false;
    if (enemyRef.current.defeated) finish(acc);
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
      const d = origins.length
        ? Math.min(...origins.map((o) => Math.max(Math.abs(o.r - p.r), Math.abs(o.c - p.c))))
        : 0;
      delays.set(id, motion ? 0 : Math.min(d * 34, 220));
    });
    const shatter = w.sealHits.filter((p) => w.after.seal[p.r]![p.c] === 0);
    if (w.effects.length || shatter.length)
      setFx({ key: Date.now() + index, effects: w.effects, shatter });
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
    // every clear (player or skill) strikes the 墨厄; the lamp drinks its own jade's light
    if (!enemyRef.current.defeated) {
      const h = hitWithWaves(enemyDef, enemyRef.current, [w], 1, index, w.after); // t507: real cascade index; fx.mult is score-only (see `gained`)
      strike(h.state, h.hits[0] ?? 0, "hit", w.after);
      if (boardHasSeal(w.after)) setNote("墨封未解 · 傷不到墨厄");
    }
    if (lampRule) setEnemy(feedLamp(enemyRef.current, (w.collected[lampRule.kind] ?? 0) * lampRule.perJade));
    // 粉心玉（粉色愛心補血石）: each one cleared (by a move, a special, a 龍珠 or a skill) heals 氣血.
    const healed = jadeHeal(w.collected);
    if (healed > 0) {
      const i = w.removed.findIndex((p) => w.before.cells[p.r]?.[p.c]?.kind === HEAL_KIND);
      changeHp(healed, w.removed[i] ?? null);
    }
    const at = w.created[0]?.pos ?? w.removed[Math.floor(w.removed.length / 2)] ?? { r: 0, c: 0 };
    float(at.r, at.c, `+${gained}`);
    if (index >= 1)
      float(Math.floor(rows / 2) - 1, Math.floor(cols / 2), `連消 ×${index + 1}`, true);
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
    actsRef.current += 1;
    setActs(actsRef.current);
    turnRef.current += 1;
    moveGainRef.current = 0;
    let acc = progress;
    const before = progress;
    for (let i = 0; i < res.waves.length; i++) {
      acc = await playWave(res.waves[i]!, i, acc);
      if (!live.current) return;
    }
    let after = res.board;
    if (res.reshuffled) {
      setNote("無玉可換，重新洗牌");
      setShuffle(true);
      await wait(motion ? 1 : 260);
      if (!live.current) return;
      setBoard(res.board);
      await wait(motion ? 1 : 320);
      setShuffle(false);
    } else setBoard(res.board);
    after = applyPurge(after);
    // t516: this successful player swap (all its gravity waves, charge and jade heals) is ONE 有效消除.
    applyTrio(finishHand(trioRef.current, turnRef.current, res.waves.reduce((n, w) => n + w.removed.length, 0)));
    liEvaluate(trioRef.current, hpRef.current, maxHp);
    // 命器: evaluated once per PLAYER move (skill strikes never enter), capped inside the engine.
    if (artifactRun.current && artifactRun.current.slots.length) {
      const goalsDone = (p: Progress) => def.goals.filter((g) => goalStatus(g, p).done).length;
      const out = artifactMove(
        artifactRun.current,
        res.waves.map((w, i) => waveInfo(w, i, Math.round(w.score * fxRef.current.mult))),
        {
          goals: { before: goalsDone(before), after: goalsDone(acc) },
          score: { before: before.score, after: acc.score, milestones: def.stars },
        },
      );
      artifactRun.current = out.run;
      if (out.bonus > 0) {
        acc = { ...acc, score: acc.score + out.bonus };
        float(Math.floor(rows / 2), Math.floor(cols / 2), `命器 +${out.bonus}`, true);
      }
      if (Object.keys(out.energy).length) addEnergy(out.energy);
      // 墨厄討伐: 魏武虎符 / 鐵馬寒鋒 專屬 add one limited shield shred.
      if (raid && out.shred.length && !enemyRef.current.defeated && enemyRef.current.shield > 0) {
        setEnemy({ ...enemyRef.current, shield: Math.max(0, enemyRef.current.shield - RAID_SHRED * out.shred.length) });
      }
      if (out.notes.length) setNote(`命器 · ${out.notes.join("、")}`);
      setProgress(acc);
    }
    // 墨紋延伸 (第 40 關起): any 墨紋 the move left standing creeps onto a neighbour — 「沒弄掉就會延伸」.
    if (!enemyRef.current.defeated && hpRef.current > 0) {
      const cr = creepAfterMove(enemyDef, forgetBroken(enemyRef.current, after), after);
      if (cr.cells.length) {
        after = cr.board;
        setBoard(after);
        boardRef.current = after;
        setEnemy(cr.state);
        setCracks(new Set(cr.cells.map(posKey)));
        setNote(`墨紋延伸 ×${cr.cells.length}`);
        await wait(motion ? 1 : 280);
        if (!live.current) return;
        setCracks(new Set());
      }
    }
    // 墨厄's turn (after the player's move resolves). Story: the night wind dims the lamp first.
    if (lampRule) setEnemy({ ...enemyRef.current, lamp: Math.max(0, (enemyRef.current.lamp ?? 0) - lampRule.decay) });
    const lampOut = !!story && (enemyRef.current.lamp ?? 0) <= 0;
    if (!lampOut && hpRef.current > 0 && !enemyRef.current.defeated) {
      const t = enemyTurn(enemyDef, forgetBroken(enemyRef.current, after), after);
      if ("label" in t) {
        setAttackFx({ key: Date.now() });
        setBoardHit(Date.now());
        playJadeMiss(muted);
        await wait(motion ? 1 : 380);
        if (!live.current) return;
        after = t.board;
        setBoard(after);
        boardRef.current = after;
        if (t.sealed.length) setCracks(new Set(t.sealed.map(posKey)));
        setEnemy(t.state);
        setNote(null);
        // the 墨厄 strikes the player
        changeHp(-t.hurt);
        liEvaluate(trioRef.current, hpRef.current, maxHp); // t516 將進酒: arm for the NEXT player hand
        await wait(motion ? 1 : 260);
        setCracks(new Set());
      } else setEnemy(t.state);
    } else {
      setEnemy(forgetBroken(enemyRef.current, after));
    }
    busy.current = false;
    // 破厄 ends the fight at once (win); 氣血 0 or the lamp out ends it as a loss. Goals never end it.
    if (fightOutcome({ defeated: enemyRef.current.defeated, hp: hpRef.current, lamp: story ? (enemyRef.current.lamp ?? 0) : null })) finish(acc);
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
  useEffect(() => {
    if (phase === "done" || phase === "intro") { equipmentRelease.current?.(); equipmentRelease.current = null; }
  }, [phase]);
  const playable = phase === "play";

  return (
    <>
      <div className="ink-bar safe-top flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          className="ink-ghost flex min-h-11 w-[5.5rem] shrink-0 items-center gap-1 rounded-full px-3 text-sm"
          onClick={onMap}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {tower || story || raid ? "返回" : "地圖"}
        </button>
        <div className="min-w-0 text-center" data-testid={tower ? "sg-floor-head" : undefined}>
          <p className="ink-title font-serif text-lg leading-tight">
            {raid ? RAID_TIER_NAME[raid.enc.tier] : story ? story.event.name : tower ? tower.title : `第 ${def.id} 關`}
          </p>
          <p className="text-[0.7rem] tracking-widest text-muted">
            {raid ? `鎮厄司 · ${raid.enc.enemy.name}` : story ? `卷${story.event.volume}《${story.event.volumeTitle}》` : tower ? tower.sub : chapter?.name}
          </p>
        </div>
        {/* t439u: no HP pill up here — 氣血 lives only on the bottom bar. Spacer keeps the title centred. */}
        <div className="w-[5.5rem] shrink-0" aria-hidden data-testid="m3-head-spacer" data-acts={acts} />
      </div>

      <EnemyPanel
        def={enemyDef}
        state={enemy}
        hit={hitFx}
        attack={attackFx}
        lampKind={lampRule ? JADE_NAMES[lampRule.kind] : undefined}
        note={note}
      />
      <TeamDock
        members={team.map((id) => ({
          id,
          energy: members[id]?.energy ?? 0,
          cost: costOf(id),
          uses: members[id]?.uses ?? 0,
        }))}
        ready={phase === "play" && hp > 0}
        chain={chainIds}
        onActivate={(id) => void activate(id)}
        artifacts={teamArtifacts}
      />
      <div
        className={cn(
          "jade-board m3-board m3-board-wide relative mx-auto mt-1.5 w-[calc(100%-0.75rem)] shrink-0 touch-none rounded-2xl",
          shuffle && "m3-shuffle",
          boardHit > 0 && "cb-board-hit",
        )}
        data-testid="m3-board"
        data-busy={phase === "busy" ? "1" : "0"}
        data-phase={phase}
        style={
          {
            aspectRatio: `${cols} / ${rows}`,
            maxWidth: `min(100%, calc((100dvh - var(--m3-chrome, 19rem)) * ${cols} / ${rows}))`,
            "--cols": cols,
            "--rows": rows,
          } as CSSProperties
        }
        // Desktop mice: a jade <img> could start a native drag, which cancels the pointer (swipe lost).
        onDragStart={(event) => event.preventDefault()}
        onPointerCancel={() => {
          origin.current = null;
        }}
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
            const hinted =
              hint &&
              ((hint[0].r === r && hint[0].c === c) || (hint[1].r === r && hint[1].c === c));
            return (
              <div
                key={p.id}
                className={cn(
                  "m3-cell absolute grid place-items-center",
                  selected && "jade-picked z-10",
                  hinted && "m3-hint",
                )}
                data-r={r}
                data-c={c}
                data-kind={shown.kind}
                data-special={shown.special ?? ""}
                data-sealed={board.seal[r]![c]! || undefined}
                style={{
                  ...cellStyle(r, c, rows, cols),
                  transform: shift({ r, c }, nudge, drop.map.get(p.id) ?? 0, drop.live),
                  transition: placing
                    ? "none"
                    : moving
                      ? `transform ${step}ms cubic-bezier(.3,.7,.4,1.05)`
                      : "none",
                }}
              >
                <div
                  className={cn(
                    "m3-piece",
                    popping && "m3-pop",
                    forge.has(p.id) && "m3-forge",
                    gifts.has(`${r},${c}`) && "m3-gift",
                    shown.special && `m3-sp m3-sp-${shown.special}`,
                  )}
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
                data-vein={level === 1 && veins.has(`${r},${c}`) ? "1" : undefined}
                className={cn(
                  "m3-seal",
                  level > 1 ? "m3-seal-ice" : "m3-seal-ink",
                  level === 1 && veins.has(`${r},${c}`) && "m3-seal-vein",
                  cracks.has(`${r},${c}`) && "m3-crack",
                )}
                style={
                  level === 1 && veins.has(`${r},${c}`)
                    ? ({ ...cellStyle(r, c, rows, cols), "--vx": `${(c % 3) * 50}%`, "--vy": `${(r % 3) * 50}%`, "--vo": veinOrigin(r, c, veins) } as CSSProperties)
                    : cellStyle(r, c, rows, cols)
                }
                aria-hidden
              />
            ) : null,
          ),
        )}
        {fx ? (
          <Effects key={fx.key} effects={fx.effects} shatter={fx.shatter} rows={rows} cols={cols} />
        ) : null}
        {floats.map((f) => (
          <span
            key={f.id}
            className={cn("m3-float", f.big && "m3-float-big", f.tone && `m3-float-${f.tone}`)}
            data-tone={f.tone}
            style={{
              left: `${((f.c + 0.5) * 100) / cols}%`,
              top: `${((f.r + 0.5) * 100) / rows}%`,
            }}
            aria-hidden
          >
            {f.text}
          </span>
        ))}
      </div>

      {/* 過關條件 = 打倒墨厄; the bottom bar is the player's own 氣血 (t437u), never goal chips or score lines. */}
      <div
        className={cn(
          "m3-hud m3-hud-compact m3-hp-hud mx-auto mt-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-xl px-2.5 py-1",
          hp <= maxHp * 0.25 && "m3-hp-hud-low",
          hpHit?.kind === "hurt" && "m3-hp-hurt",
          hpHit?.kind === "heal" && "m3-hp-heal",
        )}
        key={`hud-${hpHit?.key ?? 0}`}
        data-testid="m3-hud"
        data-hp={hp}
        data-maxhp={maxHp}
      >
        <span className="m3-hp-hud-label shrink-0 text-xs font-semibold">氣血</span>
        <div
          className="cb-hp m3-hp-track relative h-3.5 min-w-0 flex-1 rounded-full"
          data-testid="m3-hp-bar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={maxHp}
          aria-valuenow={hp}
          aria-label={`你的氣血 ${hp}/${maxHp}`}
        >
          <span className="m3-hp-fill" style={{ width: `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%` }} />
          <span className="cb-hp-text tabular-nums">
            {hp}/{maxHp}
          </span>
        </div>
        <span className="shrink-0 text-[0.65rem] tabular-nums text-muted" data-score={progress.score}>
          分 {progress.score}
        </span>
      </div>
      <ComboBanner combo={combo} />
      {teamPicking && phase === "intro" ? <TeamPicker onClose={() => setTeamPicking(false)} /> : null}
      {coach ? (
        <CombatCoach
          hint={allMoves(boardRef.current)[0] ?? null}
          rows={rows}
          cols={cols}
          onDone={() => {
            setCoach(false);
            useSave.getState().markCoachSeen(COACH_VERSION);
          }}
        />
      ) : null}
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

      {phase === "intro" && !teamPicking ? (
        <Intro
          def={def}
          best={record}
          onStart={begin}
          onMap={raid ? raid.onLeave : story ? story.onLeave : onMap}
          tower={tower}
          story={story}
          raid={raid}
          enemy={enemyDef}
          team={team}
          onEditTeam={() => setTeamPicking(true)}
        />
      ) : null}
      {phase === "done" && result && story ? (
        <StoryDone
          event={story.event}
          won={result.won}
          reason={result.reason ?? ""}
          onRetry={() => onPlay(def.id)}
          onLeave={story.onLeave}
        />
      ) : null}
      {phase === "done" && result && raid ? (
        <RaidDone raid={raid} result={result} win={raidWin} onRetry={() => onPlay(def.id)} />
      ) : null}
      {phase === "done" && result && !story && !raid ? (
        <LevelDone
          def={def}
          result={result}
          progress={progress}
          muted={muted}
          onMap={onMap}
          onRetry={() => onPlay(def.id)}
          onNext={() => onPlay(def.id + 1)}
          tower={tower}
        />
      ) : null}
    </>
  );
}

/** Where a 墨紋 cell's smoke-creep bloom starts: the side of an already-inked neighbour (so it reads as spreading). */
function veinOrigin(r: number, c: number, veins: Set<string>): string {
  if (veins.has(`${r},${c - 1}`)) return "0% 50%";
  if (veins.has(`${r},${c + 1}`)) return "100% 50%";
  if (veins.has(`${r - 1},${c}`)) return "50% 0%";
  if (veins.has(`${r + 1},${c}`)) return "50% 100%";
  return "50% 50%";
}

function cellStyle(r: number, c: number, rows: number, cols: number): CSSProperties {
  return {
    width: `${100 / cols}%`,
    height: `${100 / rows}%`,
    left: `${(c * 100) / cols}%`,
    top: `${(r * 100) / rows}%`,
  };
}

function shift(cell: Pos, nudge: Nudge | null, drop: number, live: boolean): string {
  let x = 0;
  let y = !live && drop > 0 ? -drop * 100 : 0;
  if (nudge && nudge.on) {
    const dc = nudge.to.c - nudge.from.c;
    const dr = nudge.to.r - nudge.from.r;
    const sign =
      cell.r === nudge.from.r && cell.c === nudge.from.c
        ? 1
        : cell.r === nudge.to.r && cell.c === nudge.to.c
          ? -1
          : 0;
    x = dc * 100 * sign;
    y += dr * 100 * sign;
  }
  return x || y ? `translate(${x}%, ${y}%)` : "none";
}

export function Jade({ kind }: { kind: number }) {
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
const LONGZHU_SVG =
  '<defs><radialGradient id="@aura" r="50" cx="0" cy="0" gradientUnits="userSpaceOnUse"><stop offset="0.78" stop-color="#ffdc8e" stop-opacity="0.42"/><stop offset="0.9" stop-color="#e2b257" stop-opacity="0.12"/><stop offset="1" stop-color="#e2b257" stop-opacity="0"/></radialGradient><radialGradient id="@body" cx="0.4" cy="0.33" r="0.75"><stop offset="0" stop-color="#2b6e50"/><stop offset="0.3" stop-color="#164a35"/><stop offset="0.62" stop-color="#0b2c1f"/><stop offset="0.88" stop-color="#05170f"/><stop offset="1" stop-color="#020a06"/></radialGradient><radialGradient id="@glow" cx="0.6" cy="0.72" r="0.46"><stop offset="0" stop-color="#3fcf94" stop-opacity="0.42"/><stop offset="0.55" stop-color="#2a9e6c" stop-opacity="0.14"/><stop offset="1" stop-color="#2a9e6c" stop-opacity="0"/></radialGradient><radialGradient id="@cloud" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#7fe0b4" stop-opacity="0.2"/><stop offset="1" stop-color="#7fe0b4" stop-opacity="0"/></radialGradient><radialGradient id="@veil" cx="0.5" cy="0.5" r="0.5"><stop offset="0.6" stop-color="#020c07" stop-opacity="0"/><stop offset="0.9" stop-color="#020c07" stop-opacity="0.45"/><stop offset="1" stop-color="#020c07" stop-opacity="0.8"/></radialGradient><linearGradient id="@g" x1="-30" y1="-30" x2="26" y2="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff2c2"/><stop offset="0.28" stop-color="#f3cd68"/><stop offset="0.55" stop-color="#d9a240"/><stop offset="0.8" stop-color="#b07a26"/><stop offset="1" stop-color="#8a5a18"/></linearGradient><radialGradient id="@gs" cx="-12" cy="-16" r="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffbe6" stop-opacity="0.55"/><stop offset="1" stop-color="#fffbe6" stop-opacity="0"/></radialGradient><linearGradient id="@rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d2"/><stop offset="0.25" stop-color="#e6bb5c"/><stop offset="0.5" stop-color="#8c5c1c"/><stop offset="0.75" stop-color="#f3d58c"/><stop offset="1" stop-color="#6e4410"/></linearGradient><radialGradient id="@spec" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><linearGradient id="@glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eafff5" stop-opacity="0.2"/><stop offset="0.42" stop-color="#eafff5" stop-opacity="0"/></linearGradient><clipPath id="@clip"><circle r="39"/></clipPath><path id="@d" d="M-1.5 32.3C-1.9 32 -2.5 31 -2.5 30.7C-2.5 29.9 -3.6 28.7 -4.3 28.7C-4.5 28.7 -5.2 29.2 -5.2 29.5C-5.2 29.6 -4.9 29.7 -4.6 29.7C-3.8 29.7 -3.6 30.2 -4.2 30.7C-4.9 31.4 -6.2 30.2 -5.9 29C-5.2 26.3 -1.2 26.1 0.6 28.7C1.6 30.2 4.1 31.4 5.3 31C7 30.3 7.2 28.7 5.8 27.2C2.2 23.3 1.6 17.7 4.5 14.5C6.8 12 10.6 12 13.6 14.5C17.9 18 15.7 25.2 10.3 25.2C7.9 25.2 6.4 23.9 5.6 21.3C5.2 20 6.8 17.5 8.3 17.1C11.1 16.4 13.4 20.1 11.3 21.7C9.5 23.1 7.2 21.1 8.7 19.4C9.4 18.6 10.9 19.4 10.4 20.4C10.2 20.7 10.2 20.7 10.2 20.3C10.2 19.4 9.3 19.2 8.7 19.8C8 20.5 8.5 21.6 9.5 21.6C11.2 21.6 11.9 19.5 10.5 18.4C9.2 17.3 7 18.3 6.6 20.2C6.2 22.5 9.1 24.6 11.2 23.5C15.5 21.3 13.8 15.6 9 15.6C4.1 15.5 2.5 22.8 6.7 25.5C7.9 26.3 10.7 26.7 12 26.3C12.5 26.1 12.7 26.2 13.5 26.5C15.8 27.6 21.4 27.1 21.4 25.9C21.4 25.8 21.2 25.8 20.8 25.9C19.1 26.3 16.2 26.1 15.9 25.6C15.9 25.5 16 25.3 16.3 25L16.7 24.6L17.3 25C19.8 26.7 23.6 24.4 23 21.7C22.7 20.6 21.6 20.1 21.3 21C21.2 21.3 21.4 21.5 21.8 21.7C22.5 22 21.7 22.6 20.8 22.4C19 22.1 19.4 19.5 21.3 18.7C24.9 17.2 26.5 23.6 23.2 25.8C22.9 26 22.3 26.4 21.8 26.7C21.3 27.1 20.7 27.4 20.4 27.4C20.1 27.5 19.4 27.6 19 27.8C18.5 27.9 17.3 28 16 28C12.9 28 12.2 28.2 12.2 29.4C12.2 30.7 14.1 31.1 14.5 29.8C14.6 29.4 14.8 29.4 15.2 29.8C15.9 30.5 15.4 31.1 13.9 31.9L12.8 32.4L7.9 32.4C4.2 32.4 3 32.4 2.7 32.2C1.9 31.7 1.3 31.7 1.2 32C1 32.5 -0.9 32.8 -1.5 32.3ZM-12.1 31.7C-13 31.4 -13.4 31 -13.5 30.1C-13.6 29.3 -13.3 29 -12.9 29.5C-12.8 29.8 -11.9 29.7 -11.6 29.4C-11 28.6 -11.8 27.3 -13.9 25.6C-16.4 23.7 -20.3 20.1 -21.3 18.8C-23 16.5 -24.3 14.3 -24.5 13C-24.6 12.1 -24.4 12.1 -24 13C-22.5 16.7 -19.2 20.5 -16.2 22.2C-16 22.3 -15.6 22.6 -15.3 22.8C-15 23 -14.1 23.6 -13.3 23.9C-11.9 24.6 -11.7 24.8 -11.2 25.5C-10 27.7 -10 30 -11.4 30.5C-11.6 30.6 -11.6 30.7 -11.4 30.8C-11.1 31.1 -10.4 30.8 -10 30.1C-9.6 29.4 -9.6 27.8 -9.9 26.6C-10.2 25.6 -10.1 25.4 -9.4 25.6C-8.5 25.7 -8.3 26.3 -8.3 28C-8.3 30.8 -10 32.5 -12.1 31.7ZM-7.5 24.5C-9.6 24.2 -11.7 23.6 -13.3 22.9C-14.1 22.5 -14.8 22.1 -14.9 22.1C-15.1 22.1 -16.4 21.2 -17.7 20.2C-19.1 19.2 -20.5 17.3 -22 14.6C-22.8 13.2 -23.8 10 -23.5 9.9C-23.5 9.9 -22.9 9.9 -22.3 9.8C-21.7 9.8 -20.7 9.6 -20.1 9.4C-18.9 9 -18.8 9.1 -18.6 10C-18.4 11.6 -17.7 13 -16.7 14C-15.7 14.9 -15.2 15.2 -13.3 15.7C-11.2 16.3 -10.3 17.6 -11.7 17.9C-12.3 18 -12.3 18.1 -11.8 18.8C-10.7 20 -8.4 18.9 -8.4 17.1C-8.3 15.8 -9.1 14.5 -10.5 13.4L-11 13L-10.8 12.3C-10 10.4 -12.3 8.3 -13.8 9.6C-15.1 10.8 -13.9 13 -12.3 12.2C-11.9 12 -11.8 12 -11.9 12.1C-12.1 12.8 -13.9 13 -14.8 12.4C-15.5 11.9 -16 10.4 -16 9C-16 7.7 -15.7 6.6 -14.7 4.7C-14.3 3.9 -14.1 2.5 -14.4 2.3C-14.5 2.3 -14.9 2.9 -15.3 3.7C-16.8 6.7 -19.9 8.9 -22.6 8.9C-24.2 8.9 -25.8 8.1 -26.9 6.9C-27.4 6.3 -28.7 3.7 -28.7 3.3C-28.7 2.9 -29.3 3.2 -29.4 3.7C-29.7 4.4 -29.5 5.6 -28.6 8.3C-27.7 11.5 -27.7 11.5 -28 12.1C-28.3 12.7 -28.7 12.9 -29.5 12.9C-30.1 12.9 -30.2 12.8 -29.8 12.2C-29.4 11.6 -29.6 9.9 -30.1 8C-30.9 5.4 -31.1 4.8 -31.2 3.6C-31.3 2.2 -31 1 -30.2 0C-29.1 -1.3 -28.8 -2.4 -29.4 -2.9C-30 -3.6 -30.7 -3.2 -30.1 -2.6C-29.5 -1.8 -30.6 -1.3 -31.2 -2C-32.2 -3 -30.6 -4.5 -29 -4.1C-27.5 -3.8 -26.9 -2.7 -26.6 -0.1C-26.3 2.8 -25.7 3.6 -23.4 3.9C-18.5 4.7 -14.1 1.4 -15.2 -2.3C-16.1 -5.3 -19.9 -6.1 -21.5 -3.7C-22.2 -2.7 -22.2 -2.1 -21.6 -0.9C-20.5 1.2 -17.5 0.7 -17.5 -1.6C-17.5 -2.6 -17.7 -2.9 -18.5 -3C-19.1 -3.1 -19.2 -3 -18.8 -2.5C-18 -1.5 -19.3 -0.4 -20.3 -1.2C-20.9 -1.6 -20.9 -2.9 -20.3 -3.4C-19.7 -4 -18.3 -4.1 -17.6 -3.6C-15.4 -2.1 -16 0.8 -18.7 1.7C-23.5 3.6 -27 -2.3 -23.3 -6.1C-21 -8.5 -17.8 -8.7 -12.8 -6.8C-10.8 -6.1 -9.9 -5.9 -6.9 -5.8C-2.1 -5.6 0.8 -7.2 1.6 -10.3C1.9 -11.7 2.2 -11.2 2.2 -9.1C2.3 -5 -1 -2.6 -6.8 -2.6C-10.3 -2.6 -12.9 0.3 -12.9 4C-12.9 6.7 -12.2 8.1 -10.2 9.6C-9.3 10.4 -8.9 10.5 -7.4 11C-6.5 11.2 -1.9 11.2 -0.5 10.9C0.1 10.8 1.5 10.4 2.7 10C8 8.2 12.6 8.3 15.2 10.2C16 10.8 16.2 10.7 16.6 9.9C18.2 6.1 23.8 5.8 25.1 9.4C26.3 12.7 23.3 15.6 21.1 13.4C20.4 12.6 20.2 12.1 20.6 11.4C20.8 11.1 21.2 11 21.2 11.3C21.2 12.1 22.3 12.3 22.9 11.8C23.9 10.8 22.9 9.1 21.3 9.1C18.1 9.1 17.7 13.9 20.8 15.4C24.4 17.3 27.5 15.3 27.5 11.1C27.5 7.5 25.9 6.1 17.2 1.7C16.4 1.3 14.2 -0.2 13.9 -0.6C13.8 -0.8 13.3 -1.4 12.9 -1.9C12.4 -2.4 12 -2.9 12 -3C12 -3.1 11.8 -3.5 11.6 -3.9C9.1 -8.6 13.2 -15.9 18.5 -15.9C20.7 -15.9 23.3 -14.2 24.4 -12.1C25.1 -10.8 25.1 -8.2 24.4 -7C22.1 -3 16.2 -4 16.2 -8.5C16.2 -11.3 19.9 -12.6 21.3 -10.5C22.6 -8.6 20.7 -6.5 18.9 -7.6C17.6 -8.3 18.6 -10.4 19.9 -9.8C20.3 -9.6 20.3 -9.6 19.7 -9.4C18.7 -9 18.6 -7.9 19.6 -7.7C21.2 -7.3 21.9 -9 20.7 -10.1C19.2 -11.6 17 -10.2 17.3 -8C17.5 -6 20.3 -4.9 22 -6.2C24.6 -8.2 23.7 -12.3 20.3 -13.1C16.9 -14 13.9 -11.6 14 -8C14 -5.6 15.7 -3.7 19 -2.1C19.6 -1.9 20.5 -1.4 21.2 -1C21.8 -0.6 22.4 -0.3 22.5 -0.3C22.6 -0.3 24.8 1.1 25 1.3C25.1 1.4 25.4 1.7 25.6 1.8C27.6 3 30.1 6 31 8.1L31.6 9.5L31.5 11.7C31.5 13.8 31.4 13.9 30.9 15.1C29.5 18.1 26 20.4 25.2 19C24.4 17.9 22 17.5 20.4 18.3C20 18.5 19.6 18.6 19.2 18.5C18.7 18.4 18.7 18.4 18.3 20C17.9 21.4 17.2 22.7 16.4 23.6C15.4 24.6 15.3 24.5 16.1 22.9C19.7 15.2 11.5 7.9 4.3 12.5C1.3 14.4 0 18.4 0.9 22.5C1.3 23.8 1.3 23.8 0.1 24.1C-1.9 24.6 -5 24.7 -7.5 24.5ZM-9.8 17.2C-10.1 16.3 -10.3 16 -10.7 15.5C-11 15.2 -11.5 14.9 -11.9 14.8C-12.2 14.8 -12.5 14.6 -12.5 14.5C-12.6 14.2 -12 14.2 -11.5 14.6C-11.3 14.7 -10.9 15 -10.7 15.1C-9.9 15.4 -9.1 16.9 -9.5 17.3C-9.6 17.5 -9.7 17.4 -9.8 17.2ZM-5.9 10.6C-7.8 10.4 -10.1 8.7 -11.3 6.8C-12.3 5.2 -12.1 2 -10.9 0.7C-10.4 0.2 -10.4 0.4 -10.5 2.4C-10.6 5.6 -9.6 7.3 -6.7 8.8C-5.2 9.6 -1.7 9.6 -0.5 8.9C1.2 7.9 1.9 6 1 4.9C0.3 4 -2 4.5 -2 5.6C-2 6.4 -1.1 6.9 -0.7 6.3C-0.1 5.7 0 6.6 -0.5 7.3C-1.6 8.7 -4.5 8.1 -5.3 6.4C-6.4 4.2 -5.4 1.8 -3.1 0.8C-1 -0.1 1.7 1 2 2.9C2 3.4 2.2 3.7 2.5 3.8C3.1 4.1 3.3 4.7 3.3 5.9C3.3 9.1 -1 11.3 -5.9 10.6ZM-12.4 10.4C-12.6 10.3 -12.9 10.3 -13.1 10.4C-13.3 10.4 -13.4 10.4 -13.3 10.3C-13.2 9.8 -11.9 10 -11.9 10.5C-11.9 10.7 -12 10.6 -12.4 10.4ZM-3.3 -1.4C-4 -1.6 -4.1 -1.7 -3.7 -1.8C-1.9 -2.1 -1.4 -2.3 -0.4 -2.8C5.2 -5.5 4.2 -15.3 -1.7 -15.3C-3.3 -15.3 -4 -14.6 -4 -13.2C-4 -11.7 -3.4 -11.1 -2 -11.1C-0.8 -11.1 -0.1 -12.5 -0.9 -13.1C-1.4 -13.5 -1.9 -13.3 -1.9 -12.7C-1.9 -12.1 -2.2 -12 -2.6 -12.4C-3.3 -13.1 -2.5 -14.3 -1.4 -14.3C1.1 -14.3 1.4 -10.1 -1.1 -8.7C-2.5 -7.8 -3.9 -8 -5.2 -9.1C-6.4 -10.1 -6.7 -11.2 -6.3 -13.6C-6.3 -13.9 -6.5 -14.1 -7.1 -14.6C-8.1 -15.4 -8.5 -16.2 -8.2 -17.4C-7.8 -19 -6.2 -19.8 -5.1 -19C-4.5 -18.4 -4.5 -18.1 -5.3 -18.2C-7 -18.6 -6.6 -16.5 -4.8 -15.9C-1.9 -15.1 2.2 -16.6 3.2 -18.9C4.7 -22.4 0.5 -25.7 -1.7 -22.7C-2.8 -21.3 -1.5 -19 0.1 -19.6C0.5 -19.7 0.4 -20.1 -0.2 -20.4C-1.2 -20.9 -0.7 -22.5 0.6 -22.5C2.3 -22.5 2.5 -19.9 0.8 -19C-2.4 -17.2 -7 -20.5 -7.8 -25.3C-8 -26.7 -8.3 -26 -8.3 -23.9C-8.2 -22.5 -8.3 -22 -8.4 -22C-8.7 -22 -10 -23 -10 -23.2C-10 -23.3 -10.2 -23.7 -10.3 -24C-11.9 -26.9 -10.6 -30.2 -7.4 -31.8L-6.1 -32.4L-5.5 -32.1C-4.4 -31.5 -3.9 -31 -3.7 -30.4C-3.2 -29.1 -4.2 -28.1 -5.4 -28.6C-5.8 -28.7 -5.7 -29.3 -5.3 -29.4C-4.9 -29.5 -4.9 -30.1 -5.4 -30.3C-6 -30.7 -6.8 -30 -6.8 -29.2C-6.7 -28.2 -6.2 -27.8 -4.7 -27.4C-0.6 -26.5 0.8 -26 2.9 -24.6C4 -24 6.1 -22.3 6.4 -21.9C6.4 -21.8 6.9 -21.3 7.3 -20.7C11.9 -15 10 -5.7 3.7 -2.5C1.8 -1.6 -1.7 -1 -3.3 -1.4ZM5.2 -5.1C6 -5.7 7.1 -7.9 7.6 -9.7C8.7 -13.4 7.8 -18 5.6 -20.5C4.6 -21.6 4.5 -21.5 4.5 -20C4.5 -18.8 4.5 -18.7 5.1 -18.1C6.6 -16.1 7.6 -11.5 6.8 -9.7L6.6 -9.2L6.5 -10.1C6.1 -12.8 4.7 -16.2 3.9 -16.7C3.6 -16.9 3.5 -16.9 3.1 -16.6C2.3 -16 2.3 -15.7 2.8 -15.1C5.2 -12.2 5.8 -9.3 4.7 -6C4.2 -4.3 4.3 -4.2 5.2 -5.1ZM-27.7 -6C-28 -6.5 -27.9 -7.8 -27.5 -8.7C-26.9 -9.8 -26 -11.3 -25.6 -12C-25 -12.9 -24.6 -14.2 -24.6 -15.4C-24.5 -16.5 -24.5 -16.6 -23.4 -18C-22.4 -19.3 -21.5 -20.2 -20.5 -20.8C-19.6 -21.3 -19.5 -21.5 -20.1 -21.5C-21 -21.5 -25.1 -18 -25.1 -17.3C-25.1 -17 -26.6 -16.3 -27 -16.4C-28 -16.6 -28.2 -18 -27.2 -18C-26.3 -18.1 -25.5 -18.7 -23.6 -20.6C-20.9 -23.3 -19.6 -23.9 -17.5 -23.4C-16.1 -23 -15.5 -23.2 -15.4 -24C-15.3 -24.5 -15.6 -24.6 -15.9 -24.2C-16.1 -23.9 -16.7 -24 -16.9 -24.3C-17.1 -24.6 -17 -24.7 -16.7 -25.1C-15.6 -26.2 -13.9 -24.6 -14.1 -22.6C-14.2 -20.9 -15.5 -20.1 -18.1 -20.1C-20 -20.1 -20.9 -19.7 -21.6 -18.4C-22.6 -16.4 -23.2 -14 -22.9 -12.5C-22.8 -11.4 -22.3 -11.2 -19.2 -10.9C-16.4 -10.6 -15.6 -10.3 -14.5 -9.2C-13.5 -8.3 -13.6 -8.1 -15 -8.6C-17 -9.4 -20.5 -9.2 -22.4 -8.2L-23.5 -7.6L-24.2 -8C-25.9 -8.7 -27.3 -7.8 -27 -6.1C-26.9 -5.5 -27.3 -5.4 -27.7 -6ZM25.1 -13.5C24.8 -13.8 25 -14.1 25.6 -14.1C26.7 -14.1 28.6 -15.7 28.5 -16.4C28.5 -16.9 28.1 -17.1 28.1 -16.7C28.1 -15.8 26.7 -15 24.9 -14.8C23.7 -14.7 23.6 -14.8 22.4 -15.4C21.8 -15.8 20.9 -16.2 20.5 -16.3C20.1 -16.4 19.7 -16.6 19.7 -16.6C19.7 -16.9 21.7 -16.8 23.2 -16.4C25.1 -15.9 26.4 -15.8 26.8 -16.3C27.2 -16.7 27.1 -17.4 26.7 -17.7C26.2 -18 26.6 -18.5 27.5 -18.5C29.7 -18.6 30.1 -15.6 28.1 -13.9C27.2 -13.1 25.7 -12.9 25.1 -13.5ZM10.8 -17.3C10.5 -17.5 9.8 -19 9.9 -19.1C10 -19.1 10.6 -19.1 11.3 -19C14.1 -18.6 16.6 -19.8 16.5 -21.5C16.4 -22.3 16.2 -22.3 15.8 -21.4C15.2 -20.2 13.4 -19.6 11.6 -20C9.7 -20.3 8.8 -20.7 8.4 -21.2C6.9 -23 4.4 -25 2 -26.4L1.4 -26.7L1.9 -26.8C2.5 -26.9 5.4 -25.5 7.8 -23.9C10.1 -22.3 12.5 -21.1 13.2 -21.1C13.8 -21.1 14.9 -22 14.9 -22.5C14.9 -22.7 14.6 -23.1 14.3 -23.4L13.7 -24L14.3 -24.2C17.5 -25.6 19.3 -20.8 16.4 -18.5C14.9 -17.3 11.9 -16.7 10.8 -17.3Z"/><linearGradient id="@shn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#f4fff8" stop-opacity="0.34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><circle class="m3-lz-aura" r="50" fill="url(#@aura)"/><ellipse cx="0" cy="3" rx="41.5" ry="40.5" fill="#000" opacity="0.5"/><circle r="40" fill="url(#@body)"/><circle r="40" fill="url(#@glow)"/><g clip-path="url(#@clip)"><ellipse cx="-14" cy="12" rx="22" ry="11" transform="rotate(-28 -14 12)" fill="url(#@cloud)"/><ellipse cx="16" cy="-12" rx="20" ry="8" transform="rotate(34 16 -12)" fill="url(#@cloud)" opacity="0.8"/><ellipse cx="8" cy="22" rx="16" ry="6" transform="rotate(-12 8 22)" fill="url(#@cloud)" opacity="0.7"/><path d="M-36 8C-28 2 -22 12 -12 8C-4 5 2 -6 12 -4C20 -2 26 -10 37 -6" fill="none" stroke="#a4eccb" stroke-opacity="0.07" stroke-width="3.2" stroke-linecap="round"/><path d="M-31 -22C-25 -17 -17 -24 -9 -20C-1 -16 7 -27 16 -24" fill="none" stroke="#a4eccb" stroke-opacity="0.06" stroke-width="2.4" stroke-linecap="round"/><path d="M-26 27C-18 22 -10 31 0 27C8 24 15 33 26 26" fill="none" stroke="#a4eccb" stroke-opacity="0.06" stroke-width="2" stroke-linecap="round"/><path d="M-35 -4C-28 -9 -20 -2 -13 -7C-7 -11 0 -5 6 -9M10 30C17 26 22 31 30 24" fill="none" stroke="#010806" stroke-opacity="0.3" stroke-width="0.4" stroke-linecap="round"/><circle cx="-6" cy="16" r="1.6" fill="#7fe0b4" opacity="0.08"/><circle cx="20" cy="6" r="2.4" fill="#7fe0b4" opacity="0.06"/></g><g class="drg"><use href="#@d" transform="translate(0.6 0.8)" fill="#010805" opacity="0.7"/><use href="#@d" transform="translate(-0.3 -0.3)" fill="#fff0c4" opacity="0.55"/><use href="#@d" fill="url(#@g)" stroke="#6a400e" stroke-width="0.35" stroke-linejoin="round"/><use class="m3-lz-gold" href="#@d" fill="url(#@gs)"/></g><g clip-path="url(#@clip)"><g transform="rotate(28)"><rect class="m3-lz-sheen" x="-7" y="-48" width="14" height="96" fill="url(#@shn)"/></g></g><circle r="40" fill="url(#@veil)"/><circle r="39" fill="url(#@glass)"/><path d="M-30.5 -14A33 33 0 0 1 -12 -31.5" fill="none" stroke="#fff" stroke-opacity="0.32" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="-18" cy="-21" rx="8" ry="3.6" transform="rotate(-42 -18 -21)" fill="url(#@spec)" opacity="0.9"/><circle class="m3-lz-glint" cx="-21.5" cy="-19" r="1.1" fill="#fff"/><path d="M14 33A36 36 0 0 0 33 15" fill="none" stroke="#c6ffe4" stroke-opacity="0.3" stroke-width="1.1" stroke-linecap="round"/><circle r="41.3" fill="none" stroke="#1e1104" stroke-opacity="0.9" stroke-width="0.7"/><circle r="40.5" fill="none" stroke="url(#@rim)" stroke-width="1.5"/><circle r="39.55" fill="none" stroke="#2a1806" stroke-opacity="0.7" stroke-width="0.35"/><circle r="39.1" fill="none" stroke="url(#@rim)" stroke-width="0.5" opacity="0.9"/>';
export function Pearl() {
  const u = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const html = useMemo(() => LONGZHU_SVG.replaceAll("@", `lz${u}`), [u]);
  return (
    <span className="m3-pearl" aria-hidden>
      <svg className="m3-lz" viewBox="-50 -50 100 100" dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  );
}

export function Effects({
  effects,
  shatter,
  rows,
  cols,
}: {
  effects: Effect[];
  shatter: Pos[];
  rows: number;
  cols: number;
}) {
  const cx = (c: number) => ((c + 0.5) * 100) / cols;
  const cy = (r: number) => ((r + 0.5) * 100) / rows;
  return (
    <div
      className="m3-fx pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      aria-hidden
    >
      {effects.map((e, i) => {
        if (e.type === "row")
          return (
            <span
              key={i}
              className="m3-beam m3-beam-h"
              style={
                {
                  top: `${(e.r * 100) / rows}%`,
                  height: `${100 / rows}%`,
                  "--o": `${cx(e.c)}%`,
                } as CSSProperties
              }
            />
          );
        if (e.type === "col")
          return (
            <span
              key={i}
              className="m3-beam m3-beam-v"
              style={
                {
                  left: `${(e.c * 100) / cols}%`,
                  width: `${100 / cols}%`,
                  "--o": `${cy(e.r)}%`,
                } as CSSProperties
              }
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
            <span
              className="m3-ripple"
              style={{ left: `${cx(e.c)}%`, top: `${cy(e.r)}%`, width: `${(400 / cols) * 1}%` }}
            />
            <svg
              className="m3-rays absolute inset-0 h-full w-full"
              viewBox={`0 0 ${cols} ${rows}`}
              preserveAspectRatio="none"
            >
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
              <span
                key={`t${k}`}
                className="m3-target"
                style={{
                  left: `${cx(t.c)}%`,
                  top: `${cy(t.r)}%`,
                  width: `${100 / cols}%`,
                  animationDelay: `${80 + k * 18}ms`,
                }}
              />
            ))}
          </span>
        );
      })}
      {shatter.map((p, i) => (
        <span
          key={`s${i}`}
          className="m3-shatter"
          style={{ left: `${cx(p.c)}%`, top: `${cy(p.r)}%`, width: `${100 / cols}%` }}
        />
      ))}
    </div>
  );
}

function StoryIntro({
  story,
  enemy,
  team,
  onStart,
  onEditTeam,
}: {
  story: StoryMode;
  enemy: EnemyDef;
  team: string[];
  onStart: () => void;
  onEditTeam: () => void;
}) {
  const e = story.event;
  return (
    <div
      className="m3-modal fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5"
      data-testid="story-event-intro"
    >
      <div className="m3-card cb-prep-card w-full max-w-sm rounded-2xl p-5 text-center">
        <p className="text-xs tracking-[0.3em] text-muted">
          卷{e.volume}《{e.volumeTitle}》· 特殊事件
        </p>
        <h2 className="mt-1 font-serif text-3xl tracking-[0.2em]">{e.name}</h2>
        <p className="mt-1 text-sm text-gold">{e.invite}</p>
        <div className="mt-3 space-y-1 text-left text-sm leading-relaxed text-muted">
          {e.intro.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <ul className="mt-3 space-y-1.5 text-left text-xs">
          <li className="m3-intro-goal rounded-xl px-3 py-1.5">
            燈火從 {e.lamp.start} 起，每回 −{e.lamp.decay}；每顆{JADE_NAMES[e.lamp.kind]} +
            {e.lamp.perJade}，發動技能 +{e.lamp.perCast}
          </li>
          <li className="m3-intro-goal rounded-xl px-3 py-1.5">
            燈火未滅之前擊退墨厄即成功；燈火或氣血歸零則失敗
          </li>
        </ul>
        <EnemyPreview def={enemy} />
        <TeamSlot team={team} onEdit={onEditTeam} />
        <p className="mt-2 text-[0.66rem] text-muted">
          劇情三消不發墨玉、不計星；可略過、失敗可重試，不影響主線。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line"
            onClick={story.onLeave}
            data-testid="story-event-skip"
          >
            略過互動
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-gold"
            onClick={onStart}
            data-testid="m3-start"
          >
            進入互動
          </button>
        </div>
      </div>
    </div>
  );
}

function Intro({
  def,
  best,
  onStart,
  onMap,
  tower,
  story,
  raid,
  enemy,
  team,
  onEditTeam,
}: {
  def: LevelDef;
  best?: { stars: number; best: number };
  onStart: () => void;
  onMap: () => void;
  tower?: TowerMode;
  story?: StoryMode;
  raid?: RaidMode;
  enemy: EnemyDef;
  team: string[];
  onEditTeam: () => void;
}) {
  const ice = (def.seal ?? []).join("").includes("2");
  const per = rewardPerStar(def.id);
  if (story)
    return (
      <StoryIntro
        story={story}
        enemy={enemy}
        team={team}
        onStart={onStart}
        onEditTeam={onEditTeam}
      />
    );
  if (raid)
    return (
      <RaidIntro
        raid={raid}
        def={def}
        enemy={enemy}
        team={team}
        onStart={onStart}
        onMap={onMap}
        onEditTeam={onEditTeam}
      />
    );
  return (
    <div
      className="m3-modal fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5"
      data-testid="m3-intro"
    >
      <div className="m3-card cb-prep-card w-full max-w-sm rounded-2xl p-5 text-center">
        <p className="text-xs tracking-[0.3em] text-muted">
          {tower ? tower.sub : CHAPTERS.find((c) => def.id >= c.from && def.id <= c.to)?.name}
        </p>
        <h2 className="mt-1 font-serif text-3xl tracking-[0.2em]">
          {tower ? tower.title : `第 ${def.id} 關`}
        </h2>
        {!tower && isChapterFinale(def.id) ? (
          <p
            className="m3-boss-badge mx-auto mt-2 w-fit rounded-full px-3 py-0.5 text-xs tracking-[0.25em]"
            data-testid="m3-finale"
          >
            章末關 · 難度提升
          </p>
        ) : null}
        <p className="mt-1 text-sm text-muted">
          氣血 {playerMaxHp(def.moves)} · 目前 {best?.stars ?? 0} / 3 星
        </p>
        <details className="cb-stage-details">
          <summary>關卡提示</summary>
          <ul className="mt-4 space-y-2 text-left">
            <li
              className="m3-intro-goal flex items-center gap-2 rounded-xl px-3 py-2"
              data-testid="m3-intro-clear"
            >
              <span className="m3-goal-score h-7 w-7">厄</span>
              <span>過關條件：打倒{enemy.name}即過關；氣血歸零則失敗</span>
            </li>
          </ul>
          {ice ? <p className="mt-2 text-xs text-muted">冰封要碰兩次：先碎冰，再破墨。</p> : null}
          {(enemy.spread ?? 0) > 0 ? (
            <p className="m3-intro-vein mt-2 text-xs" data-testid="m3-intro-vein">
              第 40
              關起，沒化開的墨紋每回都會向旁邊延伸鎖玉。化開方式與墨封相同——在它身上或旁邊連線。
            </p>
          ) : null}
        </details>
        <EnemyPreview def={enemy} />
        <TeamSlot team={team} onEdit={onEditTeam} />
        <details className="cb-prep-details">
          <summary>評星、獎勵與戰鬥補助</summary>
          <div className="mt-4 flex items-center justify-center gap-4 text-sm tabular-nums">
            <span className="text-muted">評星</span>
            <span className="text-muted">★★ {def.stars[0]}</span>
            <span className="text-muted">★★★ {def.stars[1]}</span>
          </div>
          <p className="mt-1 text-xs text-muted" data-testid="m3-intro-hp">
            墨厄出手會傷你的氣血，消{HEAL_JADE_NAME}每顆 +{PLAYER.healPerJade}{" "}
            血；過關時餘血折算加分（滿血最多 +{def.moves * moveBonusPer(def.id)}）
          </p>
          {tower ? (
            <p className="mt-2 text-sm text-muted">{tower.intro}</p>
          ) : (
            <p className="mt-2 flex items-center justify-center gap-1 text-sm">
              {best?.stars ? (
                <>
                  已得 <span className="text-gold">{"★".repeat(best.stars)}</span> ·{" "}
                  {best.stars < 3 ? "補星再得每星" : "重玩"} <MoYu label />{" "}
                  {best.stars < 3 ? per : REPLAY_INK}
                </>
              ) : (
                <>
                  首次過關每星 <MoYu label /> {per}
                </>
              )}
            </p>
          )}
          {def.tip ? (
            <p className="m3-tip mt-3 rounded-xl px-3 py-2 text-left text-sm leading-relaxed">
              {def.tip}
            </p>
          ) : null}
        </details>
        <div className="cb-prep-actions mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="min-h-11 rounded-xl border border-line" onClick={onMap}>
            {tower ? "返回" : "地圖"}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-gold"
            onClick={onStart}
            data-testid="m3-start"
          >
            開始戰鬥
          </button>
        </div>
      </div>
    </div>
  );
}

/** 鎮厄司 intro: the 墨厄, its traits, the 掉落預覽 (before battle), the 三人戰隊. */
function RaidIntro({
  raid,
  def,
  enemy,
  team,
  onStart,
  onMap,
  onEditTeam,
}: {
  raid: RaidMode;
  def: LevelDef;
  enemy: EnemyDef;
  team: string[];
  onStart: () => void;
  onMap: () => void;
  onEditTeam: () => void;
}) {
  const rec = useSave((s) => s.raid.records[raid.enc.id]);
  const firstPaid = !!rec?.firstDrop;
  const legacyInk = rec?.rewardClaimed ? 0 : (LEGACY_FIRST_INK[raid.enc.id] ?? 0);
  return (
    <div
      className="m3-modal fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5"
      data-testid="raid-intro"
    >
      <div className="m3-card cb-prep-card w-full max-w-sm rounded-2xl p-5 text-center">
        <p className="text-xs tracking-[0.3em] text-muted">鎮厄司</p>
        <h2 className="mt-1 font-serif text-3xl tracking-[0.2em]">
          {RAID_TIER_NAME[raid.enc.tier]}
        </h2>
        <p className="mt-1 text-sm text-muted">
          氣血 {playerMaxHp(def.moves)} · 已討伐 {rec?.clears ?? 0} 次
        </p>
        <EnemyPreview def={enemy} />
        <TeamSlot team={team} onEdit={onEditTeam} />
        <details className="cb-prep-details">
          <summary>掉落與討伐建議</summary>
          <div
            className="raid-drops mt-3 rounded-xl px-3 py-2 text-left text-sm"
            data-testid="raid-drop-preview"
          >
            <p className="font-serif text-gold">掉落預覽</p>
            <p>每次討伐：{dropText(raid.enc.drops)}</p>
            <p className={firstPaid ? "text-muted line-through" : ""}>
              首次討伐另得：{dropText(raid.enc.firstDrops)}
              {firstPaid ? "（已領）" : ""}
            </p>
            {legacyInk ? (
              <p data-testid="raid-legacy-ink">首勝墨玉 ×{legacyInk}（原有首勝獎勵，只發一次）</p>
            ) : null}
            <p className="text-[0.66rem] text-muted">
              可重複挑戰；重複討伐只掉命器淬鍊材料，不發墨玉。失敗不扣任何資源。
            </p>
          </div>
          <p className="mt-2 text-xs text-muted">推薦：{raid.enc.recommended}</p>
          {def.tip ? (
            <p className="m3-tip mt-3 rounded-xl px-3 py-2 text-left text-sm leading-relaxed">
              {def.tip}
            </p>
          ) : null}
        </details>
        <div className="cb-prep-actions mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="min-h-11 rounded-xl border border-line" onClick={onMap}>
            返回
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-gold"
            onClick={onStart}
            data-testid="m3-start"
          >
            開始討伐
          </button>
        </div>
      </div>
    </div>
  );
}

function RaidDone({
  raid,
  result,
  win,
  onRetry,
}: {
  raid: RaidMode;
  result: Result;
  win: { drops: MatDrop; first: boolean; ink: number } | null;
  onRetry: () => void;
}) {
  return (
    <div className="m3-modal fixed inset-0 z-50 grid place-items-center p-5" data-testid="raid-result" data-won={result.won ? "1" : "0"}>
      <div className={cn("m3-card w-full max-w-sm rounded-2xl p-5 text-center", result.won && "m3-card-win")}>
        <p className="text-xs tracking-[0.3em] text-muted">鎮厄司 · {RAID_TIER_NAME[raid.enc.tier]}</p>
        <h2 className="m3-result-title mt-1 font-serif text-3xl tracking-[0.25em]">{result.won ? "墨散 · 討伐成功" : "氣血耗盡"}</h2>
        <PurgeLine result={result} />
        {result.won ? (
          <div className="mt-3 text-sm" data-testid="raid-drops">
            <p className="text-gold">{win ? `獲得 ${dropText(win.drops)}` : "本次未記錄掉落"}</p>
            {win?.first ? <p className="text-xs text-muted">含首次討伐加贈</p> : null}
            {win && win.ink > 0 ? <p className="text-xs text-muted">首次討伐 +{win.ink} 墨玉（僅一次）</p> : null}
            <p className="mt-1 text-[0.66rem] text-muted">材料已收入命器閣，可前往命器淬鍊。</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">不扣任何資源，可免費再戰。</p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="min-h-11 rounded-xl border border-line text-sm" onClick={raid.onLeave}>
            返回討伐
          </button>
          <button type="button" className="min-h-11 rounded-xl bg-gold text-sm" onClick={onRetry} data-testid="raid-retry">
            免費再戰
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 餘血加分 count-up: after the card lands, the remaining 氣血 (as equivalent unused moves) is cashed in one by one
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

function PurgeLine({ result }: { result: Result }) {
  if (!result.enemyName) return null;
  return (
    <p
      className={cn("mt-1 text-xs", result.purged ? "text-gold" : "text-muted")}
      data-testid="m3-purge"
      data-purged={result.purged ? "1" : "0"}
    >
      {result.purged ? `已破厄 · 擊退${result.enemyName}` : `${result.enemyName}未被擊退`}
    </p>
  );
}

function LevelDone({
  def,
  result,
  progress: _progress,
  muted,
  onMap,
  onRetry,
  onNext,
  tower,
}: {
  def: LevelDef;
  result: Result;
  progress: Progress;
  muted: boolean;
  onMap: () => void;
  onRetry: () => void;
  onNext: () => void;
  tower?: TowerMode;
}) {
  const hasNext = tower ? true : def.id < LEVELS.length;
  const { cashed, left, done, skip } = useBonusCount(result, muted);
  const bonusNow = cashed * result.per;
  const total = done ? result.final : result.score + bonusNow;
  const startStars = left > 0 && !reducedMotion() ? starsFor(def, result.score) : result.stars;
  const liveStars = done ? result.stars : starsFor(def, total);
  const record = done && result.final > result.prevBest;
  return (
    <div
      className="m3-modal fixed inset-0 z-50 grid place-items-center p-5"
      data-testid="m3-result"
      data-won={result.won ? "1" : "0"}
      data-stars={result.stars}
    >
      <div
        className={cn(
          "m3-card w-full max-w-sm rounded-2xl p-5 text-center",
          result.won && "m3-card-win",
        )}
        onClick={done ? undefined : skip}
        data-bonus-done={done ? "1" : "0"}
      >
        <p className="text-xs tracking-[0.3em] text-muted">
          {tower ? tower.title : `第 ${def.id} 關`}
        </p>
        <h2 className="m3-result-title mt-1 font-serif text-4xl tracking-[0.3em]">
          {result.won ? "過關" : "氣血耗盡"}
        </h2>
        {result.won ? (
          <>
            <div
              className="m3-stars mt-4 flex items-end justify-center gap-2"
              aria-label={`${result.stars} 星`}
            >
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={cn(
                    "m3-big-star",
                    n === 2 && "m3-big-star-mid",
                    liveStars >= n && "on",
                  )}
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
                餘血加分 {left} × {result.per}
                {result.maxHp ? (
                  <span className="ml-1 text-[0.66rem]" data-testid="m3-hp-left">
                    （氣血 {result.hpLeft ?? 0}/{result.maxHp}）
                  </span>
                ) : null}
              </dt>
              <dd
                className={cn("m3-bonus-val text-right", cashed > 0 && "on")}
                data-testid="m3-bonus"
                data-left={left}
                data-per={result.per}
                data-bonus={result.bonus}
              >
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
            <p
              className={cn("mt-1 h-4 text-xs", done ? "text-gold" : "text-muted")}
              aria-live="polite"
            >
              {!done
                ? "點一下略過"
                : tower
                  ? ""
                  : record
                    ? result.prevBest > 0
                      ? `新紀錄 · 舊最佳 ${result.prevBest}`
                      : "新紀錄"
                    : `最佳 ${result.prevBest}`}
            </p>
            <PurgeLine result={result} />
            {tower ? (
              <p
                className={cn("mt-3 text-sm text-muted", !done && "invisible")}
                data-testid="sg-clear-note"
                data-reward={result.reward}
              >
                {result.note}
              </p>
            ) : null}
            {tower ? null : (
              <>
                <p
                  className={cn(
                    "m3-reward mt-3 flex items-center justify-center gap-1.5 text-xl",
                    !done && "invisible",
                  )}
                  data-reward={result.reward}
                >
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
            )}
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">差一點。打倒{result.enemyName || "墨厄"}即過關，再試一次。</p>
            <PurgeLine result={result} />
          </>
        )}
        <div
          className={cn("mt-5 grid gap-3", result.won && hasNext ? "grid-cols-3" : "grid-cols-2")}
        >
          <button
            type="button"
            className="min-h-11 rounded-xl border border-line text-sm"
            onClick={onMap}
          >
            {tower ? "返回" : "地圖"}
          </button>
          <button
            type="button"
            className={cn(
              "min-h-11 rounded-xl text-sm",
              result.won ? "border border-line" : "bg-gold",
            )}
            onClick={onRetry}
          >
            再戰
          </button>
          {result.won && hasNext ? (
            <button
              type="button"
              className="min-h-11 rounded-xl bg-gold text-sm"
              onClick={onNext}
              data-testid="m3-next"
            >
              {tower ? "下一層" : "下一關"}
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
  size?: "lg" | "md" | "sm";
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


/** Activation cut-in: portrait sweeps in, ink & gold burst, the love line brush-written. */
function SkillCutIn({
  who,
  skill,
  fast,
  onTap,
}: {
  who: Character;
  skill: Skill;
  fast: boolean;
  onTap: () => void;
}) {
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
          <BrushLine
            text={line}
            play={!fast}
            delay={260}
            step={step}
            className="rv-love-card m3-cutin-line"
          />
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