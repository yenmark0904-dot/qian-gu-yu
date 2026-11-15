/** Local pavilion UI only: all mutations use the existing store and cost table. */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ARTIFACT_BY_ID,
  ARTIFACT_MAX_LEVEL,
  ARTIFACT_PLACEHOLDER,
  ARTIFACT_RARITY_LABEL,
  MATERIALS,
  artifactImage,
  artifactUnlocks,
  type ArtifactDef,
  type MaterialId,
} from "@/game/artifacts";
import {
  REFINE_BLOCK_TEXT,
  REFINE_STEP_NAME,
  refineCheck,
  type RefineCost,
} from "@/game/artifact-refine";
import { devArtifacts } from "@/game/artifact-dev";
import { BY_ID } from "@/game/data";
import { useSave } from "@/game/store";
import { ArtifactEffects, BattleBenefits } from "./ArtifactEffects";
import { generalEffect } from "./artifact-presentation";
import { cn } from "./bits";
export { generalEffect } from "./artifact-presentation";

export function ArtifactRefine({
  initialUid,
  initialMaterialsOpen = false,
  onAcquire,
  onSummon,
  footerHost,
}: {
  initialUid?: string | null;
  initialMaterialsOpen?: boolean;
  footerHost?: HTMLElement | null;
  onAcquire: () => void;
  onSummon: () => void;
}) {
  const save = useSave((s) => s.artifacts);
  const essence = useSave((s) => s.artifactSummon.essence);
  const m3 = useSave((s) => s.m3);
  const dev = useMemo(devArtifacts, []);
  const unlocks = artifactUnlocks(m3, dev);
  const [uid, setUid] = useState(initialUid ?? save.instances[0]?.uid ?? "");
  const [confirm, setConfirm] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(initialMaterialsOpen);
  const [msg, setMsg] = useState<string | null>(null);
  const [awaken, setAwaken] = useState<{ def: ArtifactDef } | null>(null);
  const instance = save.instances.find((i) => i.uid === uid) ?? save.instances[0];
  const def = instance ? ARTIFACT_BY_ID[instance.eid] : null;
  const check = instance ? refineCheck(save, instance.uid, unlocks) : null;
  const lv = instance?.level ?? 1;
  const maxed = lv >= ARTIFACT_MAX_LEVEL;
  const cost: RefineCost | undefined = check?.cost;
  const stepName = REFINE_STEP_NAME(lv);
  const owner = def?.exclusiveCharacterId ? BY_ID[def.exclusiveCharacterId] : null;
  const wearer = instance?.equippedBy ? BY_ID[instance.equippedBy] : null;

  const doRefine = () => {
    if (!instance) return;
    setConfirm(false);
    const res = useSave.getState().refineArtifact(instance.uid, dev);
    if (!res.ok) {
      setMsg(REFINE_BLOCK_TEXT[res.reason]);
      return;
    }
    setMsg(`${def?.name} 淬鍊成功：Lv.${res.from} → Lv.${res.to}。`);
    if (res.awakened && def) setAwaken({ def });
  };

  const dock =
    instance && def ? (
      <footer className="mq-refine-dock" aria-label="淬鍊操作">
        {msg && (
          <p className="hall-notice" role="status" data-testid="mq-refine-msg">
            {msg}
          </p>
        )}
        {maxed ? (
          <div className="mq-maxed">
            <strong>Lv.10 · 覺醒已成</strong>
            <button className="ui-quiet" onClick={() => setAwaken({ def })}>
              重溫覺醒
            </button>
          </div>
        ) : (
          <>
            {check && !check.ok && (
              <p
                className="mq-hint"
                role="status"
                data-testid="mq-refine-block"
                data-reason={check.reason}
              >
                {REFINE_BLOCK_TEXT[check.reason]}
              </p>
            )}
            {confirm && check?.ok ? (
              <div
                className="mq-confirm"
                role="alertdialog"
                aria-label="確認淬鍊"
                data-testid="mq-refine-confirm"
              >
                <p>
                  以{" "}
                  {(Object.entries(check.cost) as [MaterialId, number][])
                    .map(([id, n]) => `${MATERIALS.find((m) => m.id === id)?.name} ×${n}`)
                    .join("、")}
                  ，將「{def.name}」{stepName}至 Lv.{lv + 1}？
                </p>
                <div className="mq-actions">
                  <button className="ui-primary" data-testid="mq-refine-yes" onClick={doRefine}>
                    確定{stepName}
                  </button>
                  <button className="ui-quiet" onClick={() => setConfirm(false)}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="mq-dock-action">
                <span>
                  {def.name}
                  <small>
                    Lv.{lv} → Lv.{lv + 1}
                  </small>
                </span>
                <button
                  className="ui-primary"
                  data-testid="mq-refine-go"
                  disabled={!check?.ok}
                  onClick={() => {
                    setMsg(null);
                    setConfirm(true);
                  }}
                >
                  {stepName}至 Lv.{lv + 1}
                </button>
                {check && !check.ok && check.reason === "materials" && (
                  <button
                    className="mq-text-link"
                    onClick={() => {
                      setMaterialsOpen(true);
                      document
                        .querySelector(".mq-material-entry")
                        ?.scrollIntoView({ block: "center", behavior: "smooth" });
                    }}
                  >
                    取得材料
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </footer>
    ) : null;

  return (
    <section className="mq-refine" aria-label="命器淬鍊" data-testid="mq-refine">
      {instance && def ? (
        <>
          <div className="mq-card-strip" aria-label="選擇淬鍊命器" data-testid="mq-refine-pick">
            {save.instances.map((i) => {
              const d = ARTIFACT_BY_ID[i.eid]!;
              return (
                <button
                  key={i.uid}
                  className={cn("mq-select-card", i.uid === instance.uid && "on")}
                  aria-pressed={i.uid === instance.uid}
                  data-testid={`mq-refine-pick-${i.uid}`}
                  onClick={(event) => {
                    setUid(i.uid);
                    setConfirm(false);
                    setMsg(null);
                    event.currentTarget.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                      behavior: "smooth",
                    });
                  }}
                >
                  <img
                    src={artifactImage(d)}
                    alt=""
                    width={64}
                    height={64}
                    onError={imageFallback}
                  />
                  <strong>{d.name}</strong>
                  <small>
                    {d.rarity} · Lv.{i.level}
                    {i.locked ? " · 鎖定" : ""}
                  </small>
                </button>
              );
            })}
          </div>
          <article className="mq-refine-hero" data-testid="mq-refine-card" data-level={lv}>
            <p className={cn("mq-rarity", `r-${def.rarity}`)}>
              {ARTIFACT_RARITY_LABEL[def.rarity]}
              <span>
                Lv.{lv} / {ARTIFACT_MAX_LEVEL}
                {maxed ? " · 已覺醒" : ""}
              </span>
            </p>
            <img
              src={artifactImage(def)}
              onError={imageFallback}
              alt={def.name}
              width={200}
              height={200}
            />
            <h2 data-testid="mq-refine-level">{def.name}</h2>
            <dl className="mq-identity">
              <div>
                <dt>命定者</dt>
                <dd>{owner?.name ?? "通用・人人可用"}</dd>
              </div>
              <div>
                <dt>目前裝備</dt>
                <dd>{wearer?.name ?? "尚未裝備"}</dd>
              </div>
            </dl>
            <p className={cn("mq-ready", check?.ok && "on")} data-testid="mq-refine-readiness">
              {maxed
                ? "滿階覺醒・無需再淬鍊"
                : check?.ok
                  ? `材料齊備・可${stepName}至 Lv.${lv + 1}`
                  : check && !check.ok
                    ? REFINE_BLOCK_TEXT[check.reason]
                    : ""}
            </p>
          </article>
          <BattleBenefits
            def={def}
            level={lv}
            nextLevel={maxed ? undefined : lv + 1}
            wearerId={instance.equippedBy}
            resonance={unlocks.resonance}
          />
          <ArtifactEffects
            def={def}
            level={lv}
            nextLevel={maxed ? undefined : lv + 1}
            wearerId={instance.equippedBy}
            awakenOpen={unlocks.awaken}
          />
          {!maxed && cost && (
            <section
              className="mq-material-cost"
              data-testid="mq-refine-cost"
              aria-label="淬鍊所需材料"
            >
              <div className="mq-section-title">
                <h3>{stepName}所需材料</h3>
                <button
                  className="ui-quiet"
                  onClick={() => setMaterialsOpen(!materialsOpen)}
                  aria-expanded={materialsOpen}
                >
                  取得材料
                </button>
              </div>
              <ul>
                {(Object.entries(cost) as [MaterialId, number][]).map(([id, need]) => {
                  const have = save.materials[id] ?? 0;
                  const missing = Math.max(0, need - have);
                  return (
                    <li
                      key={id}
                      className={cn("mq-material-row", missing > 0 && "short")}
                      data-testid={`mq-cost-${id}`}
                    >
                      <div>
                        <strong>{MATERIALS.find((m) => m.id === id)?.name}</strong>
                        <span aria-label={`持有 ${have}，需要 ${need}`}>
                          {have} / {need}
                        </span>
                      </div>
                      <progress
                        max={need}
                        value={Math.min(have, need)}
                        aria-label={`${MATERIALS.find((m) => m.id === id)?.name}材料進度`}
                      />
                      <small>{missing ? `尚缺 ${missing} 份` : "材料已足夠"}</small>
                      {missing > 0 && (
                        <button className="mq-text-link" onClick={() => setMaterialsOpen(true)}>
                          取得材料 →
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      ) : (
        <div className="mq-empty">
          <p>尚未持有命器，先尋一件與你相契的器物。</p>
          <button className="ui-primary" onClick={onSummon}>
            前往召喚
          </button>
        </div>
      )}

      <div className="mq-material-entry">
        <button
          className="ui-quiet"
          data-testid="mq-acquire-materials"
          onClick={() => setMaterialsOpen(!materialsOpen)}
          aria-expanded={materialsOpen}
          aria-controls="mq-material-sources"
        >
          取得材料 · 查看持有與來源
        </button>
        {materialsOpen && (
          <div id="mq-material-sources" className="mq-material-sources">
            <ul className="mq-mats" data-testid="mq-refine-mats">
              {MATERIALS.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong>
                  <span>持有 {save.materials[m.id]}</span>
                  <small>
                    {m.tier} · {m.source}
                  </small>
                </li>
              ))}
              <li>
                <strong>命器精華</strong>
                <span>持有 {essence} 份</span>
                <small>重複命器召喚轉化 · 後續養成與外觀用途開放</small>
              </li>
            </ul>
            <button className="ui-primary" data-testid="mq-material-raid" onClick={onAcquire}>
              {unlocks.raid ? "前往鎮厄司取得材料" : "查看鎮厄司・通關第 10 關開放"}
            </button>
          </div>
        )}
      </div>
      <details className="mq-progress-details">
        <summary>淬鍊須知</summary>
        <p>
          Lv.5 進階，Lv.10
          覺醒。只消耗討伐材料，不消耗墨玉、角色卡或緣分，不會卸下或分解命器。專屬效果需命定者裝備。
        </p>
      </details>
      {dock && (footerHost ? createPortal(dock, footerHost) : dock)}
      {awaken && <AwakenShow def={awaken.def} onClose={() => setAwaken(null)} />}
    </section>
  );
}

function imageFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.onerror = null;
  e.currentTarget.src = ARTIFACT_PLACEHOLDER;
}

/** One-shot 覺醒 presentation — only the already-written awaken.title / awaken.text (no new copy, no CG). */
export function AwakenShow({ def, onClose }: { def: ArtifactDef; onClose: () => void }) {
  return (
    <button
      className="mq-awaken-show"
      data-testid="mq-awaken-show"
      onClick={onClose}
      aria-label="覺醒演出，點一下關閉"
    >
      <span className="mq-awaken-glow" aria-hidden />
      <img
        src={artifactImage(def)}
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = ARTIFACT_PLACEHOLDER;
        }}
        alt={def.name}
        width={160}
        height={160}
      />
      <small>{def.name} · Lv.10</small>
      <strong>{def.awaken.title ?? "覺醒"}</strong>
      {def.awaken.text ? (
        <p>{def.awaken.text}</p>
      ) : (
        <p>
          通用被動【{def.general.name}】達到 Lv.10：{generalEffect(def, ARTIFACT_MAX_LEVEL)}
        </p>
      )}
      <em>點一下關閉</em>
    </button>
  );
}
