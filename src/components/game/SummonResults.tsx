/**
 * 召喚結果 — single and 十連 result page for the 「一筆牽緣，墨門逢君」 reveal.
 * Every number shown is read from the PullCard[] that store.pull() already settled and saved.
 * Card art is always the base portrait: locked 定情 faces / 專屬 CG are never previewed here.
 */
import { useState } from "react";
import type { Character } from "@/game/data";
import { COST_ONE, COST_TEN, bestIndex, type PullCard } from "@/game/logic";
import { useSave } from "@/game/store";
import { revealLine, settlementOf, summarise, type SummonPrefs } from "@/game/summon-reveal";
import { MoHen, MoYu, cn } from "@/components/game/bits";
import { CardArt, PrefToggle, SettleNote } from "@/components/game/SummonStage";

export function SummonResults({
  cards,
  demo,
  saveNote,
  prefs,
  reduce,
  onPrefs,
  onClose,
  onAgain,
  onOpenCodex,
  onReplay,
}: {
  cards: PullCard[];
  demo: boolean;
  saveNote: string | null;
  prefs: SummonPrefs;
  reduce: boolean;
  onPrefs: (p: SummonPrefs) => void;
  onClose: () => void;
  onAgain: (n: 1 | 10) => void;
  onOpenCodex: (character: Character) => void;
  onReplay: (index: number) => void;
}) {
  const single = cards.length === 1;
  const [focus, setFocus] = useState<number | null>(() => (single ? 0 : null));
  const sum = summarise(cards);
  const ink = useSave((s) => s.ink);
  const [busy, setBusy] = useState(false);
  const again = (n: 1 | 10) => {
    if (busy) return;
    setBusy(true);
    onAgain(n);
    // the parent replaces this screen on success; on 墨玉不足 it closes it with a message
    window.setTimeout(() => setBusy(false), 600);
  };
  const best = bestIndex(cards);

  return (
    <div className="sm-results ink-overlay" role="dialog" aria-modal="true" aria-label="召喚結果" data-testid="summon-results">
      <header className="sm-res-head">
        <div>
          <h2 className="sm-res-title">{single ? "單抽 · 相逢" : "十連 · 相逢"}</h2>
          <p className="sm-res-sum" data-testid="summon-summary">
            <span>
              重逢化墨痕 <MoHen /> +{sum.marks}
            </span>
            {sum.tierInk > 0 ? <span>· 升階墨玉 +{sum.tierInk}（已入帳）</span> : null}
            {sum.firsts > 0 ? <span>· 初逢 {sum.firsts}</span> : null}
            {sum.maxed > 0 ? <span>· 圓滿化墨痕 {sum.maxed} 張</span> : null}
          </p>
          {sum.rankUps.length ? (
            <p className="sm-res-ups">
              緣分升階：
              {sum.rankUps.map((u, i) => (
                <span key={`${u.id}-${i}`}>
                  {i ? "、" : ""}
                  {u.name} {u.from}→{u.to}
                </span>
              ))}
            </p>
          ) : null}
          {demo ? <p className="sm-res-demo">演出預覽 · 測試資料，未寫入存檔</p> : null}
          {saveNote ? <p className="sm-res-warn" role="alert">{saveNote}</p> : null}
        </div>
        <button type="button" className="sm-btn sm-btn-ghost" onClick={onClose}>
          關閉
        </button>
      </header>

      <div className="sm-res-body">
        {single ? null : (
          <ol className="sm-res-grid" aria-label="十連結果">
            {cards.map((card, i) => {
              const s = settlementOf(card);
              const c = card.character;
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={cn("sm-res-card", `sm-face-${c.rarity}`, focus === i && "is-focus", i === best && "is-best")}
                    onClick={() => setFocus(i)}
                    aria-label={`${c.rarity} ${c.name}`}
                  >
                    <CardArt card={card} className="sm-thumb" />
                    <span className={cn("sm-rarity sm-rarity-mini", `sm-rarity-${c.rarity}`)}>{c.rarity}</span>
                    {s.kind === "new" ? <span className="sm-mark sm-mark-new">初逢</span> : <span className="sm-mark sm-mark-dupe">重逢</span>}
                    {s.kind === "rankup" ? <span className="sm-mark sm-mark-up sm-mark-2">升階</span> : null}
                    {s.kind === "max" ? <span className="sm-mark sm-mark-max sm-mark-2">圓滿</span> : null}
                    <span className="sm-thumb-name">{c.name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {focus !== null && cards[focus] ? (
          <Detail
            card={cards[focus]!}
            big={single}
            onReplay={() => onReplay(focus)}
            onOpenCodex={() => onOpenCodex(cards[focus]!.character)}
            onBack={single ? undefined : () => setFocus(null)}
          />
        ) : (
          <p className="sm-res-tip">點擊卡片可放大查看；SS、SSR 可重播揭曉特寫。</p>
        )}

        <div className="sm-res-prefs">
          <PrefToggle label="自動播放" on={prefs.autoPlay} onChange={(v) => onPrefs({ ...prefs, autoPlay: v })} />
          <PrefToggle label={reduce ? "精簡動畫（系統已減少動態）" : "精簡動畫"} on={prefs.lite || reduce} disabled={reduce} onChange={(v) => onPrefs({ ...prefs, lite: v })} />
        </div>
      </div>

      <footer className="sm-res-foot">
        <button type="button" className="sm-btn sm-btn-ghost" onClick={onClose}>
          返回召喚
        </button>
        <button type="button" className="sm-btn" disabled={busy || demo} onClick={() => again(1)} data-testid="again-one">
          再次單抽
          <small>
            <MoYu /> {COST_ONE}
          </small>
        </button>
        <button type="button" className="sm-btn sm-btn-primary" disabled={busy || demo} onClick={() => again(10)} data-testid="again-ten">
          再次十連
          <small>
            <MoYu /> {COST_TEN}
          </small>
        </button>
        <p className="sm-res-ink">
          持有 <MoYu /> {ink}
          {demo ? " · 預覽模式不可再抽" : ""}
        </p>
      </footer>
    </div>
  );
}

function Detail({
  card,
  big,
  onReplay,
  onOpenCodex,
  onBack,
}: {
  card: PullCard;
  big: boolean;
  onReplay: () => void;
  onOpenCodex: () => void;
  onBack?: () => void;
}) {
  const c = card.character;
  const s = settlementOf(card);
  const line = revealLine(c);
  const canReplay = c.rarity === "SS" || c.rarity === "SSR";
  return (
    <section className={cn("sm-detail", big && "is-big")} aria-label={`${c.name} 詳情`}>
      <div className="sm-detail-art">
        <CardArt card={card} className="sm-card" />
        {s.kind === "new" ? <span className="sm-first-seal sm-first-static">初逢</span> : null}
      </div>
      <div className="sm-detail-info">
        <span className={cn("sm-rarity", `sm-rarity-${c.rarity}`)}>{c.rarity === "SSR" ? "SSR・天命" : c.rarity}</span>
        <h3 className="sm-name">{c.name}</h3>
        <p className="sm-era">
          {c.era} · {c.epithet}
        </p>
        {line ? <p className="sm-subline">「{line.text}」</p> : null}
        <SettleNote card={card} beat={false} />
        <div className="sm-detail-acts">
          {canReplay ? (
            <button type="button" className="sm-btn" onClick={onReplay}>
              重播揭曉特寫
            </button>
          ) : null}
          {s.kind === "new" || s.kind === "rankup" ? (
            <button type="button" className="sm-btn" onClick={onOpenCodex}>
              {s.kind === "new" ? "前往圖鑑" : "前往圖鑑 · 查看新解鎖"}
            </button>
          ) : null}
          {onBack ? (
            <button type="button" className="sm-btn sm-btn-ghost" onClick={onBack}>
              收起
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
