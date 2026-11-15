/** Shared character/team quick-equip. The only source of equipment truth is useSave.artifacts. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BY_ID } from "@/game/data";
import { useSave } from "@/game/store";
import {
  ARTIFACT_BY_ID,
  artifactImage,
  artifactUnlocks,
  exclusiveActive,
  type ArtifactInstance,
  type ArtifactSave,
} from "@/game/artifacts";
import {
  equipmentStatus,
  sortedEquipment,
  equippedOn,
  emptyEquipmentTeam,
} from "@/game/quick-equip";
import { STEP_NAMES, describeFx, skillOf, skillStep } from "@/game/skills";
import { classOf } from "@/game/raid-lobby";
import { battleRows, generalEffect, ruleValue } from "./artifact-presentation";
import { Portrait } from "./bits";
import "./quick-equip.css";

export function EquipmentEffects({ inst, charId }: { inst: ArtifactInstance; charId: string }) {
  const resonance = useSave((s) => artifactUnlocks(s.m3).resonance);
  const def = ARTIFACT_BY_ID[inst.eid]!;
  const rows = battleRows(def, inst.level, charId).filter(
    (row) => row.key !== "shred" || exclusiveActive(def, charId),
  );
  return (
    <div className="qe-effects">
      {inst.equippedBy !== charId && <small>裝備後效果預覽 · 依目前解鎖條件</small>}
      <p>通用：{generalEffect(def, inst.level)}</p>
      {rows.map((row) => (
        <p key={row.key}>
          {row.label}：
          {row.key === "resonance" && !resonance ? "尚未解鎖（主線第 30 關）" : row.value}
        </p>
      ))}
      <p className="qe-state">{equipmentStatus(inst, charId, resonance)}</p>
      {def.exclusive && (
        <small>
          {inst.level >= 10
            ? exclusiveActive(def, charId)
              ? `專屬覺醒已啟動 · ${def.awaken.title}`
              : "專屬覺醒未啟動（需命定者）"
            : "專屬覺醒未啟動（需 Lv.10）"}
        </small>
      )}
      <details>
        <summary>觸發條件與詳細效果</summary>
        <small>{def.general.text}</small>
        {def.general.rule.kind !== "charge" && def.general.rule.fallback && (
          <small>
            關卡缺少對應目標時，替代通用效果：
            {ruleValue(def.general.rule.fallback.rule, inst.level)}，前{" "}
            {def.general.rule.fallback.rule.uses} 次。
          </small>
        )}
        {rows.map((row) => (
          <small key={row.key}>{row.hint}</small>
        ))}
        {def.exclusive && exclusiveActive(def, charId) && <small>專屬：{def.exclusive.text}</small>}
        <small>
          {!def.exclusive || exclusiveActive(def, charId)
            ? `覺醒：${def.awaken.text ?? "通用被動滿階"}（Lv.10；覺醒主線第 50 關開放）`
            : "非命定者無法啟動專屬及專屬覺醒。"}
        </small>
      </details>
    </div>
  );
}

function EquipmentHead({ inst }: { inst: ArtifactInstance }) {
  const def = ARTIFACT_BY_ID[inst.eid]!;
  return (
    <div className="qe-item-head">
      <img src={artifactImage(def)} alt={def.name} loading="lazy" />
      <span>
        <strong>{def.name}</strong>
        <small>
          {def.rarity} · Lv.{inst.level} / 10
        </small>
        <small>
          {inst.equippedBy ? `目前裝備：${BY_ID[inst.equippedBy]?.name}` : "未裝備 · 命器庫"}
        </small>
      </span>
    </div>
  );
}

export function EquipmentComparison({
  current,
  next,
  charId,
}: {
  current: ArtifactInstance | null;
  next: ArtifactInstance;
  charId: string;
}) {
  return (
    <section className="qe-compare" data-testid="qe-comparison" aria-label="命器效果比較">
      <div>
        <h4>目前命器</h4>
        {current ? (
          <>
            <EquipmentHead inst={current} />
            <EquipmentEffects inst={current} charId={charId} />
          </>
        ) : (
          <p>未裝備</p>
        )}
      </div>
      <div>
        <h4>準備裝備的命器</h4>
        <EquipmentHead inst={next} />
        <EquipmentEffects inst={next} charId={charId} />
      </div>
      <p>不換算戰力分數；僅列現有補助。未列出即無新增治療／護盾／減傷。</p>
    </section>
  );
}

export function QuickEquipSlot({ charId, compact = false }: { charId: string; compact?: boolean }) {
  const artifacts = useSave((s) => s.artifacts);
  const m3 = useSave((s) => s.m3);
  const owned = useSave((s) => (s.owned[charId] ?? 0) > 0);
  const [open, setOpen] = useState(false);
  const inst = equippedOn(artifacts, charId);
  const def = inst ? ARTIFACT_BY_ID[inst.eid] : null;
  const unlocks = artifactUnlocks(m3);
  return (
    <div className={`qe-slot-wrap${compact ? " qe-slot-compact" : ""}`}>
      <button
        type="button"
        className="qe-slot"
        data-testid={`qe-slot-${charId}`}
        disabled={!unlocks.vault || !owned}
        onClick={() => setOpen(true)}
        aria-label={`${BY_ID[charId]?.name}的命器 · ${def?.name ?? "裝備命器"}`}
      >
        {inst && def ? (
          <>
            <img src={artifactImage(def)} alt="" />
            <span>
              <strong>{def.name}</strong>
              <small>
                {compact ? `Lv.${inst.level}` : `${def.rarity} · Lv.${inst.level} · 已裝備`}
              </small>
              {compact ? (
                exclusiveActive(def, charId) && (
                  <small className="qe-exclusive" aria-label="命定專屬已啟動">
                    命定專屬
                  </small>
                )
              ) : (
                <small>{equipmentStatus(inst, charId, unlocks.resonance)}</small>
              )}
            </span>
          </>
        ) : (
          <span>{unlocks.vault ? "＋ 裝備命器" : "命器未開放"}</span>
        )}
      </button>
      {!unlocks.vault && !compact && (
        <small className="qe-gate" data-testid="qe-locked">
          通關主線第 5 關開放
        </small>
      )}
      {!owned && <small className="qe-gate">需先相遇此角色</small>}
      {open && <QuickEquipSheet charId={charId} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function UnequippedReminder({ team }: { team: string[] }) {
  const artifacts = useSave((s) => s.artifacts);
  const m3 = useSave((s) => s.m3);
  const unlocked = artifactUnlocks(m3).vault;
  const [dismissed, setDismissed] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const empty = emptyEquipmentTeam(m3, artifacts, team).filter((id) => BY_ID[id]);
  const key = empty.join(",");
  const visible = unlocked && empty.length > 0 && dismissed !== key;
  return (
    <>
      {visible && (
        <aside
          className="qe-reminder"
          data-testid="qe-unequipped-reminder"
          aria-label="未裝備命器提醒"
        >
          <p>{empty.map((id) => BY_ID[id]!.name).join("、")}未裝命器，可直接出戰。</p>
          <div>
            <button
              type="button"
              data-testid="qe-reminder-equip"
              onClick={() => setTarget(empty[0]!)}
            >
              快速裝備
            </button>
            <button type="button" data-testid="qe-reminder-skip" onClick={() => setDismissed(key)}>
              略過提醒
            </button>
          </div>
        </aside>
      )}
      {target && unlocked && <QuickEquipSheet charId={target} onClose={() => setTarget(null)} />}
    </>
  );
}

/** One compact strip shared by the editor and every preparation mode. No duplicate equipment state. */
export function TeamEquipment({
  team,
  onSelect,
  reminder = true,
  raid = false,
  savedTeam,
  onAdd,
}: {
  team: string[];
  onSelect?: (index: number) => void;
  reminder?: boolean;
  raid?: boolean;
  savedTeam?: string[];
  onAdd?: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const owned = useSave((s) => s.owned);
  const artifacts = useSave((s) => s.artifacts);
  const selected = expanded && team.includes(expanded) ? BY_ID[expanded] : null;
  const skill = selected ? skillOf(selected.id) : null;
  const inst = selected ? equippedOn(artifacts, selected.id) : null;
  return (
    <>
      <div className="qe-team" data-testid={raid ? "raid-team" : "qe-team"}>
        {[0, 1, 2].map((index) => {
          const id = team[index];
          const who = id ? BY_ID[id] : null;
          if (!who)
            return (
              <button
                key={index}
                type="button"
                className="qe-member qe-empty"
                aria-label={`加入第 ${index + 1} 位角色`}
                onClick={() => onAdd ? onAdd() : onSelect?.(index)}
              >
                ＋<small>待編入</small>
              </button>
            );
          return (
            <article
              key={id}
              className="qe-member"
              data-testid={raid ? `raid-member-${id}` : `qe-member-${id}`}
            >
              <button
                type="button"
                className="qe-character"
                aria-label={`${who.name} · 角色詳情與編隊`}
                aria-expanded={expanded === id}
                onClick={() => {
                  setExpanded(expanded === id ? null : id);
                  onSelect?.(index);
                }}
              >
                <span className="qe-face-wrap"><Portrait id={id} name={who.name} className="qe-portrait" />{savedTeam && !savedTeam.includes(id) && <span className="qe-autofill">自動</span>}</span>
                <strong>{who.name}</strong>
                <small>
                  {who.rarity} ·{" "}
                  <span data-testid={raid ? "raid-member-class" : undefined}>{classOf(id)}</span>
                </small>
              </button>
              <QuickEquipSlot charId={id} compact />
            </article>
          );
        })}
      </div>
      {reminder && <UnequippedReminder team={team} />}
      {selected && (
        <section className="qe-member-detail" data-testid="qe-member-detail">
          <strong>{selected.name} · 角色詳情</strong>
          {skill && (
            <p>
              「{skill.name}」{STEP_NAMES[skillStep(owned[selected.id] ?? 0)]} ·{" "}
              {describeFx(skill.steps[skillStep(owned[selected.id] ?? 0)])}
            </p>
          )}
          {inst ? <EquipmentEffects inst={inst} charId={selected.id} /> : <p>尚未裝備命器</p>}
          <button type="button" onClick={() => setExpanded(null)}>
            收起詳情
          </button>
        </section>
      )}
    </>
  );
}

function QuickEquipSheet({ charId, onClose }: { charId: string; onClose: () => void }) {
  const artifacts = useSave((s) => s.artifacts);
  const unlocked = useSave((s) => artifactUnlocks(s.m3).vault);
  const [filter, setFilter] = useState<"all" | "free" | "destined">("all");
  const [pending, setPending] = useState<{ inst: ArtifactInstance; base: ArtifactSave } | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const current = equippedOn(artifacts, charId);
  // Trap focus, restore trigger, close by Escape, and keep underlying scroll position intact.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab") return;
      const nodes = root.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), summary, [tabindex="0"]',
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(t);
  }, [notice]);
  const equip = (inst: ArtifactInstance, confirmed = false) => {
    const st = useSave.getState();
    if (confirmed && pending?.base !== st.artifacts) {
      setPending(null);
      setNotice("裝備已變動，請重新選擇確認。");
      return;
    }
    const result = st.equipArtifact(inst.uid, charId, confirmed);
    if (!result.ok) {
      if (result.reason === "needs-confirm" || result.reason === "needs-replace-confirm")
        setPending({ inst, base: st.artifacts });
      else
        setNotice(
          result.reason === "locked"
            ? "通關主線第 5 關開放"
            : result.reason === "battle-active"
              ? "戰鬥中不可換裝"
              : "裝備失敗，原裝備未變更。",
        );
      return;
    }
    setPending(null);
    setNotice(result.replaced ? "裝備成功 · 原命器已安全回庫" : "裝備成功");
  };
  const list = sortedEquipment(artifacts.instances, charId, filter);
  return createPortal(
    <div
      className="qe-scrim"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={root}
        className="qe-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${BY_ID[charId]?.name} · 快速換裝`}
        data-testid="qe-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qe-handle" aria-hidden />
        <header className="qe-heading">
          <div>
            <small>命器庫 · 免費換裝，不交換兩人的命器</small>
            <h3>{BY_ID[charId]?.name} · 快速換裝</h3>
          </div>
          <button type="button" onClick={onClose} data-testid="qe-close" aria-label="關閉快速換裝">
            ✕
          </button>
        </header>
        <p role="status" className="qe-toast" data-testid="qe-notice">
          {notice}
        </p>
        {!unlocked ? (
          <p>通關主線第 5 關開放</p>
        ) : pending ? (
          <div className="qe-scroll" data-testid="qe-confirm">
            <EquipmentComparison current={current} next={pending.inst} charId={charId} />
            {pending.inst.equippedBy && pending.inst.equippedBy !== charId && (
              <p className="qe-warning">
                將從{BY_ID[pending.inst.equippedBy]?.name}轉移，原佩戴者裝備欄清空。
              </p>
            )}
            {current && (
              <p className="qe-warning">
                {ARTIFACT_BY_ID[current.eid]?.name}將回命器庫，不會交換或消失。
              </p>
            )}
            <div className="qe-actions">
              <button type="button" onClick={() => setPending(null)}>
                返回選擇
              </button>
              <button
                type="button"
                className="qe-primary"
                data-testid="qe-confirm-yes"
                onClick={() => equip(pending.inst, true)}
              >
                確認{pending.inst.equippedBy ? "轉移" : "替換"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="qe-filters" aria-label="命器篩選">
              {(
                [
                  ["all", "全部"],
                  ["free", "未裝備"],
                  ["destined", "命定專屬"],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={filter === id}
                  data-testid={`qe-filter-${id}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="qe-scroll">
              {current && (
                <section className="qe-current">
                  <h4>目前命器</h4>
                  <EquipmentHead inst={current} />
                  <button
                    type="button"
                    data-testid="qe-unequip"
                    onClick={() =>
                      setNotice(
                        useSave.getState().unequipArtifact(current.uid)
                          ? "已卸下 · 命器已回庫"
                          : "卸下失敗，原裝備未變更（戰鬥中不可換裝）。",
                      )
                    }
                  >
                    卸下命器
                  </button>
                </section>
              )}
              {list.length === 0 && (
                <p className="qe-empty">
                  {filter === "destined"
                    ? "尚無此角色的命定專屬命器，可切換全部選擇其他命器。"
                    : "沒有符合的命器。"}
                </p>
              )}
              {list.map((inst) => (
                <article className="qe-item" key={inst.uid} data-testid={`qe-item-${inst.uid}`}>
                  <EquipmentHead inst={inst} />
                  <EquipmentEffects inst={inst} charId={charId} />
                  <button
                    type="button"
                    disabled={inst.equippedBy === charId}
                    data-testid={`qe-equip-${inst.uid}`}
                    onClick={() => equip(inst)}
                  >
                    {inst.equippedBy === charId
                      ? "目前已裝備"
                      : inst.equippedBy
                        ? "比較並轉移"
                        : current
                          ? "比較並替換"
                          : "直接裝備"}
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
