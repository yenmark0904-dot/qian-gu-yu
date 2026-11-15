import { nextStoryStop } from "@/game/story-playback";
import type { VnStage } from "@/game/qin-vn";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  HAN_CHAPTER_TITLE,
  HAN_HERO,
  MAIN_CHAPTER_TITLE,
  MAIN_HERO,
  MAIN_PROLOGUE_TEXT,
  MAIN_PROLOGUE_TITLE,
  QI_CHAPTER_TITLE,
  QI_HERO,
  TANG_CHAPTER_TITLE,
  TANG_HERO,
  WU_CHAPTER_TITLE,
  WU_HERO,
  type MainStoryTarget,
  hanStoryByVolume,
  isMainStoryChapterUnlocked,
  mainStoryByVolume,
  qiStoryByVolume,
  tangStoryByVolume,
  wuStoryByVolume,
} from "@/game/main-story";
import { playStoryVoice, primeVoice, stopVoice } from "@/game/audio";
import { storyQuotedSpeech } from "@/game/story-voice";
import { parseQiVolume } from "@/game/qi-vn";
import { parseTangVolume } from "@/game/tang-vn";
import { parseWuVolume } from "@/game/wu-vn";
import { useSave } from "@/game/store";
import { parsePrologue, type PrologueBeat } from "@/game/prologue-vn";
import {
  nextQinIndex,
  parseQinVolume,
  qinChoiceIndex,
  qinResumeIndex,
  resolveQinIndex,
  type QinBeat,
  type QinChoiceId,
} from "@/game/qin-vn";

import { storyEventFor } from "@/game/story-events";

const StoryEventPlayer = lazy(() => import("@/components/game/StoryEventPlayer"));
const FINISH_LABEL = "繼續闖關";
const PROLOGUE_BEATS = parsePrologue(MAIN_PROLOGUE_TEXT);

function storyFor(target: Exclude<MainStoryTarget, "prologue">) {
  if (target.chapter === 1) return mainStoryByVolume(target.volume);
  if (target.chapter === 2) return hanStoryByVolume(target.volume);
  if (target.chapter === 3) return wuStoryByVolume(target.volume);
  if (target.chapter === 4) return qiStoryByVolume(target.volume);
  return tangStoryByVolume(target.volume);
}

function eyebrowFor(chapter: number, volume: number, place: string) {
  if (chapter === 1) return `章節 · ${MAIN_CHAPTER_TITLE} · 卷${volume} · ${place}`;
  if (chapter === 2) return `章節 · ${HAN_CHAPTER_TITLE} · 卷${volume} · ${place}`;
  if (chapter === 3) return `章節 · ${WU_CHAPTER_TITLE} · 卷${volume} · ${place}`;
  if (chapter === 4) return `章節 · ${QI_CHAPTER_TITLE} · 卷${volume} · ${place}`;
  return `章節 · ${TANG_CHAPTER_TITLE} · 卷${volume} · ${place}`;
}

function heroFor(chapter: number) {
  if (chapter === 1) return MAIN_HERO;
  if (chapter === 2) return HAN_HERO;
  if (chapter === 3) return WU_HERO;
  if (chapter === 4) return QI_HERO;
  return TANG_HERO;
}

