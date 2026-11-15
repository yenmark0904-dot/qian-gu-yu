import { BY_ID } from "@/game/data";
import {
  ARMED_WINDOW_MOVES,
  NON_OWNER_HINT,
  UNLOCK_AT,
  exclusiveActive,
  exclusivePct,
  type ArtifactDef,
} from "@/game/artifacts";
import { ARTIFACT_LIMITS } from "@/game/artifact-engine";
import { battleRows, generalEffect, pctText, ruleValue } from "./artifact-presentation";
import { cn } from "./bits";

export function BattleBenefits({
  def,
  level,
  nextLevel,
  wearerId,
  resonance,
}: {
  def: ArtifactDef;
  level: number;
  nextLevel?: number;
  wearerId: string | null;
  resonance: boolean;
}) {
  const current = battleRows(def, level, wearerId);
  const next = nextLevel ? battleRows(def, nextLevel, wearerId) : null;
  return (
    <section
      className="mq-benefits"
      aria-label={next ? "升級前後實際效果比較" : "戰鬥補助"}
      data-testid="mq-battle-compare"
    >
      <div className="mq-section-title">
        <h3>{next ? "淬鍊後，能幫我什麼？" : "戰鬥補助"}</h3>
        {next && (
          <span>
            Lv.{level} → Lv.{nextLevel}
          </span>
        )}
      </div>
      {current.map((row, index) => {
        const active =
          !!wearerId &&
          (row.key === "resonance"
            ? resonance
            : row.key === "shred"
              ? exclusiveActive(def, wearerId)
              : true);
        return (
          <div className="mq-benefit" key={row.key} data-effect={row.key}>
            <div>
              <strong>{row.label}</strong>
              <span className={active ? "mq-on" : "mq-off"}>
                {active
                  ? "已啟動"
                  : row.key === "resonance" && !resonance
                    ? `第 ${UNLOCK_AT.resonance} 關開放`
                    : row.key === "shred"
                      ? `需${BY_ID[def.exclusiveCharacterId ?? ""]?.name}裝備`
                      : "裝備後啟動"}
              </span>
            </div>
            <p className="mq-value-compare">
              <span>
                <small>目前</small>
                {row.value}
              </span>
              {next && (
                <>
                  <i aria-hidden>→</i>
                  <b>
                    <small>Lv.{nextLevel}</small>
                    {next[index]?.value}
                  </b>
                </>
              )}
            </p>
            <small>{row.hint}</small>
          </div>
        );
      })}
      {next && current.every((row, index) => row.value === next[index]?.value) && (
        <button
          className="mq-comparison-note"
          onClick={(event) => {
            const details = event.currentTarget
              .closest(".mq-refine")
              ?.querySelector<HTMLDetailsElement>(".mq-effect-details");
            if (details) {
              details.open = true;
              details.scrollIntoView({ block: "center", behavior: "smooth" });
            }
          }}
        >
          本級戰鬥補助不變 · 查看通用被動的升級比較 →
        </button>
      )}
      {!wearerId && (
        <p className="mq-hint">尚未裝備，以上為通用共鳴預覽；命定者裝備後依專屬加成結算。</p>
      )}
    </section>
  );
}

export function ArtifactEffects({
  def,
  level,
  nextLevel,
  wearerId,
  awakenOpen,
}: {
  def: ArtifactDef;
  level: number;
  nextLevel?: number;
  wearerId: string | null;
  awakenOpen: boolean;
}) {
  const active = exclusiveActive(def, wearerId);
  const owner = BY_ID[def.exclusiveCharacterId ?? ""];
  const r = def.general.rule;
  return (
    <section className="mq-effect-layers" aria-label="命器效果與啟動條件">
      <div className="mq-layer">
        <strong>通用被動</strong>
        <span className={wearerId ? "mq-on" : "mq-off"}>
          {wearerId ? "生效中" : "任一角色裝備後生效"}
        </span>
      </div>
      <div
        className={cn("mq-layer", active && "mq-match")}
        data-testid="mq-exclusive"
        data-active={active ? "1" : "0"}
      >
        <strong>命定專屬</strong>
        <span>
          {def.exclusive
            ? active
              ? "命定相契・已啟動"
              : `未啟動・需${owner?.name}裝備`
            : "通用命器・無命定限制"}
        </span>
      </div>
      {def.exclusive && wearerId && !active && <p className="mq-hint">{NON_OWNER_HINT}</p>}
      <div className="mq-layer" data-testid="mq-awaken-state">
        <strong>覺醒效果</strong>
        <span>
          {level >= 10
            ? def.exclusive && !active ? "已達 Lv.10・專屬覺醒未啟動（需命定者）" : `已覺醒・${def.awaken.title ?? "通用被動滿階"}`
            : `未啟動・Lv.10${awakenOpen ? "" : `／通關第 ${UNLOCK_AT.awaken} 關`}`}
        </span>
      </div>
      <details className="mq-effect-details" key={`${def.id}-${level}-${wearerId}`}>
        <summary>
          詳細效果<span>得分被動・觸發條件{nextLevel ? "・升級比較" : ""}</span>
        </summary>
        <div className="mq-effect">
          <h4>通用被動【{def.general.name}】</h4>
          <p>{def.general.text}</p>
          <p className="mq-score-compare">
            Lv.{level}：{generalEffect(def, level)}
            {nextLevel && (
              <>
                <br />
                <b>
                  Lv.{nextLevel}：{generalEffect(def, nextLevel)}
                </b>
              </>
            )}
          </p>
          <small>
            每關前 {r.uses} 次符合條件時觸發。
            {r.kind === "wavePct"
              ? "依消除波次結算。"
              : r.kind === "movePct"
                ? "依整步得分結算。"
                : "僅普通移動的首波消除可蓄勢。"}
          </small>
          {r.kind !== "charge" && r.fallback && (
            <p>
              關卡缺少對應目標時，改用替代被動：{ruleValue(r.fallback.rule, level)}
              {nextLevel ? ` → ${ruleValue(r.fallback.rule, nextLevel)}` : ""}，前{" "}
              {r.fallback.rule.uses} 次。
            </p>
          )}
        </div>
        {def.exclusive && (
          <div className="mq-effect mq-ex">
            <h4>命定專屬【{def.exclusive.name}】</h4>
            <p>{def.exclusive.text}</p>
            <p className="mq-score-compare">
              Lv.{level}：符合條件時得分 +{pctText(exclusivePct(def.exclusive, level))}
              {nextLevel && (
                <>
                  <br />
                  <b>
                    Lv.{nextLevel}：符合條件時得分 +
                    {pctText(exclusivePct(def.exclusive, nextLevel))}
                  </b>
                </>
              )}
            </p>
            <small>
              需{owner?.name}裝備並發動自身技能；每次技能最多觸發一次，{ARMED_WINDOW_MOVES}{" "}
              步內有效，每關最多 {ARTIFACT_LIMITS.exclusivePerStage} 次。
            </small>
          </div>
        )}
        <div className="mq-effect mq-awaken">
          <h4>覺醒【{def.awaken.title ?? "通用被動滿階"}】</h4>
          <p>{def.awaken.text ?? `Lv.10：${generalEffect(def, 10)}`}</p>
        </div>
        <p className="mq-hint">
          以上原文描述保留初始效果；目前與下一級數值以比較欄為準。共鳴回復通用被動 1
          次已用觸發次數，不回充蓄勢。
        </p>
      </details>
    </section>
  );
}
