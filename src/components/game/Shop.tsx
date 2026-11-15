import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { BondPips, MoHen, Portrait, RarityMark, SkinnedCard, cn } from "@/components/game/bits";
import { CHARACTERS, RARITY_META, RARITY_ORDER, type Rarity } from "@/game/data";
import { RANK } from "@/game/logic";
import { MARK_OVERFLOW, MARK_TRICKLE, MAX_DUPES, bondLevel } from "@/game/bond";
import { dupeFeedback, progressCopy, tierLabel } from "@/game/bond-feedback";
import { CHARACTER_PRICE, COSMETICS, ownsCosmetic, type Cosmetic } from "@/game/shop";
import { useSave } from "@/game/store";

type Pane = "people" | "decor";
const FILTERS: Rarity[] = [...RARITY_ORDER].sort((a, b) => RANK[b] - RANK[a]);

/** 墨寶閣: spend 墨痕 on character copies (toward 緣分) and on frames / backdrops. */
export function Shop() {
  const marks = useSave((s) => s.marks);
  const [pane, setPane] = useState<Pane>("people");
  const [note, setNote] = useState<string | null>(null);
  return (
    <main className="scroll-area shop min-h-0 flex-1 overflow-y-auto px-4 pb-4" data-testid="shop">
      <div className="shop-head mt-2 rounded-2xl px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl tracking-[0.35em] text-fg">墨寶閣</h2>
            <p className="mt-0.5 text-xs text-muted">重逢留下的墨痕，可在此換取相逢與裝幀</p>
          </div>
          <p className="flex items-center gap-1.5 text-xl tabular-nums text-gold" data-testid="shop-marks">
            <MoHen label className="h-6 w-6" /> {marks}
          </p>
        </div>
        <p className="mt-2 text-[0.7rem] leading-relaxed text-muted">
          每次重逢化墨痕：R {MARK_TRICKLE.R} · S {MARK_TRICKLE.S} · SS {MARK_TRICKLE.SS} · SSR {MARK_TRICKLE.SSR}；緣分滿六階後再遇：R {MARK_OVERFLOW.R} · S{" "}
          {MARK_OVERFLOW.S} · SS {MARK_OVERFLOW.SS} · SSR {MARK_OVERFLOW.SSR}
        </p>
      </div>
      <div className="shop-tabs mt-3 grid grid-cols-2 rounded-full p-1" role="tablist">
        {(["people", "decor"] as Pane[]).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pane === p}
            className={cn("min-h-10 rounded-full text-sm tracking-[0.3em]", pane === p && "on")}
            onClick={() => setPane(p)}
          >
            {p === "people" ? "人物" : "裝幀"}
          </button>
        ))}
      </div>
      <p className="shop-note mt-2 h-5 text-center text-sm text-gold" aria-live="polite">
        {note ?? ""}
      </p>
      {pane === "people" ? <People onNote={setNote} /> : <Decor onNote={setNote} />}
    </main>
  );
}