/** Full-screen reader for 序章 / 秦朝 / 西漢 / 三國 / 北齊 / 唐朝. Marks read when closed. */
export function MainStoryReader({
  target,
  onClose,
}: {
  target: MainStoryTarget;
  onClose: () => void;
}) {
  const muted = useSave((state) => state.muted);
  const isPrologue = target === "prologue";
  const chapter = isPrologue ? 0 : target.chapter;
  const volume = isPrologue ? 0 : target.volume;
  const story = isPrologue ? null : storyFor(target);
  const primary = useRef<HTMLButtonElement>(null);

  const finish = () => {
    stopVoice();
    const st = useSave.getState();
    if (isPrologue) st.markMainStoryPrologueRead();
    else if (chapter === 1) st.markMainStoryRead(volume);
    else if (chapter === 2) st.markMainStoryHanRead(volume);
    else if (chapter === 3) st.markMainStoryWuRead(volume);
    else if (chapter === 4) st.markMainStoryQiRead(volume);
    else st.markMainStoryTangRead(volume);
    onClose();
  };

  const locked = target !== "prologue" && !isMainStoryChapterUnlocked(target.chapter);

  useEffect(() => {
    if (locked) onClose();
  }, [locked, onClose]);

  useEffect(() => {
    if (locked || isPrologue || chapter === 1 || chapter === 3 || chapter === 4 || chapter === 5) return;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, onClose]);

  useEffect(() => {
    if (locked || isPrologue || chapter === 1 || chapter === 3 || chapter === 4 || chapter === 5 || !story) return;
    primeVoice();
    playStoryVoice(storyQuotedSpeech(story.text).join("\n"), "", muted);
    return stopVoice;
  }, [isPrologue, chapter, story, muted]);

  if (locked || (!isPrologue && !story)) return null;

  if (isPrologue) return <PrologueVN onFinish={finish} />;
  if (chapter === 1 && story) {
    return <QinStoryVN chapter={1} volume={volume} title={story.title} text={story.text} onClose={onClose} />;
  }
  if (chapter === 3 && story) {
    return <QinStoryVN chapter={3} volume={volume} title={story.title} text="" onClose={onClose} />;
  }

  if (chapter === 4 && story) {
    return <QinStoryVN chapter={4} volume={volume} title={story.title} text="" onClose={onClose} />;
  }

  if (chapter === 5 && story) {
    return <QinStoryVN chapter={5} volume={volume} title={story.title} text="" onClose={onClose} />;
  }

  const title = isPrologue ? MAIN_PROLOGUE_TITLE : story!.title;
  const body = isPrologue ? MAIN_PROLOGUE_TEXT : story!.text;
  const eyebrow = isPrologue ? "章節 · 序章" : eyebrowFor(chapter, volume, story!.place);
  const heroLine = isPrologue ? null : heroFor(chapter);
  const testId =
    isPrologue ? "main-story-prologue"
    : chapter === 2 ? "main-story-han"
    : chapter === 3 ? "main-story-wu"
    : chapter === 4 ? "main-story-qi"
    : chapter === 5 ? "main-story-tang"
    : "main-story";

  return (
    <div
      className="m3-modal fixed inset-0 z-[55] grid place-items-end justify-center p-0 sm:place-items-center sm:p-5"
      data-testid={testId}
      data-volume={isPrologue ? "prologue" : volume}
      data-chapter={isPrologue ? "prologue" : chapter}
      onClick={finish}
    >
      <div
        className="cloud-sheet safe-bottom flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-2xl px-5 pb-5 pt-4 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="main-story-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.65rem] tracking-[0.35em] text-gold">{eyebrow}</p>
            <h2 id="main-story-title" className="mt-1 font-serif text-xl tracking-[0.2em] text-fg">
              {title}
            </h2>
            {heroLine ? <p className="mt-1 text-[0.7rem] tracking-[0.2em] text-muted">{heroLine}</p> : null}
          </div>
          <button
            ref={primary}
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted"
            aria-label="關閉"
            onClick={finish}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="tale-screen mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border p-4" tabIndex={0} role="region" aria-label={title}>
          <p className="tale-text whitespace-pre-line">{body}</p>
        </div>
        <button type="button" className="mt-4 min-h-11 w-full rounded-xl bg-gold text-sm text-bg" onClick={finish} data-testid="main-story-close">
          {FINISH_LABEL}
        </button>
      </div>
    </div>
  );
}


type VnChapter = 1 | 3 | 4 | 5;

function vnPlay(chapter: VnChapter) {
  const state = useSave.getState();
  return chapter === 5 ? state.mainStoryTangPlay : chapter === 4 ? state.mainStoryQiPlay : chapter === 3 ? state.mainStoryWuPlay : state.mainStoryQinPlay;
}

/** Voice only the quoted speech, so verbatim lines like 「…」他挑眉。 never read the narration aloud. */
function voicedText(text: string): string {
  const quoted = storyQuotedSpeech(text);
  return quoted.length ? quoted.join("\n") : text;
}

