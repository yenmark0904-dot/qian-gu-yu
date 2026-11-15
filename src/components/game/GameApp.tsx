import { Letters } from "./Letters";
import { ArtifactHall, type ArtifactTab } from "./ArtifactHall";
import { QuestBook } from "./QuestBook";
import { Raid } from "./Raid";
import { questDay, teamHasArtifact, type GoTarget } from "@/game/quests";
import { fightTeam } from "@/game/team";
import { CHARACTERS } from "@/game/data";
import { artifactUnlocks } from "@/game/artifacts";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Feather, Gem, Home as HomeIcon, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/components/game/bits";
import { Cinematic, Ritual, prefetchReveal } from "@/components/game/Cinematic";
import { Codex } from "@/components/game/Codex";
import { DailyGift } from "@/components/game/DailyGift";
import { Home, SummonHall, TopBar, type SummonPool } from "@/components/game/Hall";
import { Match3 } from "@/components/game/Match3";
import { Rates } from "@/components/game/Rates";
import { Results } from "@/components/game/Results";
import { SummonReveal } from "@/components/game/SummonReveal";
import { demoAllowed, demoCards, markSummonWatched, readLastSummon, recordLastSummon } from "@/game/summon-reveal";
import { Shengong } from "@/components/game/Shengong";
import { Shop } from "@/components/game/Shop";
import { Survey, SurveyInvite, readSurveyLocal, writeSurveyLocal } from "@/components/game/Survey";
import { shouldInvite } from "@/game/feedback";
import { totalStars } from "@/game/levels";
import { ensureAudio, playBonusDone, playRitual, primeVoice } from "@/game/audio";
import { markPrompted, readPromptedDay, shouldPromptDaily } from "@/game/daily";
import type { Character } from "@/game/data";
import { DAILY_INK, RANK, bestIndex, localDay, type PullCard } from "@/game/logic";
import { useSave } from "@/game/store";

/** 墨門 (home) is the landing tab (t487); 召喚 holds the gacha UI; 機率 is reached from 召喚. */
type Tab = "home" | "summon" | "codex" | "shop" | "rates";

type Overlay =
  | { type: "none" }
  | { type: "ritual"; cards: PullCard[] }
  | { type: "cine"; queue: PullCard[]; index: number; cards: PullCard[]; preview: boolean }
  | { type: "results"; cards: PullCard[]; focus: number }
  /** 召喚揭曉「一筆牽緣，墨門逢君」: cards are already settled + saved by store.pull(). */
  | {
      type: "summon";
      cards: PullCard[];
      n: 1 | 10;
      key: number;
      demo?: boolean;
      startAtResults?: boolean;
      saveNote?: string | null;
    };

/** Confirm the pull reached localStorage (zustand persist writes synchronously inside set()). */
function savedPullsOnDisk(): number | null {
  try {
    const raw = window.localStorage.getItem("qiangu-yu");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { totalPulls?: number } };
    return typeof parsed.state?.totalPulls === "number" ? parsed.state.totalPulls : null;
  } catch {
    return null;
  }
}

function toSpecial(cards: PullCard[]) {
  return cards
    .filter(
      (card) =>
        card.character.rarity === "S" ||
        card.character.rarity === "SS" ||
        card.character.rarity === "SSR",
    )
    .slice()
    .sort((a, b) => RANK[b.character.rarity] - RANK[a.character.rarity]);
}

/** A single pull that is a duplicate still lands on the result screen, so its 緣分 feedback is seen. */
const isDupe = (cards: PullCard[]) => cards.some((card) => !card.isNew);

