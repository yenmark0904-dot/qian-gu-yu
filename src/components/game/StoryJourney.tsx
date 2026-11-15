import { type ReactNode } from "react";
import { useSave } from "@/game/store";
import {
  MAIN_CHAPTER_NAME,
  HAN_CHAPTER_NAME,
  WU_CHAPTER_NAME,
  QI_CHAPTER_NAME,
  TANG_CHAPTER_NAME,
  MAIN_STORIES,
  HAN_STORIES,
  WU_STORIES,
  QI_STORIES,
  TANG_STORIES,
  MAIN_HERO,
  HAN_HERO,
  WU_HERO,
  QI_HERO,
  TANG_HERO,
  isVolumeUnlocked,
  isHanVolumeUnlocked,
  isWuVolumeUnlocked,
  isQiVolumeUnlocked,
  isTangVolumeUnlocked,
  isMainStoryChapterUnlocked,
  LATER_CHAPTER_LOCK_REASON,
  type MainStoryTarget,
} from "@/game/main-story";
export type Dynasty = 1 | 2 | 3 | 4 | 5;
const CHAPTERS = [
  { label: "秦朝篇", name: MAIN_CHAPTER_NAME, hero: MAIN_HERO, id: "qin", stories: MAIN_STORIES },
  { label: "西漢篇", name: HAN_CHAPTER_NAME, hero: HAN_HERO, id: "liuche", stories: HAN_STORIES },
  { label: "三國篇", name: WU_CHAPTER_NAME, hero: WU_HERO, id: "zhouyu", stories: WU_STORIES },
  { label: "北齊篇", name: QI_CHAPTER_NAME, hero: QI_HERO, id: "lanling", stories: QI_STORIES },
  { label: "唐朝篇", name: TANG_CHAPTER_NAME, hero: TANG_HERO, id: "libai", stories: TANG_STORIES },
];
/** One journey: Qin story cards precede their matching ten stages; other eras follow below. */
export function StoryJourney({
  chapter,
  onChapter,
  onRead,
  renderLevels,
}: {
  chapter: Dynasty;
  onChapter: (n: Dynasty) => void;
  onRead: (target: MainStoryTarget) => void;
  renderLevels?: (volume: number) => ReactNode;
}) {
  const prologueRead = useSave((state) => state.mainStoryPrologueRead);
  return (
    <div className="story-journey">
      <button
        className="story-prologue ui-text"
        data-testid="main-story-btn-prologue"
        onClick={() => onRead("prologue")}
      >
        重訪序章 <span>{prologueRead ? "已讀" : "未讀"}</span>
      </button>
      <nav className="dynasty-tabs" data-testid="main-story-chapter-tabs" aria-label="朝代行旅">
        {CHAPTERS.map((c, i) => {
          const n = (i + 1) as Dynasty;
          const open = isMainStoryChapterUnlocked(n);
          return (
          <button
            key={c.id}
            aria-pressed={chapter === n}
            data-testid={`main-story-tab-${n}`}
            data-locked={open ? undefined : "true"}
            onClick={() => {
              onChapter(n);
              document
                .getElementById(`journey-era-${n}`)
                ?.scrollIntoView({ block: "start", behavior: "auto" });
            }}
          >
            {open ? c.label : `${c.label} · 未開放`}
          </button>
          );
        })}
      </nav>
      {CHAPTERS.map((c, i) => (
        <StorySection
          key={c.id}
          chapter={(i + 1) as Dynasty}
          selected={chapter === i + 1}
          onRead={onRead}
          renderLevels={i === 0 ? renderLevels : undefined}
        />
      ))}
    </div>
  );
}