function persistQin(chapter: VnChapter, volume: number, beat: number, done: boolean, choice?: QinChoiceId) {
  const prev = vnPlay(chapter);
  const save = chapter === 5 ? useSave.getState().setMainStoryTangPlay : chapter === 4 ? useSave.getState().setMainStoryQiPlay : chapter === 3 ? useSave.getState().setMainStoryWuPlay : useSave.getState().setMainStoryQinPlay;
  save({
    volume,
    beat,
    done,
    positions: { ...(prev?.positions ?? {}), [String(volume)]: beat },
    finished: { ...(prev?.finished ?? {}), [String(volume)]: done },
    choices: { ...(prev?.choices ?? {}), ...(choice ? { [String(volume)]: choice } : {}) },
  });
}

/** Playback speed is session-only; a choice/end always cancels it. */
function useStoryFast(index: number, canAdvance: boolean, advance: () => void) {
  const [fast, setFast] = useState(false);
  const step = useRef(advance);
  step.current = advance;
  useEffect(() => {
    if (!canAdvance) {
      setFast(false);
      return;
    }
    if (!fast) return;
    const timer = window.setTimeout(() => step.current(), 625);
    return () => window.clearTimeout(timer);
  }, [index, fast, canAdvance]);
  return [fast, setFast] as const;
}

function StoryPlaybackControls({ disabled, fast, onSkip, onFast }: {
  disabled: boolean;
  fast: boolean;
  onSkip: () => void;
  onFast: () => void;
}) {
  return (
    <div className="story-playback-controls">
      <button type="button" className="ink-ghost min-h-11" data-testid="story-skip" aria-label="跳過劇情" disabled={disabled}
        onClick={(event) => { event.stopPropagation(); onSkip(); }}>跳過</button>
      <button type="button" className="ink-ghost min-h-11" data-testid="story-fast" aria-pressed={fast} disabled={disabled}
        onClick={(event) => { event.stopPropagation(); stopVoice(); onFast(); }}>{fast ? "加速中" : "加速"}</button>
    </div>
  );
}

