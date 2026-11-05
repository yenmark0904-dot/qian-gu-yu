import { useEffect, useRef } from "react";
import { ADULT_NO, ADULT_PROMPT, ADULT_YES } from "@/game/adult-gate";

/** Dark confirmation shown before an explicit chapter; nothing of the chapter is rendered until confirmed. */
export function AdultGate({ onConfirm, onDecline }: { onConfirm: () => void; onDecline: () => void }) {
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    noRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onDecline();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDecline]);
  return (
    <div
      data-testid="adult-gate"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="adult-gate-title"
      aria-describedby="adult-gate-text"
      className="adult-gate fixed inset-0 z-[70] grid place-items-center p-6"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="adult-gate-card w-full max-w-xs rounded-2xl border px-6 pt-7 pb-6 text-center">
        <p id="adult-gate-title" className="adult-gate-seal mx-auto grid size-12 place-items-center rounded-full font-serif text-sm">
          18+
        </p>
        <p id="adult-gate-text" className="mt-4 font-serif text-[15px] leading-7">
          {ADULT_PROMPT}
        </p>
        <div className="mt-6 grid gap-2">
          <button type="button" onClick={onConfirm} className="adult-gate-yes min-h-11 rounded-lg px-4 text-sm tracking-widest">
            {ADULT_YES}
          </button>
          <button ref={noRef} type="button" onClick={onDecline} className="adult-gate-no min-h-11 rounded-lg px-4 text-sm tracking-widest">
            {ADULT_NO}
          </button>
        </div>
      </div>
    </div>
  );
}
