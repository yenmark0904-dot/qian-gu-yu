import { CompanionHero } from "./Companion";
import { ArtifactSummon } from "./ArtifactSummon";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpenText,
  ChevronRight,
  Gem,
  Lock,
  Mail,
  MoreHorizontal,
  ScrollText,
  Swords,
  Volume2,
  VolumeX,
  X,
  WandSparkles,
} from "lucide-react";
import "@/components/game/quest.css";
import { useNow } from "@/components/game/use-now";
import { freeSummonUsed, questClaimable } from "@/game/quests";
import { VAULT_GATE_TEXT, devArtifacts } from "@/game/artifact-dev";
import { UNLOCK_AT, artifactUnlocks } from "@/game/artifacts";
import { MoHen, MoYu, cn } from "@/components/game/bits";
import { LETTERS, letterUnlocked } from "@/game/letters";
import { type Character } from "@/game/data";
import { COST_ONE, COST_TEN, DAILY_INK, PITY, localDay } from "@/game/logic";
import { useSave } from "@/game/store";
import { ensureAudio } from "@/game/audio";
import { CloudBindChip, CloudHost } from "@/components/game/CloudSave";
import { PlayerAvatar, SettingsSheet } from "@/components/game/Settings";
import { MAX_STARS, totalStars } from "@/game/levels";
import { currentStoryChapterLabel } from "@/game/main-story";

/** True once the persisted save has hydrated (clock-dependent copy waits for it, as before). */
function useClockReady() {
  const [clockReady, setClockReady] = useState(false);
  useEffect(() => {
    const finish = () => setClockReady(true);
    const unsub = useSave.persist.onFinishHydration(finish);
    if (useSave.persist.hasHydrated()) finish();
    return unsub;
  }, []);
  return clockReady;
}

/** Existing reminders only: unread 千年書信 and claimable 修行簿 rewards. No new notification data. */
function useHomeAlerts() {
  const clockReady = useClockReady();
  const now = useNow(15000);
  const unread = useSave(
    (s) => LETTERS.filter((l) => letterUnlocked(l, s) && !s.letters[l.id]?.read).length,
  );
  const questBook = useSave((s) => s.questBook);
  const m3 = useSave((s) => s.m3);
  const prologueRead = useSave((s) => s.mainStoryPrologueRead);
  const unlocks = artifactUnlocks(m3);
  const questDot =
    clockReady &&
    questClaimable(questBook, { vault: unlocks.vault, raid: unlocks.raid }, { m3, mainStoryPrologueRead: prologueRead }, now);
  return { unread, questDot, clockReady, now, questBook, m3, unlocks };
}

