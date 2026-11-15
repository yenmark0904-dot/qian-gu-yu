import { useEffect, useRef, useState } from "react";
import { ARTIFACTS, ARTIFACT_BY_ID, ARTIFACT_PLACEHOLDER, artifactImage } from "@/game/artifacts";
import { ARTIFACT_SUMMON as C, WISH_ARTIFACTS } from "@/game/artifact-summon";
import type { ArtifactPullRecord } from "@/game/artifact-summon-state";
import { useSave } from "@/game/store";
import { MoYu, cn } from "@/components/game/bits";
import { Opening, Performance } from "./SummonStage";
import { readPrefs, writePrefs } from "@/game/summon-reveal";
import { stopSummonSfx } from "@/game/summon-sfx";
import "./artifacts.css";

const fallback = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = ARTIFACT_PLACEHOLDER;
};
export function ArtifactSummon() {
  const ink = useSave((s) => s.ink);
  const tickets = useSave((s) => s.artifactTickets);
  const ledger = useSave((s) => s.artifactSummon);
  const [notice, setNotice] = useState("");
  const [records, setRecords] = useState<ArtifactPullRecord[] | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const pulling = useRef(false);
  const ratesRef = useRef<HTMLDetailsElement>(null);
  const summon = (n: 1 | 10, pay: "ink" | "ticket" = "ink") => {
    if (pulling.current) return;
    pulling.current = true;
    let settled = false;
    try {
      const result = useSave.getState().pullArtifact(n, pay);
      if (typeof result === "string") {
        setNotice(
          result === "no-tickets"
            ? "命器召喚券不足，未扣除墨玉。可改用墨玉召喚。"
            : result === "broke"
            ? "墨玉不足，主線、每日與原有獎勵都能繼續取得墨玉。"
            : result === "locked"
              ? "通關主線第 5 關後開放。"
              : "暫時無法召喚，未扣除墨玉。",
        );
        return;
      }
      settled = true;
      setNotice("");
      setRecords(result);
      setRevealKey((k) => k + 1);
    } finally {
      // Keep the action latched through the entire reveal; rapid repeat taps cannot charge twice.
      if (!settled) pulling.current = false;
    }
  };
  const target = ledger.target ? ARTIFACT_BY_ID[ledger.target] : null;
  const remainSSR = Math.max(C.ssrPity - ledger.sinceSSR, 1);
  const remainSS = Math.max(C.ssPity - ledger.sinceSS, 1);
  return (
    <div className="mq-summon" data-testid="mq-summon">
      <header className="summon-page-head">
        <p className="summon-kicker">宮門牽緣 · 以墨迎器</p>
        <h1>命器召喚</h1>
        <p className="summon-subtitle">命器池獨立於角色召喚・不消耗角色卡、不增加緣分</p>
        <div className="summon-pity">
          <p>
            距離 SSR <strong>{remainSSR}</strong> 抽 · SS 以上 <strong>{remainSS}</strong> 抽內
          </p>
          <button
            className="ui-text"
            type="button"
            onClick={() => {
              const el = ratesRef.current;
              if (!el) return;
              el.open = true;
              el.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          >
            召喚機率
          </button>
        </div>
        <div className="ink-pity">
          <div style={{ width: `${Math.min(100, (ledger.sinceSSR / C.ssrPity) * 100)}%` }} />
        </div>
      </header>
      <div className="summon-gate" role="img" aria-label="宮門牽緣的召喚宮門">
        <div className="summon-gate-copy">
          <span>宮門牽緣</span>
          <p>以墨迎器</p>
        </div>
      </div>
      <section className="summon-zone" aria-label="命器召喚">
        <p className="summon-ledger">
          累計召喚 {ledger.total} 次 · 命器精華 {ledger.essence} 份
        </p>
        <label className="mq-wish">
          命器定向
          <select
            aria-label="命器定向"
            value={ledger.target ?? ""}
            onChange={(e) => useSave.getState().setArtifactWish(e.target.value || null)}
          >
            <option value="">不設定定向</option>
            {WISH_ARTIFACTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rarity} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          {target
            ? `${target.name}：${target.rarity === "SSR" ? C.wishSSR - ledger.wishSSR : C.wishSS - ledger.wishSS} 抽內必得`
            : "選擇心儀的 SSR 或 SS 專屬命器。"}
        </p>
        <small className="summon-wish-note">
          SSR 定向進度 {ledger.wishSSR}/{C.wishSSR} · SS 定向進度 {ledger.wishSS}/{C.wishSS}
          。切換或取消均保留進度，只累計目前定向稀有度；抽到當前目標才歸零。
        </small>
        <div className="summon-actions">
          <button
            className={cn("ui-quiet summon-one", ink < C.one && "opacity-50")}
            disabled={ink < C.one}
            onClick={() => summon(1)}
          >
            <strong>單次召喚</strong>
            <span>
              <MoYu /> {C.one} 墨玉
            </span>
            <small>計入 {C.ssrPity} 抽 SSR 保底</small>
          </button>
          <button
            className={cn("ui-primary summon-ten", ink < C.ten && "opacity-50")}
            disabled={ink < C.ten}
            onClick={() => summon(10)}
          >
            <strong>十連召喚</strong>
            <span>
              <MoYu /> {C.ten.toLocaleString()} 墨玉
            </span>
            <small>單抽與十連共用命器保底</small>
          </button>
        </div>
        <div className="summon-tickets" data-testid="mq-tickets">
          <span>
            命器召喚券 <strong>{tickets}</strong>
          </span>
          <button className="ui-quiet" disabled={tickets < 1} onClick={() => summon(1, "ticket")}>
            用券單抽 · 1 張
          </button>
          <button className="ui-quiet" disabled={tickets < 10} onClick={() => summon(10, "ticket")}>
            用券十連 · 10 張
          </button>
        </div>
        <small className="summon-wish-note">
          命器召喚券 {tickets} 張・只用於命器池，與墨玉召喚共用保底；券不足時不會改扣墨玉。
        </small>
        {notice ? (
          <p className="hall-notice" role="status">
            {notice}
          </p>
        ) : null}
        <details className="mq-effect" ref={ratesRef}>
          <summary>機率公告與保底規則</summary>
          <p>
            基礎機率（不含保底與定向）：
            {Object.entries(C.rates)
              .map(([r, v]) => `${r} ${v * 100}%`)
              .join(" / ")}
            。同稀有度內均分；沒有隱藏加權。保底與定向會改變實際綜合機率。
          </p>
          <p>
            每 {C.ssPity} 抽內至少一件 SS 以上，每 {C.ssrPity} 抽內一件
            SSR；抽到對應稀有度立即重新計數。SS 保底補為 SS，不降低自然抽中的 SSR。
          </p>
          <p>
            定向 SSR 最多 {C.wishSSR} 抽、定向 SS 最多 {C.wishSS} 抽；與 SSR 保底同時到期時，SS
            定向會提前一抽兌現，兩種保證皆保留。若切換目標剛好令兩者在同一抽到期，除 SSR
            外免費補發定向 SS，不另收費或推進保底。切換目標保留所有保底，SSR／SS 定向分開儲存。
          </p>
          <p>
            單抽與十連共用命器保底，與角色召喚完全分開。十連依抽取順序結算。重複抽取的新副本轉為{" "}
            {C.essencePerDuplicate}{" "}
            份命器精華，保留原有命器實體；絕不分解已裝備、鎖定或庫存中的命器。精華用途於後續養成開放，非付費貨幣。
          </p>
          <ul>
            {ARTIFACTS.map((a) => (
              <li key={a.id}>
                {a.rarity} · {a.name}：基礎{" "}
                {(
                  (C.rates[a.rarity] * 100) /
                  ARTIFACTS.filter((b) => b.rarity === a.rarity).length
                ).toFixed(4)}
                %
              </li>
            ))}
          </ul>
        </details>
        <details className="mq-effect">
          <summary>召喚紀錄 · 最近 {ledger.history.length} 筆</summary>
          <p>
            累計消耗 {ledger.spentInk.toLocaleString()} 墨玉 ·
            紀錄為已入庫結果，重看不會重新扣款或發放。
          </p>
          {ledger.history.length > 0 && (
            <button
              className="ui-quiet"
              onClick={() => {
                setRecords(ledger.history.slice(-10));
                setRevealKey((k) => k + 1);
              }}
            >
              重看最近結果
            </button>
          )}
          <ol className="mq-history">
            {ledger.history
              .slice(-100)
              .reverse()
              .map((r) => (
                <li key={r.uid}>
                  <span>
                    第 {r.pull} 抽 · {r.bonus ? "定向免費補發 · " : ""}
                    {r.rarity} · {ARTIFACT_BY_ID[r.eid]?.name} ·{" "}
                    {r.isNew ? "新命器" : `命器精華 +${r.essence ?? 0}`}
                  </span>
                  <small>
                    {new Date(r.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（台北時間）
                    ·{" "}
                    {
                      {
                        random: "一般抽取",
                        "ss-pity": "SS 保底",
                        "ssr-pity": "SSR 保底",
                        wish: "定向達成",
                      }[r.reason]
                    }
                  </small>
                </li>
              ))}
          </ol>
          {ledger.history.length > 100 && (
            <small>顯示最近 100 筆，存檔保留最近 {C.historyLimit} 筆，累計次數與消耗不會歸零。</small>
          )}
        </details>
      </section>
      {records && (
        <ArtifactReveal
          key={revealKey}
          records={records}
          onClose={() => {
            pulling.current = false;
            setRecords(null);
          }}
        />
      )}
    </div>
  );
}

function ArtifactReveal({
  records,
  onClose,
}: {
  records: ArtifactPullRecord[];
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"opening" | "show" | "results">("opening");
  const [index, setIndex] = useState(0);
  const [skip, setSkip] = useState(0);
  const [ready, setReady] = useState(false);
  const [lite, setLite] = useState(
    () => readPrefs().lite || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const record = records[index]!;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      stopSummonSfx();
    };
  }, [onClose]);
  const next = () => {
    stopSummonSfx();
    if (index + 1 >= records.length) setPhase("results");
    else {
      setIndex((i) => i + 1);
      setReady(false);
      setSkip(0);
    }
  };
  return (
    <section
      className="sm-overlay mq-summon-overlay fixed inset-0 z-[90]"
      role="dialog"
      aria-modal="true"
      aria-label="命器召喚揭曉"
    >
      <header className="mq-reveal-controls">
        <label>
          <input
            type="checkbox"
            checked={!!lite}
            onChange={(e) => {
              setLite(e.target.checked);
              writePrefs({ ...readPrefs(), lite: e.target.checked });
            }}
          />{" "}
          精簡動畫
        </label>
        <button
          className="ui-quiet"
          onClick={() => {
            stopSummonSfx();
            setPhase("results");
          }}
        >
          略過動畫
        </button>
      </header>
      {phase === "opening" && <Opening auto={false} lite={!!lite} onTap={() => setPhase("show")} />}
      {phase === "show" && (
        <Performance
          key={record.uid}
          artifact={{
            def: ARTIFACT_BY_ID[record.eid]!,
            isNew: record.isNew,
            essence: record.essence,
          }}
          withDrop={records.length === 1}
          lite={
            !!lite ||
            (records.length > 1 &&
              (record.rarity === "R" ||
                record.rarity === "S" ||
                (record.rarity === "SS" && !record.isNew)))
          }
          onRevealed={() => setReady(true)}
          skipSignal={skip}
          footer={
            <button className="ui-primary" onClick={ready ? next : () => setSkip((s) => s + 1)}>
              {ready ? `${index + 1}/${records.length} · 繼續` : "略過此件"}
            </button>
          }
        />
      )}
      {phase === "results" && (
        <div className="mq-result-scroll">
          <h2>命器已應緣而來</h2>
          <p>新命器收入命器庫，可自由裝備於任何已擁有角色；重複抽取轉為命器精華。</p>
          <ul className="mq-grid">
            {records.map((r) => {
              const a = ARTIFACT_BY_ID[r.eid]!;
              return (
                <li className={`mq-tile r-${r.rarity}`} key={r.uid}>
                  <img
                    src={artifactImage(a)}
                    alt={a.name}
                    onError={fallback}
                    width={64}
                    height={64}
                  />
                  <div>
                    <strong>{a.name}</strong>
                    <p>{r.rarity} · Lv.1</p>
                    <small>
                      {r.isNew
                        ? "新命器"
                        : r.essence
                          ? `命器精華 +${r.essence}`
                          : "重複命器・獨立保存"}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
          <button className="ui-primary" onClick={onClose}>
            返回召喚
          </button>
        </div>
      )}
    </section>
  );
}