export function GameApp() {
  const [tab, setTab] = useState<Tab>("home");
  const backdrop = useSave((s) => s.backdrop);
  const [overlay, setOverlay] = useState<Overlay>({ type: "none" });
  const [message, setMessage] = useState<string | null>(null);
  const [codexFocus, setCodexFocus] = useState<string | null>(null);
  const [lettersOpen, setLettersOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [artifactsTab, setArtifactsTab] = useState<ArtifactTab | undefined>(undefined);
  const [summonPool, setSummonPool] = useState<SummonPool>("character");
  const [lettersFocus, setLettersFocus] = useState<string | undefined>();
  const [matchOpen, setMatchOpen] = useState(false);
  const [shengongOpen, setShengongOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [raidOpen, setRaidOpen] = useState(false);
  const met = useSave((s) => Object.keys(s.owned).length);
  const [hydrated, setHydrated] = useState(false);
  const [daily, setDaily] = useState(false);
  const lastDaily = useSave((s) => s.lastDaily);

  useEffect(() => {
    const unsub = useSave.persist.onFinishHydration(() => setHydrated(true));
    if (!useSave.persist.hasHydrated()) void useSave.persist.rehydrate();
    else setHydrated(true);
    return unsub;
  }, []);

  // 今日領取 pops by itself on the home screen when today's 墨玉 is unclaimed — once a day (claim or
  // 稍後 both count), never over the summon reveal, the 三消 screen or any other open dialog.
  const [dayTick, setDayTick] = useState(0);
  const idle =
    hydrated &&
    (tab === "home" || tab === "summon") &&
    overlay.type === "none" &&
    !matchOpen &&
    !shengongOpen &&
    !lettersOpen &&
    !artifactsOpen &&
    !questOpen &&
    !raidOpen;
  useEffect(() => {
    if (!idle || daily) return;
    const today = localDay();
    if (!shouldPromptDaily(lastDaily, readPromptedDay(), today)) return;
    const id = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]')) return;
      setDaily(true);
    }, 700);
    return () => window.clearTimeout(id);
  }, [idle, daily, lastDaily, dayTick]);
  useEffect(() => {
    // Coming back to the tab on a new day re-checks (the game can sit open overnight).
    const onVis = () => {
      if (document.visibilityState === "visible") setDayTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    if (daily && !idle) setDaily(false);
  }, [daily, idle]);
  // 修行簿 · 初入墨境: the first valid entry of each quest-day (Taipei 04:00). Also re-checked when the tab
  // comes back and once a minute, so a game left open across 04:00 counts the new day's entry.
  useEffect(() => {
    if (!hydrated) return;
    const fire = () => {
      const s = useSave.getState();
      if (s.questBook.day !== questDay(Date.now()) || s.questBook.counts.LOGIN_COMPLETED === 0)
        s.questEvent("LOGIN_COMPLETED");
    };
    fire();
    const id = window.setInterval(fire, 60_000);
    return () => window.clearInterval(id);
  }, [hydrated, dayTick]);

  // 玩家心聲 ♡: one gentle invite after the first 召喚 or first 三消 clear — shown once, stored locally.
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [invite, setInvite] = useState(false);
  const playedOnce = useSave((s) => s.totalPulls > 0 || totalStars(s.m3) > 0);
  useEffect(() => {
    if (!idle || daily || invite || surveyOpen || !playedOnce) return;
    if (!shouldInvite(readSurveyLocal(), true)) return;
    const id = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]')) return;
      writeSurveyLocal({ invited: true });
      setInvite(true);
    }, 1600);
    return () => window.clearTimeout(id);
  }, [idle, daily, invite, surveyOpen, playedOnce]);
  const inviteLater = useCallback(() => {
    writeSurveyLocal({ invited: true, dismissed: true });
    setInvite(false);
  }, []);
  const inviteOpen = useCallback(() => {
    writeSurveyLocal({ invited: true });
    setInvite(false);
    setSurveyOpen(true);
  }, []);

  const dailyLater = useCallback(() => {
    markPrompted(localDay());
    setDaily(false);
  }, []);
  const dailyClaim = useCallback(() => {
    markPrompted(localDay());
    setDaily(false);
    const ok = useSave.getState().claimDaily();
    setMessage(ok ? `今日墨玉 +${DAILY_INK}` : "今日的墨已經領過了");
    if (ok) {
      ensureAudio();
      playBonusDone(useSave.getState().muted);
    }
  }, []);

  useEffect(() => {
    if (overlay.type !== "ritual") return;
    const cards = overlay.cards;
    const id = window.setTimeout(() => {
      const specials = toSpecial(cards);
      if (specials.length > 0) {
        setOverlay({ type: "cine", queue: specials, index: 0, cards, preview: false });
      } else {
        setOverlay({ type: "results", cards, focus: bestIndex(cards) });
      }
    }, 900);
    return () => window.clearTimeout(id);
  }, [overlay]);

  // One pull per tap: a rapid second tap (same frame, before the overlay renders) is ignored.
  const pullLock = useRef(false);
  useEffect(() => {
    pullLock.current = false;
  }, [overlay]);
  const pull = (n: 1 | 10, pay: "ink" | "ticket" | "free" = "ink") => {
    if (!useSave.persist.hasHydrated()) return;
    if (pullLock.current) return;
    pullLock.current = true;
    let result: ReturnType<ReturnType<typeof useSave.getState>["pull"]> | "used";
    const before = useSave.getState().totalPulls;
    try {
      // the existing transaction: cost check, rates, pity, 緣分, 墨痕 and tier 墨玉 settle here, once
      result =
        pay === "free"
          ? useSave.getState().pullFree()
          : useSave.getState().pull(n, pay);
    } catch {
      pullLock.current = false;
      setOverlay({ type: "none" });
      setMessage("召喚未完成，請稍後再試。");
      return;
    }
    if (result === "used") {
      pullLock.current = false;
      setMessage("今日的免費召喚已經用過了，明日四時再來。");
      return;
    }
    if (result === "no-tickets") {
      // Never falls back to 墨玉: the player chooses an ink pull themselves.
      pullLock.current = false;
      setMessage("千古召喚券不足。可改用墨玉召喚，或等券數足夠再抽。");
      return;
    }
    if (result === "broke") {
      pullLock.current = false;
      setOverlay({ type: "none" });
      setMessage("墨玉不夠了。玩一局三消，就能再喚人。");
      setMatchOpen(true);
      setTab("summon");
      return;
    }
    // saved BEFORE any animation: the state is persisted; the reveal only reads these settled cards
    const onDisk = savedPullsOnDisk();
    const saveNote =
      onDisk === before + n ? null : "此次結果已入帳，但本機存檔寫入未能確認；請保持網路與儲存空間，稍後再開啟遊戲確認。";
    recordLastSummon(result, n);
    ensureAudio();
    primeVoice();
    setMessage(null);
    setTab("summon");
    setOverlay({ type: "summon", cards: result, n, key: Date.now(), saveNote });
  };

  // Re-entry after an interrupted reveal (refresh / backgrounded / closed mid-way): offer the last result.
  const [pending, setPending] = useState<ReturnType<typeof readLastSummon>>(null);
  useEffect(() => {
    if (!hydrated) return;
    const last = readLastSummon();
    setPending(last && !last.watched ? last : null);
  }, [hydrated, overlay.type]);

  // Dev preview (?summonDemo=…): test data only, never written to the save, ignored on the live host.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    if (!demoAllowed(window.location.hostname)) return;
    const demo = demoCards(new URLSearchParams(window.location.search));
    if (!demo) return;
    setOverlay({ type: "summon", cards: demo.cards, n: demo.n, key: Date.now(), demo: true });
  }, [hydrated]);

  /** 修行簿「前往」: really opens the place where the quest is done. */
  const questGo = (target: GoTarget) => {
    const s = useSave.getState();
    const u = artifactUnlocks(s.m3);
    setQuestOpen(false);
    if (target === "codex") {
      setTab("codex");
    } else if (target === "raid") {
      if (u.raid) setRaidOpen(true);
      else setMatchOpen(true);
    } else if (target === "refine") {
      // 命器養成 (t445u): 強化命器一次 → 命器閣 · 命器淬鍊.
      if (u.vault) {
        setArtifactsTab("refine");
        setArtifactsOpen(true);
      } else setMatchOpen(true);
    } else if (target === "artifacts") {
      // Someone in the 戰隊 already wears a 命器 → go play; otherwise go equip one first.
      const team = fightTeam(s.raid.team, s.owned, CHARACTERS, s.assist);
      if (u.vault && !teamHasArtifact(team, s.artifacts)) setArtifactsOpen(true);
      else setMatchOpen(true);
    } else if (target === "match3" || target === "story") {
      setMatchOpen(true);
    } else if (target === "free-summon") {
      setSummonPool("character");
      setTab("summon");
      window.setTimeout(
        () => document.querySelector('[data-testid="free-summon"]')?.scrollIntoView({ block: "center", behavior: "smooth" }),
        80,
      );
    }
  };

  const openLetters = (id?: string) => {
    setLettersFocus(id);
    setLettersOpen(true);
  };

  const openPreview = (character: Character) => {
    const count = useSave.getState().owned[character.id] ?? 0;
    const card: PullCard = { character, isNew: false, count, refund: 0 };
    prefetchReveal([card]);
    ensureAudio();
    primeVoice();
    playRitual(useSave.getState().muted);
    setOverlay({ type: "cine", queue: [card], index: 0, cards: [card], preview: true });
  };

  const skipRitual = () => {
    if (overlay.type !== "ritual") return;
    const specials = toSpecial(overlay.cards);
    if (specials.length > 0) {
      setOverlay({ type: "cine", queue: specials, index: 0, cards: overlay.cards, preview: false });
    } else {
      setOverlay({ type: "results", cards: overlay.cards, focus: bestIndex(overlay.cards) });
    }
  };

  const cine = overlay.type === "cine" ? overlay : null;
  const current = cine ? cine.queue[cine.index] : null;
  const more = cine ? cine.index < cine.queue.length - 1 : false;
  const multi = cine ? !cine.preview && cine.cards.length > 1 : false;

  const finishCine = () => {
    if (!cine) return;
    if (more) {
      setOverlay({ ...cine, index: cine.index + 1 });
      return;
    }
    if (cine.preview || (cine.cards.length === 1 && !isDupe(cine.cards))) {
      setOverlay({ type: "none" });
      return;
    }
    setOverlay({ type: "results", cards: cine.cards, focus: bestIndex(cine.cards) });
  };

  const skipRest = () => {
    if (!cine) return;
    if (cine.preview || (cine.cards.length <= 1 && !isDupe(cine.cards))) {
      setOverlay({ type: "none" });
      return;
    }
    setOverlay({ type: "results", cards: cine.cards, focus: bestIndex(cine.cards) });
  };

  let primaryLabel = "收下";
  let secondaryLabel: string | null = null;
  if (cine?.preview) primaryLabel = "關閉";
  else if (cine && cine.cards.length === 1 && isDupe(cine.cards)) primaryLabel = "看緣分";
  else if (more) {
    primaryLabel = "下一位";
    secondaryLabel = "跳過其餘";
  } else if (multi) {
    primaryLabel = "查看全部";
    secondaryLabel = "回到墨池";
  }

  return (
    <div
      className="motion ink-stage relative flex h-dvh flex-col overflow-hidden bg-bg text-fg"
      data-tab={tab}
      data-backdrop={backdrop}
    >
      <div className="ink-backdrop pointer-events-none absolute inset-0" aria-hidden />
      <div className="scrim pointer-events-none absolute inset-0" />
      <div className="ink-ui relative z-10 flex min-h-0 flex-1 flex-col">
        <TopBar onLetters={() => openLetters()} onQuest={() => setQuestOpen(true)} />
        {tab === "home" ? (
          <Home
            message={message}
            setMessage={setMessage}
            onMatch={() => setMatchOpen(true)}
            onLetters={openLetters}
            onCodex={(id) => {
              setCodexFocus(id);
              setTab("codex");
            }}
            onSummon={() => {
              setSummonPool("character");
              setTab("summon");
            }}
            onArtifacts={() => setArtifactsOpen(true)}
            onRaid={() => setRaidOpen(true)}
            onQuest={() => setQuestOpen(true)}
          />
        ) : null}
        {tab === "summon" ? (
          <SummonHall
            message={message}
            onPull={pull}
            onPreview={openPreview}
            onRates={() => setTab("rates")}
            onFreePull={() => pull(1, "free")}
            onTicketPull={(n) => pull(n, "ticket")}
            pool={summonPool}
            onPoolChange={setSummonPool}
          />
        ) : null}
        {tab === "codex" ? (
          <Codex
            onReplay={openPreview}
            focusId={codexFocus}
            onFocused={() => setCodexFocus(null)}
          />
        ) : null}
        {tab === "shop" ? <Shop /> : null}
        {tab === "rates" ? <Rates onPreview={openPreview} /> : null}
        <nav className="ink-nav safe-bottom grid grid-cols-6 border-t border-line bg-surface">
          <TabButton active={tab === "home"} label="墨門" onClick={() => setTab("home")} testId="nav-home">
            <HomeIcon className="h-[18px] w-[18px]" />
          </TabButton>
          <TabButton
            active={tab === "summon" || tab === "rates"}
            label="召喚"
            onClick={() => setTab("summon")}
            testId="nav-summon"
          >
            <Sparkles className="h-[18px] w-[18px]" />
          </TabButton>
          <TabButton
            active={tab === "codex"}
            label="圖鑑"
            ariaLabel={`圖鑑 ${met}`}
            badge={met}
            onClick={() => setTab("codex")}
            testId="nav-codex"
          >
            <BookOpen className="h-[18px] w-[18px]" />
          </TabButton>
          <TabButton active={tab === "shop"} label="墨寶閣" onClick={() => setTab("shop")} testId="nav-shop">
            <Gem className="h-[18px] w-[18px]" />
          </TabButton>
          <TabButton
            active={shengongOpen}
            label="深宮榜"
            onClick={() => setShengongOpen(true)}
            testId="nav-shengong"
          >
            <Trophy className="h-[18px] w-[18px]" />
          </TabButton>
          <TabButton
            active={surveyOpen}
            label="建言"
            ariaLabel="建言"
            onClick={() => setSurveyOpen(true)}
            testId="nav-survey"
          >
            <Feather className="h-[18px] w-[18px]" />
          </TabButton>
        </nav>
      </div>

      {overlay.type === "ritual" ? <Ritual onSkip={skipRitual} /> : null}
      {cine && current ? (
        <Cinematic
          key={`${current.character.id}-${cine.index}`}
          card={current}
          preview={cine.preview}
          primaryLabel={primaryLabel}
          secondaryLabel={secondaryLabel}
          onPrimary={finishCine}
          onSecondary={
            secondaryLabel ? (more ? skipRest : () => setOverlay({ type: "none" })) : null
          }
        />
      ) : null}
      {overlay.type === "summon" ? (
        <SummonReveal
          key={overlay.key}
          cards={overlay.cards}
          n={overlay.n}
          demo={overlay.demo}
          startAtResults={overlay.startAtResults}
          saveNote={overlay.saveNote ?? null}
          onClose={() => setOverlay({ type: "none" })}
          onAgain={(n) => {
            if (overlay.demo) return;
            pull(n);
          }}
          onOpenCodex={(character) => {
            setOverlay({ type: "none" });
            setCodexFocus(character.id);
            setTab("codex");
          }}
        />
      ) : null}
      {pending && idle && !daily ? (
        <div className="sm-resume" role="status">
          <span>上次{pending.n === 10 ? "十連" : "單抽"}召喚的結果尚未看完</span>
          <button
            type="button"
            className="sm-btn sm-btn-primary"
            onClick={() =>
              setOverlay({ type: "summon", cards: pending.cards, n: pending.n, key: Date.now(), startAtResults: true })
            }
          >
            查看結果
          </button>
          <button
            type="button"
            className="sm-btn sm-btn-ghost"
            onClick={() => {
              markSummonWatched();
              setPending(null);
            }}
          >
            不用了
          </button>
        </div>
      ) : null}
      {overlay.type === "results" ? (
        <Results
          cards={overlay.cards}
          onClose={() => setOverlay({ type: "none" })}
          onAgain={pull}
          onOpenCodex={(character) => {
            setOverlay({ type: "none" });
            setCodexFocus(character.id);
            setTab("codex");
          }}
        />
      ) : null}
      {lettersOpen ? (
        <Letters initialCharacter={lettersFocus} onClose={() => setLettersOpen(false)} />
      ) : null}
      {matchOpen ? <Match3 onClose={() => setMatchOpen(false)} /> : null}
      {artifactsOpen ? (
        <ArtifactHall
          initialTab={artifactsTab}
          onSummon={() => {
            setArtifactsOpen(false);
            setArtifactsTab(undefined);
            setSummonPool("artifact");
            setTab("summon");
          }}
          onClose={() => {
            setArtifactsOpen(false);
            setArtifactsTab(undefined);
          }}
        />
      ) : null}
      {shengongOpen ? <Shengong onClose={() => setShengongOpen(false)} /> : null}
      {questOpen ? <QuestBook onClose={() => setQuestOpen(false)} onGo={questGo} /> : null}
      {raidOpen ? (
        <div className="ink-overlay m3-screen fixed inset-0 z-40 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="鎮厄司">
          <Raid onClose={() => setRaidOpen(false)} />
        </div>
      ) : null}
      {daily && idle ? <DailyGift onClaim={dailyClaim} onLater={dailyLater} /> : null}
      {invite && idle && !daily && !surveyOpen ? (
        <SurveyInvite onOpen={inviteOpen} onLater={inviteLater} />
      ) : null}
      {surveyOpen ? <Survey onClose={() => setSurveyOpen(false)} /> : null}
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
  children,
  testId,
  ariaLabel,
  badge,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
  ariaLabel?: string;
  /** Small count dot (e.g. 圖鑑 met count) so long labels don't overflow at 320px. */
  badge?: number;
}) {
  return (
    <button
      type="button"
      className={cn(
        "ink-tab flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 text-xs",
        active ? "text-gold" : "text-muted",
      )}
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      data-testid={testId}
    >
      <span className="ink-tab-icon" aria-hidden={ariaLabel ? true : undefined}>
        {children}
        {badge !== undefined ? <i className="ink-tab-badge">{badge > 99 ? "99+" : badge}</i> : null}
      </span>
      <span className="ink-tab-label whitespace-nowrap" aria-hidden={ariaLabel ? true : undefined}>
        {label}
      </span>
    </button>
  );
}