/** Small bottom sheet used by 「更多」 and 提醒 (Escape / backdrop closes; focus returns). */
function HomeSheet({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="home-sheet-backdrop" onClick={onClose}>
      <div
        ref={root}
        className="home-sheet safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="ui-icon home-sheet-close" aria-label="關閉" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/**
 * 墨門 · 首頁 (t487): palace + 朝夕相伴 first, then 繼續主線 and a slim row of entries.
 * The gacha UI lives on the 召喚 tab (SummonHall); every former hall entry stays reachable here or in 「更多」.
 */
export function Home({
  message,
  setMessage,
  onMatch,
  onLetters,
  onCodex,
  onSummon,
  onArtifacts,
  onQuest,
  onRaid,
  hasFreePull = true,
}: {
  message: string | null;
  setMessage: (value: string | null) => void;
  onMatch: () => void;
  onLetters: (id?: string) => void;
  onCodex: (id: string) => void;
  /** Go to the 召喚 tab (never pulls by itself). */
  onSummon: () => void;
  onArtifacts?: () => void;
  onQuest?: () => void;
  onRaid?: () => void;
  /** Whether the 召喚 tab offers 今日免費召喚 (reminder chip only). */
  hasFreePull?: boolean;
}) {
  const pity = useSave((s) => s.pity);
  const lastDaily = useSave((s) => s.lastDaily);
  const m3Stars = useSave((s) => totalStars(s.m3));
  const chapterLabel = useSave((s) =>
    currentStoryChapterLabel(
      s.mainStoryPrologueRead,
      s.mainStoryRead,
      s.mainStoryHanRead,
      s.mainStoryWuRead,
      s.mainStoryQiRead,
      s.mainStoryTangRead,
    ),
  );
  const artifactCount = useSave((s) => s.artifacts.instances.length);
  const { unread, questDot, clockReady, now, questBook, unlocks } = useHomeAlerts();
  const vaultOpen = unlocks.vault || (clockReady && devArtifacts());
  const raidOpen = unlocks.raid || (clockReady && devArtifacts());
  const freeUsed = clockReady && freeSummonUsed(questBook, now);
  const claimed = clockReady && lastDaily === localDay();
  const [more, setMore] = useState(false);
  const closeMore = () => setMore(false);

  return (
    <div className="hall-scroll home-scroll scroll-area min-h-0 flex-1 overflow-y-auto">
      <main className="home-v12" data-testid="home">
        <CompanionHero onLetters={onLetters} onCodex={onCodex} onSummon={onSummon} />
        <section className="home-actions" aria-label="主要操作">
          <button
            type="button"
            className="home-continue"
            data-testid="home-continue"
            onClick={onMatch}
          >
            {/* home-match kept on the CTA (inside the button) for existing UI scripts; same onMatch flow. */}
            <span className="home-continue-text" data-testid="home-match">
              <strong>繼續主線</strong>
              <small>
                {chapterLabel}{"\u3000"}★ {m3Stars}/{MAX_STARS}
              </small>
            </span>
            <ChevronRight size={20} aria-hidden />
          </button>
          <div className="home-entries" role="group" aria-label="功能入口">
            <button type="button" className="home-entry" data-testid="home-story" onClick={onMatch}>
              <BookOpenText size={22} strokeWidth={1.4} aria-hidden />
              <span>劇情</span>
            </button>
            <button type="button" className="home-entry" data-testid="home-summon" onClick={onSummon}>
              <WandSparkles size={22} strokeWidth={1.4} aria-hidden />
              <span>召喚</span>
              {hasFreePull && clockReady && !freeUsed ? <i className="home-entry-dot" aria-label="今日免費尚未使用" /> : null}
            </button>
            {onQuest ? (
              <button type="button" className="home-entry" data-testid="home-quest" onClick={onQuest}>
                <ScrollText size={22} strokeWidth={1.4} aria-hidden />
                <span>修行簿</span>
                {questDot ? <i className="qb-entry-dot home-entry-dot" aria-label="有可領取的獎勵" /> : null}
              </button>
            ) : null}
            {onArtifacts ? (
              <button
                type="button"
                className="home-entry"
                data-testid="home-artifacts"
                data-locked={!vaultOpen || undefined}
                aria-label={vaultOpen ? `命器閣・持有命器 ${artifactCount} 件` : `命器閣・${VAULT_GATE_TEXT}`}
                title={vaultOpen ? undefined : VAULT_GATE_TEXT}
                onClick={onArtifacts}
              >
                {vaultOpen ? (
                  <Gem size={22} strokeWidth={1.4} aria-hidden />
                ) : (
                  <Lock size={20} strokeWidth={1.4} aria-hidden />
                )}
                <span>命器閣</span>
                <small>{vaultOpen ? `${artifactCount} 件` : `第 ${UNLOCK_AT.vault} 關`}</small>
              </button>
            ) : null}
            <button
              type="button"
              className="home-entry"
              data-testid="home-more"
              aria-haspopup="dialog"
              aria-expanded={more}
              onClick={() => setMore(true)}
            >
              <MoreHorizontal size={22} strokeWidth={1.4} aria-hidden />
              <span>更多</span>
              {unread > 0 || !claimed ? <i className="home-entry-dot" aria-hidden /> : null}
            </button>
          </div>
          <div className="home-reminders">
            {hasFreePull && clockReady && !freeUsed ? (
              <button type="button" className="home-chip" data-testid="home-free-chip" onClick={onSummon}>
                今日免費尚未使用
              </button>
            ) : null}
            <button type="button" className="home-chip" data-testid="home-pity-chip" onClick={onSummon}>
              距離天命 SSR {Math.max(PITY - pity, 1)} 抽
            </button>
          </div>
          {message ? (
            <p className="hall-notice" role="status">
              {message}
            </p>
          ) : null}
        </section>
      </main>
      {more ? (
        <HomeSheet title="更多" onClose={closeMore} testId="home-more-sheet">
          <div className="hall-entry-grid home-more-list">
            <button
              className="hall-entry"
              data-testid="home-letters"
              onClick={() => {
                setMore(false);
                onLetters();
              }}
            >
              <Mail size={24} strokeWidth={1.3} />
              <span>
                <strong>
                  千年書信{unread > 0 ? <i className="unread-badge">{unread}</i> : null}
                </strong>
                <small>墨線傳來的心事</small>
              </span>
              <ChevronRight size={17} />
            </button>
            {onRaid ? (
              <button
                className="hall-entry"
                data-testid="home-raid"
                onClick={() => {
                  setMore(false);
                  onRaid();
                }}
              >
                <Swords size={24} strokeWidth={1.3} />
                <span>
                  <strong>鎮厄司</strong>
                  <small>
                    {raidOpen
                      ? `普通討伐${unlocks.elite ? "・精英討伐" : `・精英第 ${UNLOCK_AT.elite} 關`}${unlocks.sovereign ? "・首領封印" : `・首領第 ${UNLOCK_AT.sovereign} 關`}・淬鍊材料`
                      : `通關第 ${UNLOCK_AT.raid} 關開啟鎮厄司`}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ) : null}
          </div>
          <button
            className="hall-daily"
            data-testid="home-daily"
            onClick={() => {
              const ok = useSave.getState().claimDaily();
              setMessage(ok ? `今日墨玉 +${DAILY_INK}` : "今日的墨已經領過了");
            }}
          >
            <span>{claimed ? "今日墨玉已領取" : "每日領取"}</span>
            <span>{claimed ? "明日再會" : `+${DAILY_INK} 墨玉`}</span>
          </button>
          {message ? (
            <p className="hall-notice" role="status">
              {message}
            </p>
          ) : null}
          <div className="home-more-cloud">
            <CloudBindChip />
          </div>
        </HomeSheet>
      ) : null}
    </div>
  );
}

export type SummonPool = "character" | "artifact";

/** 召喚 tab: 天命卡池與命器召喚共用同一頁面版面（機率、價格、保底不變）。 */
export function SummonHall({
  message,
  onPull,
  onRates,
  onFreePull,
  onTicketPull,
  pool = "character",
  onPoolChange,
}: {
  message: string | null;
  onPull: (n: 1 | 10) => void;
  /** Kept for API compatibility; the hall no longer shows reveal-preview buttons. */
  onPreview?: (character: Character) => void;
  onRates: () => void;
  /** 今日免費召喚 (one free character single pull per quest-day). */
  onFreePull?: () => void;
  /** 千古召喚券 pull (never falls back to 墨玉). */
  onTicketPull?: (n: 1 | 10) => void;
  pool?: SummonPool;
  onPoolChange?: (pool: SummonPool) => void;
}) {
  const ink = useSave((s) => s.ink);
  const pity = useSave((s) => s.pity);
  const totalPulls = useSave((s) => s.totalPulls);
  const clockReady = useClockReady();
  const now = useNow(15000);
  const questBook = useSave((s) => s.questBook);
  const charTickets = useSave((s) => s.charTickets);
  const freeUsed = clockReady && freeSummonUsed(questBook, now);

  return (
    <div className="hall-scroll summon-scroll scroll-area min-h-0 flex-1 overflow-y-auto">
      <main className="hall-v11 summon-page" data-testid="summon-page">
        <nav className="summon-pools" aria-label="召喚卡池">
          <button
            type="button"
            className={cn(pool === "character" && "on")}
            aria-pressed={pool === "character"}
            data-testid="summon-pool-character"
            onClick={() => onPoolChange?.("character")}
          >
            天命卡池
          </button>
          <button
            type="button"
            className={cn(pool === "artifact" && "on")}
            aria-pressed={pool === "artifact"}
            data-testid="summon-pool-artifact"
            onClick={() => onPoolChange?.("artifact")}
          >
            命器召喚
          </button>
        </nav>
        {pool === "artifact" ? <ArtifactSummon /> : null}
        {pool === "character" ? (
        <>
        <header className="summon-page-head">
          <p className="summon-kicker">一筆牽緣 · 墨門逢君</p>
          <h1>天命卡池</h1>
          <p className="summon-subtitle">五位 SSR 同機率・無限定加成</p>
          <div className="summon-pity">
            <p>
              距離天命 SSR <strong>{Math.max(PITY - pity, 1)}</strong> 抽
            </p>
            <button className="ui-text" onClick={onRates}>
              召喚機率
            </button>
          </div>
          <div className="ink-pity">
            <div style={{ width: `${Math.min(100, (pity / PITY) * 100)}%` }} />
          </div>
        </header>
        <div className="summon-gate" role="img" aria-label="墨線牽緣的召喚宮門">
          <div className="summon-gate-copy"><span>墨線牽緣</span><p>一縷墨線，牽起千古之緣</p></div>
        </div>
        <section className="summon-zone" aria-label="召喚">
          <div className="summon-actions">
            {onFreePull && (!clockReady || !freeUsed) ? (
            <button
              className="ui-quiet summon-one summon-one-free"
              data-testid="free-summon"
              disabled={!clockReady}
              onClick={onFreePull}
            >
              <strong>今日免費召喚</strong>
              <span>免費</span>
              <small>免費角色單抽一次・同卡池與保底</small>
            </button>
            ) : (
            <button
              className={cn("ui-quiet summon-one", ink < COST_ONE && "opacity-50")}
              onClick={() => onPull(1)}
            >
              <strong>單次召喚</strong>
              <span>
                <MoYu /> {COST_ONE} 墨玉
              </span>
              <small>{totalPulls === 0 ? "初次必含 SS 以上" : `計入 ${PITY} 抽 SSR 保底`}</small>
            </button>
            )}
            <button
              className={cn("ui-primary summon-ten", ink < COST_TEN && "opacity-50")}
              onClick={() => onPull(10)}
            >
              <strong>十連召喚</strong>
              <span>
                <MoYu /> {COST_TEN} 墨玉
              </span>
              <small>必含 S 以上{totalPulls === 0 ? " · 初次必含 SS" : ""}</small>
            </button>
          </div>
          {onTicketPull ? (
            <div className="summon-tickets" data-testid="char-tickets">
              <span>
                千古召喚券 <strong>{charTickets}</strong>
              </span>
              <button className="ui-quiet" disabled={charTickets < 1} onClick={() => onTicketPull(1)}>
                用券單抽 · 1 張
              </button>
              <button className="ui-quiet" disabled={charTickets < 10} onClick={() => onTicketPull(10)}>
                用券十連 · 10 張
              </button>
            </div>
          ) : null}
          {message ? (
            <p className="hall-notice" role="status">
              {message}
            </p>
          ) : null}
        </section>
        </>
        ) : null}
      </main>
    </div>
  );
}

export function TopBar({
  onLetters,
  onQuest,
}: {
  /** 提醒 → 千年書信 (existing letters screen). */
  onLetters?: () => void;
  /** 提醒 → 修行簿 (existing quest book). */
  onQuest?: () => void;
} = {}) {
  const ink = useSave((s) => s.ink);
  const marks = useSave((s) => s.marks);
  const muted = useSave((s) => s.muted);
  const sgNick = useSave((s) => s.sgNick);
  const [settings, setSettings] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { unread, questDot } = useHomeAlerts();
  const showAlerts = !!(onLetters || onQuest);
  const alertCount = (onLetters && unread > 0 ? 1 : 0) + (onQuest && questDot ? 1 : 0);
  return (
    <header className="ink-top safe-top flex items-center justify-between px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          className="ink-avatar-btn shrink-0"
          aria-label="設定 · 頭貼與名字"
          data-testid="open-settings"
          onClick={() => setSettings(true)}
        >
          <PlayerAvatar />
        </button>
        <div className="min-w-0">
          <p className="font-serif text-xl tracking-[0.35em] text-fg">千古遇</p>
          {sgNick ? (
            <p
              className="truncate text-[0.65rem] tracking-[0.12em] text-fg/70"
              data-testid="topbar-name"
            >
              {sgNick}
            </p>
          ) : (
            <p className="hidden whitespace-nowrap text-[0.65rem] tracking-[0.15em] text-fg/70 min-[440px]:block">
              R → S → SS → SSR
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 min-[440px]:gap-2">
        <div className="ink-purse flex items-center gap-1.5 text-gold">
          <MoYu className="ink-purse-icon" />
          <span className="tabular-nums">{ink}</span>
          <span className="sr-only">墨玉</span>
        </div>
        <div
          className="ink-purse mohen-purse flex items-center gap-1.5 text-gold"
          data-testid="mohen-purse"
        >
          <MoHen className="ink-purse-icon" />
          <span className="tabular-nums">{marks}</span>
          <span className="sr-only">墨痕</span>
        </div>
        {showAlerts ? (
          <button
            type="button"
            className="ink-round ink-alerts grid h-11 w-11 place-items-center rounded-full border border-line text-fg"
            aria-label={alertCount ? `提醒・${alertCount} 則` : "提醒"}
            aria-haspopup="dialog"
            data-testid="open-alerts"
            onClick={() => setAlertsOpen(true)}
          >
            <Bell className="h-4 w-4" />
            {alertCount ? <i className="ink-alerts-dot" aria-hidden /> : null}
          </button>
        ) : null}
        <button
          type="button"
          className="ink-round grid h-11 w-11 place-items-center rounded-full border border-line text-fg"
          aria-label={muted ? "開啟聲音" : "關閉聲音"}
          onClick={() => {
            const next = !useSave.getState().muted;
            if (!next) ensureAudio();
            useSave.getState().toggleMuted();
          }}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
      <CloudHost />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
      {alertsOpen ? (
        <HomeSheet title="提醒" onClose={() => setAlertsOpen(false)} testId="alerts-sheet">
          {alertCount ? (
            <div className="hall-entry-grid home-more-list">
              {onLetters && unread > 0 ? (
                <button
                  className="hall-entry"
                  data-testid="alert-letters"
                  onClick={() => {
                    setAlertsOpen(false);
                    onLetters();
                  }}
                >
                  <Mail size={24} strokeWidth={1.3} />
                  <span>
                    <strong>
                      千年書信<i className="unread-badge">{unread}</i>
                    </strong>
                    <small>有 {unread} 封未讀書信</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ) : null}
              {onQuest && questDot ? (
                <button
                  className="hall-entry"
                  data-testid="alert-quest"
                  onClick={() => {
                    setAlertsOpen(false);
                    onQuest();
                  }}
                >
                  <ScrollText size={24} strokeWidth={1.3} />
                  <span>
                    <strong>修行簿</strong>
                    <small>有可領取的獎勵</small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ) : null}
            </div>
          ) : (
            <p className="home-sheet-empty">目前沒有新的提醒</p>
          )}
        </HomeSheet>
      ) : null}
    </header>
  );
}
