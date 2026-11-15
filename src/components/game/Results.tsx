import { useState } from "react";
import { BondPips, CardFace, MoHen, Portrait, SkinnedCard, Spoken, cn } from "@/components/game/bits";
import { BOND_TIER_NAMES, SKINS, bondTitle } from "@/game/bond";
import { dupeFeedback, tierLabel, type DupeFeedback } from "@/game/bond-feedback";
import type { Character } from "@/game/data";
import { bestIndex, type PullCard } from "@/game/logic";

const feedbackOf = (card: PullCard): DupeFeedback => dupeFeedback(card.character, card.count, !!card.bondUp, !!card.overflow);

export function Results({
  cards,
  onClose,
  onAgain,
  onOpenCodex,
}: {
  cards: PullCard[];
  onClose: () => void;
  onAgain: (n: 1 | 10) => void;
  /** Open this character in 圖鑑 (the rank-up "查看新解鎖" entry). */
  onOpenCodex?: (character: Character) => void;
}) {
  const single = cards.length === 1;
  const [focus, setFocus] = useState(() => bestIndex(cards));
  const current = cards[focus] ?? cards[0];
  if (!current) return null;
  const marks = cards.reduce((sum, card) => sum + (card.marks ?? 0), 0);
  const ups = cards.filter((card) => card.bondUp).length;
  const tierInk = cards.reduce((sum, card) => sum + (card.tierInk ?? 0), 0);
  const maxed = cards.filter((card) => card.overflow).length;
  const showGain = marks > 0 || ups > 0 || tierInk > 0;

  return (
    <div className="ink-overlay results-screen fixed inset-0 z-40 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="召喚結果">
      <header className="ink-bar safe-top flex items-center justify-between px-4 pt-4">
        <div>
          <h2 className="ink-title font-serif text-xl">{single ? "相逢" : "十連相逢"}</h2>
          {showGain ? (
            <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs tabular-nums text-muted">
              {marks > 0 ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap" data-testid="dupe-marks">
                  重逢化墨痕 <MoHen /> +{marks}
                </span>
              ) : null}
              {ups > 0 ? (
                <span className={marks > 0 ? "ml-1 whitespace-nowrap text-gold" : "whitespace-nowrap text-gold"}>
                  {marks > 0 ? "· " : ""}緣分升階 {ups}
                </span>
              ) : null}
              {tierInk > 0 ? (
                <span className="ml-1 whitespace-nowrap text-gold" data-testid="tier-ink-total">
                  · 墨玉 +{tierInk}
                </span>
              ) : null}
              {maxed > 0 ? (
                <span className="ml-1 whitespace-nowrap" data-testid="maxed-total">
                  · 緣分圓滿 {maxed} 張化墨痕
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
                <GridHint card={card} />
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
          <BondNote key={`${current.character.id}-${focus}`} card={current} onOpenCodex={onOpenCodex} />
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

/** One-line hint under a card in the 十連 grid. */
function GridHint({ card }: { card: PullCard }) {
  const fb = feedbackOf(card);
  if (fb.kind === "new") return null;
  const text =
    fb.kind === "max" ? "緣分圓滿 · 化墨痕" : fb.kind === "rankup" ? `升至${fb.tierName}` : fb.kind === "near" ? `差 1 張 · ${fb.nextName}` : `再 ${fb.need} 張 · ${BOND_TIER_NAMES[(card.bond ?? 0) + 1]}`;
  return (
    <span className={cn("bond-grid-hint mt-1 block truncate text-center text-[0.65rem]", fb.kind === "progress" ? "text-muted" : "text-gold")} data-testid="bond-grid-hint">
      {text}
    </span>
  );
}

/** 緣分 feedback for the focused copy: progress, next-rank preview, rank-up line + new rewards, or 圓滿 → 墨痕. */
function BondNote({ card, onOpenCodex }: { card: PullCard; onOpenCodex?: (character: Character) => void }) {
  const fb = feedbackOf(card);
  const c = card.character;
  if (fb.kind === "new") return null;
  if (fb.kind === "max") {
    return (
      <div className="bond-note bond-note-max mt-3 rounded-xl px-3 py-2.5 text-sm" data-testid="bond-note" data-kind="max">
        <p className="text-gold">緣分已圓滿</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-fg">
          六階 · 定情已滿，本張化為墨痕 <MoHen /> ×{fb.marks}
        </p>
      </div>
    );
  }
  if (fb.kind === "progress") {
    return (
      <p className="bond-note mt-3 rounded-xl px-3 py-2 text-sm text-fg" data-testid="bond-note" data-kind="progress">
        {fb.text}
      </p>
    );
  }
  if (fb.kind === "near") {
    const skin = fb.previewSkin ? SKINS.find((s) => s.id === fb.previewSkin) : undefined;
    return (
      <div className="bond-note bond-note-near mt-3 rounded-xl px-3 py-2.5" data-testid="bond-note" data-kind="near">
        <p className="text-sm text-gold">{fb.text}</p>
        <div className="mt-2 flex items-center gap-3">
          {skin ? (
            <div className="bond-preview relative w-16 shrink-0" data-testid="bond-preview-skin">
              <SkinnedCard character={c} count={1} skin={skin.id}>
                <Portrait id={c.id} name={c.name} className="aspect-card w-full object-contain object-center" />
              </SkinnedCard>
              <span className="bond-preview-tag absolute inset-x-0 bottom-0 rounded-b-xl text-center text-[0.6rem]">預覽</span>
            </div>
          ) : null}
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            <p className="text-muted">下一階 · {tierLabel(fb.nextTier)}</p>
            <p className="text-fg">
              {[skin ? (skin.id === "vow" ? "定情卡面" : `卡面「${skin.name}」`) : null, ...fb.teaser].filter(Boolean).join("、")}
            </p>
          </div>
        </div>
      </div>
    );
  }
  // rank-up
  return (
    <div className="bond-note bond-note-up mt-3 rounded-xl px-3 py-3" data-testid="bond-note" data-kind="rankup">
      <p className="text-xs tracking-[0.2em] text-gold">緣分升階 · {tierLabel(fb.tier)}</p>
      <p className="mt-1.5 font-serif text-base leading-relaxed text-fg" data-testid="rankup-line">
        {fb.line}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="新解鎖">
        {fb.unlocks.map((u) => (
          <li key={u.label} className={cn("bond-chip rounded-full px-2.5 py-0.5 text-[0.7rem]", u.kind !== "ink" && "on")}>
            {u.kind === "ink" ? u.label : `新 · ${u.label}`}
          </li>
        ))}
      </ul>
      {fb.after ? <p className="mt-2 text-xs text-muted">{fb.after}</p> : null}
      {onOpenCodex ? (
        <button
          type="button"
          className="mt-2.5 min-h-10 w-full rounded-xl bg-gold text-sm text-bg"
          onClick={() => onOpenCodex(c)}
          data-testid="rankup-open-codex"
        >
          前往圖鑑 · 查看新解鎖
        </button>
      ) : null}
    </div>
  );
}
