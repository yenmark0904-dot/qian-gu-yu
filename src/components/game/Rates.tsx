import { useState } from "react";
import { CHARACTERS, RARITY_META, RARITY_ORDER, BY_ID, WEIGHTS, type Character } from "@/game/data";
import { COST_ONE, COST_TEN, DAILY_INK, PITY, START_INK, rateLabel } from "@/game/logic";
import { useSave } from "@/game/store";
import { MoYu, RarityMark, cn } from "@/components/game/bits";

export function Rates({ onPreview }: { onPreview: (character: Character) => void }) {
  const history = useSave((s) => s.history);
  const [arm, setArm] = useState(false);

  return (
    <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div>
          <h2 className="font-serif text-2xl">卡池</h2>
          <p className="mt-1 text-sm text-muted">
            稀有度由易到難：R、S、SS、SSR。S 珍品的基礎機率是 12%，與過去的星芒（SR）相同；SR 已併入 S，不再單獨出現。星輝是 SS，天命是 SSR。
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {RARITY_ORDER.map((rarity) => (
            <li key={rarity} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3">
              <RarityMark rarity={rarity} />
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn("h-full", rarity === "SSR" ? "bg-cinnabar" : "bg-gold")}
                  style={{ width: `${Math.max(8, WEIGHTS[rarity] / 100)}%` }}
                />
              </div>
              <span className="text-right text-sm tabular-nums text-muted">{rateLabel(rarity)}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          <p>
            單抽 <MoYu /> {COST_ONE} 墨玉，十連 <MoYu /> {COST_TEN}。凡緣 R {rateLabel("R")}、珍品 S {rateLabel("S")}、星輝 SS {rateLabel("SS")}、天命 SSR {rateLabel("SSR")}。S 沿用過去 SR 的 {rateLabel("S")}；原先 S 的 26% 改計入 R，SS 與 SSR 不變。
          </p>
          <p className="mt-2">
            S 不設獨立保底計數，過去的 SR 也沒有。十連若沒有 S 以上，仍會把其中一張提升為 S。連續 {PITY - 1} 抽未出 SSR，下一抽必為 SSR。抽中 SSR 後重新計算。
          </p>
          <p className="mt-2">開局 <MoYu /> {START_INK} 墨玉。每日可領 {DAILY_INK}。三消闖關也能換墨（首次過關依星數給墨玉）。重複的人會化成少量墨玉。圖卡存在這台裝置上，不用登入。</p>
          <p className="mt-2">第一次召喚，必含 SS 以上。</p>
        </div>
        {RARITY_ORDER.map((rarity) => (
          <section key={rarity}>
            <h3 className="font-serif text-lg">
              {RARITY_META[rarity].label} {RARITY_META[rarity].epithet}
            </h3>
            {rarity === "SSR" ? (
              <p className="mt-1 text-xs text-muted">這一級的人各自帶著《天命書》。抽到或點「看演出」，書就會打開。</p>
            ) : null}
            {rarity === "SS" || rarity === "S" ? (
              <p className="mt-1 text-xs text-muted">這一級的人各自帶著《專屬物語》。抽到或點「看演出」，物語就會打開。</p>
            ) : null}
            <ul className="mt-2 flex flex-col">
              {CHARACTERS.filter((c) => c.rarity === rarity).map((character) => (
                <li key={character.id} className="flex items-center justify-between gap-3 border-b border-line py-2">
                  <div>
                    <p className="text-fg">{character.name}</p>
                    <p className="text-xs text-muted">
                      {character.era} · {character.epithet}
                    </p>
                  </div>
                  {character.rarity === "S" || character.rarity === "SS" || character.rarity === "SSR" ? (
                    <button type="button" className="min-h-11 shrink-0 px-3 text-sm text-gold" onClick={() => onPreview(character)}>
                      看演出
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section>
          <h3 className="font-serif text-lg">近日相逢</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-muted">還沒有召喚紀錄。</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {history.slice(0, 18).map((id, index) => {
                const character = BY_ID[id];
                if (!character) return null;
                return (
                  <li key={`${id}-${index}`}>
                    <RarityMark rarity={character.rarity} />
                    <span className="ml-1 text-sm">{character.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <button
          type="button"
          className="min-h-11 text-sm text-muted"
          onClick={() => {
            if (!arm) {
              setArm(true);
              return;
            }
            useSave.getState().reset();
            setArm(false);
          }}
        >
          {arm ? "再按一次，確認散去緣分" : "散去緣分，重新開始"}
        </button>
      </div>
    </div>
  );
}