function People({ onNote }: { onNote: (s: string) => void }) {
  const owned = useSave((s) => s.owned);
  const marks = useSave((s) => s.marks);
  const buy = useSave((s) => s.buyCharacter);
  const [filter, setFilter] = useState<Rarity>("SSR");
  const list = CHARACTERS.filter((c) => c.rarity === filter).sort((a, b) => (owned[b.id] ?? 0) - (owned[a.id] ?? 0));
  const price = CHARACTER_PRICE[filter];
  return (
    <section>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((r) => (
          <button
            key={r}
            type="button"
            className={cn("ink-chip min-h-9 shrink-0 rounded-full px-4 text-sm", filter === r && "on")}
            onClick={() => setFilter(r)}
          >
            {RARITY_META[r].label} · {CHARACTER_PRICE[r]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">買下一份＝一次重逢：計入緣分，但不化墨痕、也不給墨玉。緣分六階後不再出售。</p>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {list.map((c) => {
          const copies = owned[c.id] ?? 0;
          const maxed = copies - 1 >= MAX_DUPES;
          const broke = marks < price;
          return (
            <div key={c.id} className="shop-item" data-testid={`shop-${c.id}`}>
              <SkinnedCard character={c} count={copies} skin={copies > 0 ? undefined : "base"}>
                <Portrait id={c.id} name={c.name} className={cn("aspect-card w-full object-contain object-center", copies === 0 && "opacity-50")} />
                <div className="absolute left-1 top-1">
                  <RarityMark rarity={c.rarity} />
                </div>
                {copies > 0 ? (
                  <span className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/70 to-transparent pb-1 pt-3">
                    <BondPips level={bondLevel(copies)} />
                  </span>
                ) : null}
              </SkinnedCard>
              <p className="mt-1 truncate text-sm text-fg">{c.name}</p>
              <button
                type="button"
                disabled={maxed || broke}
                className={cn("shop-buy mt-1 flex min-h-9 w-full items-center justify-center gap-1 rounded-lg text-sm tabular-nums", maxed && "maxed")}
                onClick={() => {
                  const r = buy(c.id);
                  if (!r.ok) return;
                  if (copies === 0) return onNote(`與${c.name}初遇 · ${progressCopy(1)}`);
                  const fb = dupeFeedback(c, copies + 1, bondLevel(copies + 1) > bondLevel(copies), false);
                  const ink = r.tierInk > 0 ? ` · 墨玉 +${r.tierInk}` : "";
                  if (fb.kind === "rankup") onNote(`${c.name} 緣分升至${tierLabel(fb.tier)}${ink}｜新解鎖：${fb.unlocks.filter((u) => u.kind !== "ink").map((u) => u.label).join("、") || "墨玉"}｜${fb.line}`);
                  else if (fb.kind === "near") onNote(`與${c.name}重逢 · ${fb.text}（下一階：${[fb.previewSkin ? "新卡面" : null, ...fb.teaser].filter(Boolean).join("、")}）`);
                  else if (fb.kind === "progress") onNote(`與${c.name}重逢 · ${fb.text}`);
                }}
              >
                {maxed ? (
                  "緣分已滿"
                ) : (
                  <>
                    <MoHen /> {price}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Decor({ onNote }: { onNote: (s: string) => void }) {
  const cosmetics = useSave((s) => s.cosmetics);
  const frame = useSave((s) => s.frame);
  const backdrop = useSave((s) => s.backdrop);
  const marks = useSave((s) => s.marks);
  const buy = useSave((s) => s.buyCosmetic);
  const equip = useSave((s) => s.equip);
  const row = (items: Cosmetic[], title: string) => (
    <section className="mt-1">
      <h3 className="mb-2 text-xs tracking-[0.3em] text-muted">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => {
          const have = ownsCosmetic(cosmetics, it.id);
          const on = it.id === frame || it.id === backdrop;
          return (
            <div key={it.id} className={cn("decor-item rounded-xl p-2", on && "on")} data-testid={`decor-${it.id}`}>
              <div className={cn("decor-swatch relative aspect-[4/3] overflow-hidden rounded-lg", it.kind === "frame" ? `card-art frame-${it.id}` : `swatch-${it.id}`)}>
                {it.kind === "frame" ? <span className="decor-ink absolute inset-0" /> : null}
              </div>
              <div className="mt-2 flex items-center justify-between gap-1">
                <p className="font-serif text-fg">{it.name}</p>
                {on ? <Check className="h-4 w-4 text-gold" aria-label="使用中" /> : null}
              </div>
              <p className="text-[0.7rem] text-muted">{it.note}</p>
              {have ? (
                <button
                  type="button"
                  disabled={on}
                  className="shop-buy mt-2 min-h-9 w-full rounded-lg text-sm"
                  onClick={() => equip(it.id) && onNote(`已換上「${it.name}」`)}
                >
                  {on ? "使用中" : "使用"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={marks < it.price}
                  className="shop-buy mt-2 flex min-h-9 w-full items-center justify-center gap-1 rounded-lg text-sm tabular-nums"
                  onClick={() => {
                    const r = buy(it.id);
                    if (r.ok) {
                      equip(it.id);
                      onNote(`得「${it.name}」，已換上`);
                    }
                  }}
                >
                  {marks < it.price ? <Lock className="h-3.5 w-3.5" aria-hidden /> : null}
                  <MoHen /> {it.price}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
  return (
    <div className="space-y-4">
      {row(COSMETICS.filter((c) => c.kind === "frame"), "卡框")}
      {row(COSMETICS.filter((c) => c.kind === "backdrop"), "窗景")}
    </div>
  );
}
