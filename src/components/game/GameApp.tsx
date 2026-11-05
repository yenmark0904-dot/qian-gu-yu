import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BookOpen, Gem, Landmark, Sparkles } from "lucide-react";
import { cn } from "@/components/game/bits";
import { Cinematic, Ritual, prefetchReveal } from "@/components/game/Cinematic";
import { Codex } from "@/components/game/Codex";
import { DailyGift } from "@/components/game/DailyGift";
import { Hall, TopBar } from "@/components/game/Hall";
import { Match3 } from "@/components/game/Match3";
import { Rates } from "@/components/game/Rates";
import { Results } from "@/components/game/Results";
import { Shop } from "@/components/game/Shop";
import { ensureAudio, playBonusDone, playRitual, primeVoice } from "@/game/audio";
import { markPrompted, readPromptedDay, shouldPromptDaily } from "@/game/daily";
import type { Character } from "@/game/data";
import { DAILY_INK, RANK, bestIndex, localDay, type PullCard } from "@/game/logic";
import { useSave } from "@/game/store";

type Tab = "summon" | "codex" | "shop" | "rates";

type Overlay =
  | { type: "none" }
  | { type: "ritual"; cards: PullCard[] }
  | { type: "cine"; queue: PullCard[]; index: number; cards: PullCard[]; preview: boolean }
  | { type: "results"; cards: PullCard[]; focus: number };

function toSpecial(cards: PullCard[]) {
  return cards
    .filter((card) => card.character.rarity === "S" || card.character.rarity === "SS" || card.character.rarity === "SSR")
    .slice()
    .sort((a, b) => RANK[b.character.rarity] - RANK[a.character.rarity]);
}

export function GameApp() {
  const [tab, setTab] = useState<Tab>("summon");
  const backdrop = useSave((s) => s.backdrop);
  const [overlay, setOverlay] = useState<Overlay>({ type: "none" });
  const [message, setMessage] = useState<string | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
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
  const idle = hydrated && tab === "summon" && overlay.type === "none" && !matchOpen;
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

  const pull = (n: 1 | 10) => {
    if (!useSave.persist.hasHydrated()) return;
    const result = useSave.getState().pull(n);
    if (result === "broke") {
      setMessage("墨玉不夠了。玩一局三消，就能再喚人。");
      setMatchOpen(true);
      setTab("summon");
      return;
    }
    ensureAudio();
    primeVoice();
    playRitual(useSave.getState().muted);
    setMessage(null);
    setTab("summon");
    prefetchReveal(result);
    setOverlay({ type: "ritual", cards: result });
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
    if (cine.preview || cine.cards.length === 1) {
      setOverlay({ type: "none" });
      return;
    }
    setOverlay({ type: "results", cards: cine.cards, focus: bestIndex(cine.cards) });
  };

  const skipRest = () => {
    if (!cine) return;
    if (cine.preview || cine.cards.length <= 1) {
      setOverlay({ type: "none" });
      return;
    }
    setOverlay({ type: "results", cards: cine.cards, focus: bestIndex(cine.cards) });
  };

  let primaryLabel = "收下";
  let secondaryLabel: string | null = null;
  if (cine?.preview) primaryLabel = "關閉";
  else if (more) {
    primaryLabel = "下一位";
    secondaryLabel = "跳過其餘";
  } else if (multi) {
    primaryLabel = "查看全部";
    secondaryLabel = "回到墨池";
  }

  return (
    <div className="motion ink-stage relative flex h-dvh flex-col overflow-hidden bg-bg text-fg" data-tab={tab} data-backdrop={backdrop}>
      <div className="ink-backdrop pointer-events-none absolute inset-0" aria-hidden />
      <div className="scrim pointer-events-none absolute inset-0" />
      <div className="ink-ui relative z-10 flex min-h-0 flex-1 flex-col">
        <TopBar />
        {tab === "summon" ? (
          <Hall
            message={message}
            setMessage={setMessage}
            onPull={pull}
            onPreview={openPreview}
            onMatch={() => setMatchOpen(true)}
          />
        ) : null}
        {tab === "codex" ? <Codex onReplay={openPreview} /> : null}
        {tab === "shop" ? <Shop /> : null}
        {tab === "rates" ? <Rates onPreview={openPreview} /> : null}
        <nav className="ink-nav safe-bottom grid grid-cols-4 border-t border-line bg-surface">
          <TabButton active={tab === "summon"} label="召喚" onClick={() => setTab("summon")}>
            <Sparkles className="h-4 w-4" />
          </TabButton>
          <TabButton active={tab === "codex"} label={`圖鑑 ${met}`} onClick={() => setTab("codex")}>
            <BookOpen className="h-4 w-4" />
          </TabButton>
          <TabButton active={tab === "shop"} label="墨寶閣" onClick={() => setTab("shop")}>
            <Landmark className="h-4 w-4" />
          </TabButton>
          <TabButton active={tab === "rates"} label="機率" onClick={() => setTab("rates")}>
            <Gem className="h-4 w-4" />
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
          onSecondary={secondaryLabel ? (more ? skipRest : () => setOverlay({ type: "none" })) : null}
        />
      ) : null}
      {overlay.type === "results" ? (
        <Results cards={overlay.cards} onClose={() => setOverlay({ type: "none" })} onAgain={pull} />
      ) : null}
      {matchOpen ? (
        <Match3 onClose={() => setMatchOpen(false)} />
      ) : null}
      {daily && idle ? <DailyGift onClaim={dailyClaim} onLater={dailyLater} /> : null}
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn("flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs", active ? "text-gold" : "text-muted")}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
      {label}
    </button>
  );
}
