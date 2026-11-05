import { useEffect, useRef } from "react";
import { MoYu } from "@/components/game/bits";
import { DAILY_INK } from "@/game/logic";

/** 今日領取 popup: shown by GameApp once per day on the home screen while today's 墨玉 is unclaimed. */
export function DailyGift({ onClaim, onLater }: { onClaim: () => void; onLater: () => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onLater();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLater]);
  return (
    <div className="daily-modal fixed inset-0 z-40 grid place-items-center p-6" data-testid="daily-popup" onClick={onLater}>
      <div
        className="daily-card relative w-full max-w-[19rem] rounded-2xl px-6 pb-6 pt-7 text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[0.65rem] tracking-[0.5em] text-gold">晨墨已研</p>
        <h2 id="daily-title" className="mt-2 font-serif text-2xl tracking-[0.25em]">
          今日領取
        </h2>
        <p className="mt-5 flex items-center justify-center gap-2 font-serif text-3xl tabular-nums">
          <MoYu label className="daily-gem h-11 w-11" /> +{DAILY_INK}
        </p>
        <p className="mt-2 text-xs text-muted">每日一份，明日再來</p>
        <div className="mt-6 grid grid-cols-[1fr_2fr] gap-2">
          <button type="button" className="ink-ghost min-h-11 rounded-xl text-sm" onClick={onLater} data-testid="daily-later">
            稍後
          </button>
          <button ref={primary} type="button" className="daily-take min-h-11 rounded-xl" onClick={onClaim} data-testid="daily-take">
            領取 {DAILY_INK} 墨玉
          </button>
        </div>
      </div>
    </div>
  );
}
