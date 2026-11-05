import { useEffect, useState } from "react";
import { ChevronRight, Star, Volume2, VolumeX } from "lucide-react";
import { MoHen, MoYu, Portrait, RarityMark, cn } from "@/components/game/bits";
import { SPOTLIGHT, type Character } from "@/game/data";
import { COST_ONE, COST_TEN, DAILY_INK, PITY, localDay } from "@/game/logic";
import { useSave } from "@/game/store";
import { ensureAudio } from "@/game/audio";
import { MAX_STARS, totalStars } from "@/game/levels";

export function Hall({
  message,
  setMessage,
  onPull,
  onMatch,
}: {
  message: string | null;
  setMessage: (value: string | null) => void;
  onPull: (n: 1 | 10) => void;
  /** Kept for API compatibility; the hall no longer shows reveal-preview buttons. */
  onPreview?: (character: Character) => void;
  onMatch: () => void;
}) {
  const ink = useSave((s) => s.ink);
  const pity = useSave((s) => s.pity);
  const muted = useSave((s) => s.muted);
  const totalPulls = useSave((s) => s.totalPulls);
  const lastDaily = useSave((s) => s.lastDaily);
  const m3Stars = useSave((s) => totalStars(s.m3));
  const [banner, setBanner] = useState(0);
  const [clockReady, setClockReady] = useState(false);

  useEffect(() => {
    const finish = () => setClockReady(true);
    const unsub = useSave.persist.onFinishHydration(finish);
    if (useSave.persist.hasHydrated()) finish();
    return unsub;
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || SPOTLIGHT.length < 2) return;
    const id = window.setInterval(() => setBanner((i) => (i + 1) % SPOTLIGHT.length), 4200);
    return () => window.clearInterval(id);
  }, []);

  const claimed = clockReady && lastDaily === localDay();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="hall-stage mx-auto flex w-full max-w-sm flex-col items-center">
          <div className="hall-intro flex flex-col items-center gap-1.5 text-center">
            <p className="ink-tagline text-sm">以墨為引，與千年之人相逢</p>
            {totalPulls === 0 ? <p className="ink-vow text-xs">初遇之約：第一次召喚必含 SS 以上</p> : null}
          </div>

          <div className="banner ink-frame relative overflow-hidden">
            {SPOTLIGHT.map((character, index) => (
              <div
                key={character.id}
                className={cn(
                  "absolute inset-0 transition-opacity duration-700",
                  index === banner ? "opacity-100" : "opacity-0",
                )}
              >
                <Portrait id={character.id} name={character.name} className="h-full w-full object-contain object-center" />
                <div className="card-shade absolute inset-0" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-[0.65rem] tracking-[0.3em] text-gold">本期天命</p>
                  <RarityMark rarity="SSR" />
                  <h2 className="mt-1 font-serif text-2xl tracking-[0.12em] text-[#f3eadc]" style={{ color: "#f3eadc", textShadow: "0 1px 8px #100e0c" }}>{character.name}</h2>
                  <p className="text-xs text-[#f3eadc]" style={{ color: "#f3eadc", textShadow: "0 1px 6px #100e0c" }}>
                    {character.epithet} · {character.era}
                  </p>
                </div>
              </div>
            ))}
            <div className="absolute right-0 top-0 flex">
              {SPOTLIGHT.map((character, index) => (
                <button
                  key={character.id}
                  type="button"
                  aria-label={`看${character.name}`}
                  className="grid h-9 w-7 place-items-center"
                  onClick={() => setBanner(index)}
                >
                  <span className={cn("h-1.5 w-1.5 rotate-45", index === banner ? "bg-gold" : "bg-fg/50")} />
                </button>
              ))}
            </div>
          </div>

          <div className="hall-controls ink-glass flex w-full flex-col gap-2.5 p-3">
            <div>
              <div className="flex min-h-8 items-center justify-between gap-2">
                <p className="text-xs tracking-[0.08em] tabular-nums text-muted">
                  距離天命 SSR 還有 {Math.max(PITY - pity, 1)} 抽
                </p>
                <button
                  type="button"
                  className={cn("ink-daily-chip inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs", !claimed && "ink-daily-chip-on")}
                  data-testid="home-daily"
                  onClick={() => {
                    const ok = useSave.getState().claimDaily();
                    setMessage(ok ? `今日墨玉 +${DAILY_INK}` : "今日的墨已經領過了");
                  }}
                >
                  {claimed ? (
                    "今日已領"
                  ) : (
                    <>
                      領取今日 <MoYu /> +{DAILY_INK}
                      <span className="sr-only">墨玉</span>
                    </>
                  )}
                </button>
              </div>
              <div className="ink-pity mt-1.5 h-[3px] overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-gold" style={{ width: `${Math.min(100, (pity / PITY) * 100)}%` }} />
              </div>
            </div>
            {message ? (
              <p className="text-center text-sm text-cinnabar" role="status">
                {message}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                className={cn(
                  "ink-btn-one min-h-12 rounded-lg transition-transform duration-150 ease-out active:scale-[0.96]",
                  ink < COST_ONE && "opacity-50",
                )}
                onClick={() => onPull(1)}
              >
                <span className="block font-serif tracking-[0.3em]">單抽</span>
                <span className="inline-flex items-center justify-center gap-1 text-xs tabular-nums opacity-90">
                  <MoYu />
                  {COST_ONE}
                  <span className="sr-only">墨玉</span>
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  "ink-btn-ten min-h-12 rounded-lg transition-transform duration-150 ease-out active:scale-[0.96]",
                  ink < COST_TEN && "opacity-50",
                )}
                onClick={() => onPull(10)}
              >
                <span className="block font-serif tracking-[0.3em]">十連</span>
                <span className="inline-flex items-center justify-center gap-1 text-xs tabular-nums opacity-90">
                  <MoYu />
                  {COST_TEN}
                  <span className="sr-only">墨玉</span> · 必含 S
                </span>
              </button>
            </div>
            <button
              type="button"
              className="ink-btn-match group flex min-h-[3.75rem] w-full items-center gap-3 rounded-xl px-3 text-left transition-transform duration-150 ease-out active:scale-[0.98]"
              onClick={onMatch}
              data-testid="home-match"
            >
              <img src="/jade/jade-0-qing@2x.webp" alt="" aria-hidden className="ink-btn-match-jade h-10 w-10 shrink-0 object-contain" />
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg tracking-[0.35em] text-[#f6ecd9]">三消 · 闖關</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] tracking-[0.08em] text-[#d9cdb8]">
                  過關換墨玉
                  <span className="inline-flex items-center gap-0.5 tabular-nums text-[#f2cf7e]">
                    <Star className="h-3 w-3 fill-current" aria-hidden />
                    {m3Stars}/{MAX_STARS}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#f2cf7e] transition-transform group-active:translate-x-0.5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TopBar() {
  const ink = useSave((s) => s.ink);
  const marks = useSave((s) => s.marks);
  const muted = useSave((s) => s.muted);
  return (
    <header className="ink-top safe-top flex items-center justify-between px-4">
      <div className="flex items-center gap-2.5">
        <span className="ink-seal" aria-hidden>
          遇
        </span>
        <div>
          <p className="font-serif text-xl tracking-[0.35em] text-fg">千古遇</p>
          <p className="hidden whitespace-nowrap text-[0.65rem] tracking-[0.15em] text-fg/70 min-[440px]:block">R → S → SS → SSR</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 min-[440px]:gap-2">
        <div className="ink-purse flex items-center gap-1.5 text-gold">
          <MoYu className="ink-purse-icon" />
          <span className="tabular-nums">{ink}</span>
          <span className="sr-only">墨玉</span>
        </div>
        <div className="ink-purse mohen-purse flex items-center gap-1.5 text-gold" data-testid="mohen-purse">
          <MoHen className="ink-purse-icon" />
          <span className="tabular-nums">{marks}</span>
          <span className="sr-only">墨痕</span>
        </div>
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
    </header>
  );
}