/** Qin, 三國, 北齊 and 唐朝 volumes play as a branching visual novel: only the picked A/B/C path is shown. */
export function QinStoryVN({
  chapter,
  volume,
  title,
  text,
  onClose,
  bond,
}: {
  bond?: { key: string; label: string; stage: VnStage; onFinish: () => void };
  chapter: VnChapter;
  volume: number;
  title: string;
  text: string;
  onClose: () => void;
}) {
  const muted = useSave((state) => state.muted);
  const bondVnStage = bond?.stage;
  const beats = useMemo(() => (bondVnStage ? parseQinVolume(text, bondVnStage) : chapter === 5 ? parseTangVolume(volume) : chapter === 4 ? parseQiVolume(volume) : chapter === 3 ? parseWuVolume(volume) : parseQinVolume(text)), [chapter, volume, text, bondVnStage]);
  const [index, setIndex] = useState(() => {
    if (!bond) return qinResumeIndex(volume, beats, vnPlay(chapter));
    const saved = useSave.getState().bondStoryPlay[bond.key];
    return saved && !saved.done && saved.beat < beats.length ? resolveQinIndex(beats, saved.beat) : 0;
  });
  const persist = (cursor: number, done: boolean, choice?: QinChoiceId) => {
    if (!bond) return persistQin(chapter, volume, cursor, done, choice);
    const old = useSave.getState().bondStoryPlay[bond.key];
    useSave.getState().setBondStoryPlay(bond.key, { beat: cursor, done, ...(choice || old?.choice ? { choice: choice ?? old?.choice } : {}) });
  };
  const stage = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const indexRef = useRef(index);
  indexRef.current = index;
  const beat: QinBeat | undefined = beats[resolveQinIndex(beats, index)];
  const background = (beat ?? beats[beats.length - 1])?.background ?? "/cg/prologue/palace.jpg";
  const savedChoice = useSave((state) => bond ? state.bondStoryPlay[bond.key]?.choice : (chapter === 5 ? state.mainStoryTangPlay : chapter === 4 ? state.mainStoryQiPlay : chapter === 3 ? state.mainStoryWuPlay : state.mainStoryQinPlay)?.choices?.[String(volume)]);
  // 劇情三消: an optional event at the end of key volumes (秦朝篇 卷四《一盞留燈》…). Never blocks reading.
  const storyEvent = bond ? undefined : storyEventFor(chapter, volume);
  const eventRecord = useSave((state) => (storyEvent ? state.storyEvents[storyEvent.id] : undefined));
  const [eventOpen, setEventOpen] = useState(false);
  const eventOpenRef = useRef(false);
  eventOpenRef.current = eventOpen;
  const chapterLabel = chapter === 5 ? TANG_CHAPTER_TITLE : chapter === 4 ? QI_CHAPTER_TITLE : chapter === 3 ? WU_CHAPTER_TITLE : MAIN_CHAPTER_TITLE;

  const close = (markRead: boolean) => {
    stopVoice();
    const current = resolveQinIndex(beats, indexRef.current);
    const currentBeat = beats[current];
    persist(current, markRead || !currentBeat);
    if (bond) {
      if (markRead || !currentBeat) {
        useSave.getState().questEvent("CHARACTER_STORY_READ");
        bond.onFinish();
      }
      else onClose();
      return;
    }
    if (markRead || !currentBeat) {
      if (chapter === 5) useSave.getState().markMainStoryTangRead(volume);
      else if (chapter === 4) useSave.getState().markMainStoryQiRead(volume);
      else if (chapter === 3) useSave.getState().markMainStoryWuRead(volume);
      else useSave.getState().markMainStoryRead(volume);
    }
    onClose();
  };

  const advance = () => {
    if (lock.current || beat?.kind === "choice") return;
    stopVoice();
    const next = beat ? nextQinIndex(beats, resolveQinIndex(beats, index)) : beats.length;
    lock.current = true;
    setIndex(next);
    persist(next, next >= beats.length);
  };

  const canAdvance = !!beat && beat.kind !== "choice" && !eventOpen;
  const [fast, setFast] = useStoryFast(index, canAdvance, advance);
  const skip = () => {
    setFast(false);
    stopVoice();
    if (!canAdvance || lock.current) return;
    const next = nextStoryStop(beats, resolveQinIndex(beats, index), (cursor) => nextQinIndex(beats, cursor));
    lock.current = true;
    setIndex(next);
    persist(next, next >= beats.length);
  };

  const choose = (id: QinChoiceId) => {
    if (lock.current || beat?.kind !== "choice") return;
    const next = qinChoiceIndex(beats, resolveQinIndex(beats, index), id);
    if (next === null) return;
    lock.current = true;
    stopVoice();
    setIndex(next);
    persist(next, false, id);
    stage.current?.focus();
  };

  useEffect(() => {
    lock.current = false;
    stage.current?.focus();
  }, [index]);

  useEffect(() => {
    primeVoice();
    const art = bond ? [...new Set(beats.flatMap((beat) => [beat.background, ...(beat.sprite ? [beat.sprite] : [])]))] : chapter === 3 || chapter === 4 || chapter === 5
      ? ["/bg/hall-bg.webp", "/cg/prologue/rift.jpg", "/cg/prologue/witch.png", ...(chapter === 5 ? ["/cg/prologue/shrine.jpg"] : [])]
      : ["shrine.jpg", "rift.jpg", "rift-end.jpg", "palace.jpg", "witch.png", "qin.png"].map((file) => `/cg/prologue/${file}`);
    for (const src of art) {
      const image = new Image();
      image.src = src;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !eventOpenRef.current) close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopVoice();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume]);

  useEffect(() => {
    if (!fast && beat?.kind === "dialogue" && !beat.thought && beat.speaker !== "祈願紙") {
      playStoryVoice(voicedText(beat.text), beat.speaker, muted);
    }
    return stopVoice;
  }, [index, beat, muted, fast]);

  return (
    <div
      ref={stage}
      className="prologue-vn"
      data-testid={bond ? "bond-story-vn" : chapter === 5 ? "main-story-tang" : chapter === 4 ? "main-story-qi" : chapter === 3 ? "main-story-wu" : "main-story"}
      data-volume={volume}
      data-bond-key={bond?.key}
      data-chapter={chapter}
      data-beat={resolveQinIndex(beats, index)}
      data-branch={savedChoice ?? ""}
      data-scene={background}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qin-vn-title"
      tabIndex={0}
      onClick={advance}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (["Enter", " ", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          if (!event.repeat) advance();
        }
      }}
    >
      <div className="prologue-vn-background" style={{ backgroundImage: `url(${background})` }} />
      <div className="prologue-vn-shade" />
      <header className="prologue-vn-header">
        <h2 id="qin-vn-title">{title}<span style={bond ? { display: "block", marginLeft: 0, letterSpacing: ".08em", marginTop: ".4rem" } : undefined}>{bond ? `${bond.label} · 與該角色發展為戀人的可能未來` : `${chapterLabel} · 卷${volume}`}</span></h2>
        <StoryPlaybackControls disabled={!canAdvance} fast={fast} onSkip={skip} onFast={() => setFast((value) => !value)} />
        <button
          type="button"
          className="prologue-vn-dismiss"
          aria-label="關閉"
          data-testid="main-story-dismiss"
          onClick={(event) => { event.stopPropagation(); close(false); }}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>
      <div className="prologue-vn-stage" aria-hidden="true">
        {beat?.sprite ? <img key={beat.sprite} className="prologue-vn-sprite" src={beat.sprite} alt="" /> : null}
      </div>
      {beat?.kind === "title" ? (
        <div className="prologue-vn-title" key={index} aria-live="polite">
          <p>{beat.text}</p>
        </div>
      ) : null}
      <section className={`prologue-vn-box cloud-sheet ${beat?.kind === "title" ? "prologue-vn-box-title" : ""}`}>
        {!beat ? (
          <>
            {storyEvent ? (
              <div className="story-event-card" data-testid="story-event-card" data-cleared={eventRecord?.cleared ? "1" : "0"} onClick={(event) => event.stopPropagation()}>
                <p className="story-event-eyebrow">特殊事件 · {storyEvent.name}</p>
                <p className="story-event-invite">{storyEvent.invite}</p>
                <p className="story-event-meta">
                  {storyEvent.mechanic}
                  {eventRecord?.cleared ? " · 已完成（可重玩）" : " · 可略過，不影響主線"}
                </p>
                <button type="button" className="prologue-vn-choice" data-testid="story-event-enter" onClick={(event) => { event.stopPropagation(); stopVoice(); setEventOpen(true); }}>
                  <span>◆</span>進入互動
                </button>
              </div>
            ) : null}
            <button type="button" className="prologue-vn-choice prologue-vn-finish" data-testid="main-story-close" onClick={(event) => { event.stopPropagation(); if (storyEvent && !eventRecord?.cleared && !eventRecord?.skipped) useSave.getState().recordStoryEvent(storyEvent.id, "skip"); close(true); }}>
              {storyEvent ? `略過互動 · ${FINISH_LABEL}` : FINISH_LABEL}
            </button>
          </>
        ) : beat.kind === "choice" ? (
          <div className="prologue-vn-choices" role="group" aria-label="巫女的選擇">
            {beat.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="prologue-vn-choice"
                data-testid={`main-story-choice-${choice.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  choose(choice.id);
                }}
              >
                <span>{choice.id}</span>{choice.text}
              </button>
            ))}
          </div>
        ) : beat.kind === "goto" ? null : (
          <div key={index} aria-live="polite" aria-atomic="true">
            {beat.kind === "dialogue" && !beat.thought ? <p className="prologue-vn-speaker">{beat.speaker}</p> : null}
            {beat.kind !== "title" ? <p className={`prologue-vn-text ${beat.kind === "narration" ? "prologue-vn-narration" : ""}`}>{beat.text}</p> : null}
            <p className="prologue-vn-hint" aria-hidden="true">輕觸繼續 <span>◇</span></p>
          </div>
        )}
      </section>
      {eventOpen && storyEvent ? (
        <Suspense fallback={null}>
          <StoryEventPlayer event={storyEvent} onLeave={() => setEventOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}

/** The prologue is a stage, while dynasty chapters retain the sheet reader. */
function PrologueVN({ onFinish }: { onFinish: () => void }) {
  const muted = useSave((state) => state.muted);
  const [index, setIndex] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const beat: PrologueBeat | undefined = PROLOGUE_BEATS[index];
  const background = (beat ?? PROLOGUE_BEATS[PROLOGUE_BEATS.length - 1]).background;
  const advance = () => {
    stopVoice();
    if (beat && beat.kind !== "choice") setIndex((current) => current + 1);
  };

  const canAdvance = !!beat && beat.kind !== "choice";
  const [fast, setFast] = useStoryFast(index, canAdvance, advance);
  const skip = () => {
    setFast(false);
    stopVoice();
    if (canAdvance) setIndex(nextStoryStop(PROLOGUE_BEATS, index, (cursor) => cursor + 1));
  };

  useEffect(() => {
    primeVoice();
    stage.current?.focus();
    // Warm the art cache without changing or regenerating the supplied assets.
    for (const file of ["shrine.jpg", "rift.jpg", "rift-end.jpg", "palace.jpg", "witch.png", "qin.png"]) {
      const image = new Image();
      image.src = `/cg/prologue/${file}`;
    }
  }, []);

  useEffect(() => {
    if (!fast && beat?.kind === "dialogue" && !beat.thought && beat.speaker !== "祈願紙") {
      playStoryVoice(beat.text, beat.speaker, muted);
    }
    return stopVoice;
  }, [index, beat, muted, fast]);

  return (
    <div
      ref={stage}
      className="prologue-vn"
      data-testid="main-story-prologue"
      data-volume="prologue"
      data-chapter="prologue"
      data-beat={index}
      data-scene={background}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prologue-vn-title"
      tabIndex={0}
      onClick={advance}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (["Enter", " ", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          if (!event.repeat) advance();
        }
      }}
    >
      <div className="prologue-vn-background" style={{ backgroundImage: `url(${background})` }} />
      <div className="prologue-vn-shade" />
      <header className="prologue-vn-header">
        <h2 id="prologue-vn-title">{MAIN_PROLOGUE_TITLE}<span>千古遇</span></h2>
        <StoryPlaybackControls disabled={!canAdvance} fast={fast} onSkip={skip} onFast={() => setFast((value) => !value)} />
        <button
          type="button"
          className="prologue-vn-dismiss"
          aria-label="關閉"
          data-testid="main-story-dismiss"
          onClick={(event) => { event.stopPropagation(); stopVoice(); onFinish(); }}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>
      <div className="prologue-vn-stage" aria-hidden="true">
        {beat?.sprite ? <img key={beat.sprite} className="prologue-vn-sprite" src={beat.sprite} alt="" /> : null}
      </div>
      {beat?.kind === "title" ? (
        <div className="prologue-vn-title" key={index} aria-live="polite">
          <p>{beat.text}</p>
        </div>
      ) : null}
      <section className={`prologue-vn-box cloud-sheet ${beat?.kind === "title" ? "prologue-vn-box-title" : ""}`}>
        {!beat ? (
          <button type="button" className="prologue-vn-choice prologue-vn-finish" data-testid="main-story-close" onClick={(event) => { event.stopPropagation(); stopVoice(); onFinish(); }}>
            {FINISH_LABEL}
          </button>
        ) : beat.kind === "choice" ? (
          <div className="prologue-vn-choices" role="group" aria-label="巫女的選擇">
            {beat.choices.map((choice) => (
              <button key={choice.id} type="button" className="prologue-vn-choice" data-testid={`prologue-choice-${choice.id}`} onClick={(event) => {
                event.stopPropagation();
                stopVoice();
                setIndex((current) => current + 1);
                stage.current?.focus();
              }}>
                <span>{choice.id}</span>{choice.text}
              </button>
            ))}
          </div>
        ) : (
          <div key={index} aria-live="polite" aria-atomic="true">
            {beat.kind === "dialogue" && !beat.thought ? <p className="prologue-vn-speaker">{beat.speaker}</p> : null}
            {beat.kind !== "title" ? <p className={`prologue-vn-text ${beat.kind === "narration" ? "prologue-vn-narration" : ""}`}>{beat.text}</p> : null}
            <p className="prologue-vn-hint" aria-hidden="true">輕觸繼續 <span>◇</span></p>
          </div>
        )}
      </section>
    </div>
  );
}
