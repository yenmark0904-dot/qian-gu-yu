import { useState } from "react";
import { BondPips, CardFace, MoHen, MoYu, Spoken, cn } from "@/components/game/bits";
import { bondTitle } from "@/game/bond";
import { bestIndex, type PullCard } from "@/game/logic";

export function Results({
  cards,
  onClose,
  onAgain,
}: {
  cards: PullCard[];
  onClose: () => void;
  onAgain: (n: 1 | 10) => void;
}) {
  const single = cards.length === 1;
  const [focus, setFocus] = useState(() => bestIndex(cards));
  const current = cards[focus] ?? cards[0];
  if (!current) return null;
  const refund = cards.reduce((sum, card) => sum + card.refund, 0);
  const marks = cards.reduce((sum, card) => sum + (card.marks ?? 0), 0);
  const ups = cards.filter((card) => card.bondUp).length;
  const tierInk = cards.reduce((sum, card) => sum + (card.tierInk ?? 0), 0);

  return (
    <div className="ink-overlay results-screen fixed inset-0 z-40 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="召喚結果">
      <header className="ink-bar safe-top flex items-center justify-between px-4 pt-4">
        <div>
          <h2 className="ink-title font-serif text-xl">{single ? "相逢" : "十連相逢"}</h2>
          {refund > 0 ? (
            <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs tabular-nums text-muted">
              <span className="inline-flex items-center gap-1 whitespace-nowrap">重逢化墨 <MoYu /> +{refund}</span>
              <span className="sr-only">墨玉</span>
              {marks > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="mx-1 opacity-50">·</span> 墨痕 <MoHen /> +{marks}</span>
                </>
              ) : null}
              {ups > 0 ? <span className="ml-1 whitespace-nowrap text-gold">· 緣分升階 {ups}</span> : null}
              {tierInk > 0 ? (
                <span className="ml-1 whitespace-nowrap text-gold" data-testid="tier-ink-total">
                  · 墨玉 +{tierInk}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <button type="button" className="ink-ghost min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm" onClick={onClose}>
          關閉
        </button>
      </header>
      <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {single ? (
          <div className="mx-auto max-w-xs">
            <div className="flip-card">
              <CardFace character={current.character} count={current.count} fresh={current.isNew} bondUp={current.bondUp} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {cards.map((card, index) => (
              <button
                key={`${card.character.id}-${index}`}
                type="button"
                className={cn("rounded-xl text-left", index === focus && "ring-2 ring-gold")}
                onClick={() => setFocus(index)}
              >
                <CardFace character={card.character} count={card.count} fresh={card.isNew} bondUp={card.bondUp} />
              </button>
            ))}
          </div>
        )}
        <div className="mx-auto mt-4 max-w-md ink-panel rounded-xl p-4">
          <p className="text-sm text-muted">
            {current.character.era} · {current.character.epithet}
          </p>
          <p className="font-serif text-2xl">{current.character.name}</p>
          {current.count > 1 ? (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted" data-testid="result-bond">
              緣分 · {bondTitle(current.count)} {current.bond ?? 0}階 <BondPips level={current.bond ?? 0} />
              {current.bondUp ? <span className="text-gold">升階！</span> : null}
              {current.tierInk ? (
                <span className="text-gold" data-testid="tier-ink">
                  墨玉 +{current.tierInk}
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="mt-2">
            <Spoken character={current.character} />
          </div>
        </div>
      </div>
      <footer className="ink-foot safe-bottom grid grid-cols-2 gap-3 px-4 pt-2">
        <button type="button" className="ink-ghost min-h-11 rounded-xl" onClick={onClose}>
          回到墨池
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl bg-gold text-bg transition-transform duration-150 ease-out active:scale-[0.96]"
          onClick={() => onAgain(single ? 1 : 10)}
        >
          {single ? "再抽一次" : "再來十連"}
        </button>
      </footer>
    </div>
  );
}