function StorySection({
  chapter,
  selected,
  onRead,
  renderLevels,
}: {
  chapter: Dynasty;
  selected: boolean;
  onRead: (target: MainStoryTarget) => void;
  renderLevels?: (volume: number) => ReactNode;
}) {
  const state = useSave();
  const data = CHAPTERS[chapter - 1];
  const read = [
    state.mainStoryRead,
    state.mainStoryHanRead,
    state.mainStoryWuRead,
    state.mainStoryQiRead,
    state.mainStoryTangRead,
  ][chapter - 1];
  const play = [
    state.mainStoryQinPlay,
    null,
    state.mainStoryWuPlay,
    state.mainStoryQiPlay,
    state.mainStoryTangPlay,
  ][chapter - 1];
  const isOpen = (volume: number) =>
    chapter === 1
      ? isVolumeUnlocked(volume, state.m3)
      : [isHanVolumeUnlocked, isWuVolumeUnlocked, isQiVolumeUnlocked, isTangVolumeUnlocked][
          chapter - 2
        ](volume);
  const last = state.storyLast[chapter] ?? play?.volume;
  const volume =
    last && isOpen(last)
      ? last
      : (data.stories.find((s) => isOpen(s.volume) && !read.includes(s.volume))?.volume ?? 1);
  const started = !!last || read.length > 0;
  const open = (v: number) => {
    if (isOpen(v)) {
      state.visitStory(chapter, v);
      onRead({ chapter, volume: v } as MainStoryTarget);
    }
  };
  return (
    <section className="journey-era" id={`journey-era-${chapter}`} aria-label={data.label}>
      <section className="story-hero" data-era={data.id}>
        <div className="story-hero-scene" aria-hidden="true" />
        <div className="story-hero-mask" />
        <div className="story-hero-copy">
          <p className="ui-eyebrow">
            {data.label} · {data.hero}
          </p>
          <h2>{data.name}</h2>
          <p>
            已讀 {read.length} / {data.stories.length} 卷
          </p>
          {!isMainStoryChapterUnlocked(chapter) ? (
            <p className="preview-label">{LATER_CHAPTER_LOCK_REASON}</p>
          ) : null}
          <button
            className="ui-primary"
            data-testid={selected ? "story-continue" : undefined}
            disabled={!isOpen(volume)}
            onClick={() => open(volume)}
          >
            {started ? "繼續閱讀" : "開始閱讀"} · 卷{volume}
          </button>
          <small>
            {chapter === 2 ? "閱讀位置記錄至卷，從該卷開頭閱讀" : "沿用本卷演出進度；讀畢可重讀"}
          </small>
        </div>
      </section>
      {data.stories.map((s) => {
        const unlocked = isOpen(s.volume);
        const done = read.includes(s.volume);
        const current = last === s.volume;
        const condition = `通關第 ${s.volume <= 5 ? (s.volume - 1) * 10 : 50} 關後解鎖`;
        return (
          <div
            className="journey-volume"
            key={s.volume}
            data-journey-volume={chapter === 1 ? s.volume : undefined}
          >
            <ol className="story-volumes">
              <li
                data-status={
                  !unlocked ? "locked" : current ? "current" : done ? "read" : "available"
                }
              >
                <button
                  disabled={!unlocked}
                  onClick={() => open(s.volume)}
                  data-testid={`main-story-btn-${chapter === 1 ? "" : ["", "han-", "wu-", "qi-", "tang-"][chapter - 1]}${s.volume}`}
                >
                  <span className="volume-number">{String(s.volume).padStart(2, "0")}</span>
                  <span className="volume-info">
                    <small>
                      卷{s.volume} · {s.place}
                    </small>
                    <strong>{s.title}</strong>
                    <small>
                      {!unlocked
                        ? chapter === 1
                          ? condition
                          : LATER_CHAPTER_LOCK_REASON
                        : current
                          ? "上次讀到"
                          : done
                            ? "已讀 · 可重讀"
                            : "可閱讀"}
                    </small>
                  </span>
                  {current ? (
                    <span className="current-seal">讀</span>
                  ) : (
                    <span className="volume-status">{!unlocked ? (chapter === 1 ? "未解鎖" : "未開放") : done ? "✓" : "›"}</span>
                  )}
                </button>
              </li>
            </ol>
            {s.volume <= 5 ? renderLevels?.(s.volume) : null}
          </div>
        );
      })}
    </section>
  );
}
