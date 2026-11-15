import { EquipmentComparison } from "./QuickEquip";
import { equipmentStatus } from "@/game/quick-equip";
import { ArtifactRefine } from "./ArtifactRefine";
import { ArtifactEffects, BattleBenefits } from "./ArtifactEffects";
import { Raid } from "./Raid";
import "./artifacts.css";
import { devArtifacts } from "@/game/artifact-dev";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, X } from "lucide-react";
import { Portrait, cn } from "./bits";
import { BY_ID, CHARACTERS, RARITY_ORDER } from "@/game/data";
import { useSave } from "@/game/store";
import {
  ARTIFACTS,
  ARTIFACT_PLACEHOLDER,
  ARTIFACT_BY_ID,
  ARTIFACT_RARITY_LABEL,
  UNLOCK_AT,
  UNLOCK_NAMES,
  type UnlockKey,
  artifactImage,
  artifactUnlocks,
  exclusiveActive,
  transferPrompt,
  type ArtifactDef,
  type ArtifactInstance,
  type ArtifactSave,
} from "@/game/artifacts";

export type ArtifactTab = "vault" | "codex" | "materials" | "summon" | "refine";
type Tab = ArtifactTab;
const GATE_NOTE: Record<UnlockKey, string> = {
  vault: "命器召喚・裝備・淬鍊 Lv.1–4",
  raid: "鎮厄司普通討伐・淨墨砂",
  elite: "精英討伐・鎮厄晶（Lv.5 進階）",
  resonance: "技能發動時與命器被動共鳴",
  sovereign: "首領封印・天命殘印",
  awaken: "Lv.10 覺醒",
};

export function ArtifactHall({
  onClose,
  initialCharacter,
  initialTab,
  onSummon,
}: {
  onClose: () => void;
  initialCharacter?: string;
  initialTab?: ArtifactTab;
  onSummon?: () => void;
}) {
  const m3 = useSave((s) => s.m3);
  const owned = useSave((s) => s.owned);
  const save = useSave((s) => s.artifacts);
  const dev = useMemo(devArtifacts, []);
  const unlocks = artifactUnlocks(m3, dev);
  const [tab, setTab] = useState<Tab>(
    initialTab === "materials" ? "refine" : initialTab === "summon" ? "vault" : (initialTab ?? "vault"),
  );
  const [refineUid, setRefineUid] = useState<string | null>(null);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [openDef, setOpenDef] = useState<string | null>(null);
  const [footerHost, setFooterHost] = useState<HTMLDivElement | null>(null);
  const [raidOpen, setRaidOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocks.vault) return;
    useSave.getState().syncArtifactGift(dev);
    const gift = useSave.getState().takeArtifactGiftNotice();
    if (gift) setNotice(`命器閣初開，贈你一件「${gift}」，已收入命器庫。`);
  }, [unlocks.vault, dev]);

  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (raidOpen) setRaidOpen(false);
      else if (openUid || openDef) {
        setOpenUid(null);
        setOpenDef(null);
      } else onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, raidOpen, openUid, openDef]);

  const inst = openUid ? (save.instances.find((i) => i.uid === openUid) ?? null) : null;
  const sorted = [...save.instances].sort(
    (a, b) =>
      RARITY_RANK[ARTIFACT_BY_ID[b.eid]!.rarity] - RARITY_RANK[ARTIFACT_BY_ID[a.eid]!.rarity] ||
      Number(a.uid.slice(1)) - Number(b.uid.slice(1)),
  );

  return (
    <section
      className="ink-overlay mq-screen fixed inset-0 z-40 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="命器閣"
      data-testid="mq-hall"
    >
      <header className="journey-header safe-top">
        <button
          className="ui-icon"
          aria-label={inst || openDef ? "返回命器閣" : "返回"}
          onClick={() => (inst || openDef ? (setOpenUid(null), setOpenDef(null)) : onClose())}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="ui-eyebrow">裝備於角色的被動之器</p>
          <h1>命器閣</h1>
        </div>
        <button className="ui-icon" aria-label="關閉命器閣" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="journey-scroll mq-scroll">
        {!unlocks.vault ? (
          <div className="mq-locked" data-testid="mq-locked">
            <Lock size={30} strokeWidth={1.2} />
            <h2>命器閣尚未開啟</h2>
            <p>通關主線第 {UNLOCK_AT.vault} 關後開放。首次開放時，贈送一件基礎通用命器。</p>
          </div>
        ) : inst ? (
          <InstanceDetail
            inst={inst}
            owned={owned}
            initialCharacter={initialCharacter}
            onNotice={setNotice}
            onRefine={() => {
              setRefineUid(inst.uid);
              setOpenUid(null);
              setTab("refine");
            }}
          />
        ) : openDef ? (
          <DefDetail
            def={ARTIFACT_BY_ID[openDef]!}
            count={save.instances.filter((i) => i.eid === openDef).length}
          />
        ) : (
          <div className="mq-content">
            {notice && tab === "vault" ? (
              <p className="hall-notice" role="status" data-testid="mq-notice">
                {notice}
              </p>
            ) : null}
            <nav className="mq-tabs" aria-label="命器閣分頁">
              {(
                [
                  ["vault", "裝備"],
                  ["refine", "淬鍊"],
                  ["codex", "圖鑑"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={cn("mq-tab", tab === k && "on")}
                  aria-pressed={tab === k}
                  onClick={() => {
                    setTab(k);
                    document.querySelector(".mq-scroll")?.scrollTo({ top: 0 });
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === "refine" ? (
              <ArtifactRefine
                key={refineUid ?? "first"}
                initialUid={refineUid}
                footerHost={footerHost}
                initialMaterialsOpen={initialTab === "materials"}
                onAcquire={() => setRaidOpen(true)}
                onSummon={() => onSummon?.()}
              />
            ) : null}
            {tab === "vault" ? (
              sorted.length ? (
                <ul className="mq-grid" data-testid="mq-list">
                  {sorted.map((i) => (
                    <li key={i.uid}>
                      <ArtifactTile
                        def={ARTIFACT_BY_ID[i.eid]!}
                        inst={i}
                        onOpen={() => setOpenUid(i.uid)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mq-empty">尚未持有命器。</p>
              )
            ) : null}
            {tab === "codex" ? (
              <ul className="mq-grid">
                {ARTIFACTS.map((d) => {
                  const n = save.instances.filter((i) => i.eid === d.id).length;
                  return (
                    <li key={d.id}>
                      <ArtifactTile def={d} count={n} onOpen={() => setOpenDef(d.id)} />
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <details className="mq-progress-details">
              <summary>開放進度與養成說明</summary>
              <div className="mq-future" aria-label="開放進度" data-testid="mq-unlocks">
                {(Object.keys(UNLOCK_AT) as UnlockKey[]).map((k) => (
                  <div
                    key={k}
                    className={cn("mq-future-item", unlocks[k] && "on")}
                    data-unlock={k}
                    data-open={unlocks[k] ? "1" : "0"}
                  >
                    {unlocks[k] ? <span aria-hidden>✓</span> : <Lock size={14} />}
                    <span>{UNLOCK_NAMES[k]}</span>
                    <small>
                      {unlocks[k] ? "已開放" : `通關第 ${UNLOCK_AT[k]} 關後開放`}・{GATE_NOTE[k]}
                    </small>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
      <div className="mq-footer-host" ref={setFooterHost} />
      {raidOpen ? (
        <div
          className="ink-overlay m3-screen mq-material-raid fixed inset-0 z-50 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="取得材料・鎮厄司"
        >
          <Raid onClose={() => setRaidOpen(false)} />
        </div>
      ) : null}
    </section>
  );
}

const RARITY_RANK = { R: 0, S: 1, SS: 2, SSR: 3 } as const;

function ArtifactTile({
  def,
  inst,
  count,
  onOpen,
}: {
  def: ArtifactDef;
  inst?: ArtifactInstance;
  count?: number;
  onOpen: () => void;
}) {
  const wearer = inst?.equippedBy ? BY_ID[inst.equippedBy] : null;
  const dim = count === 0;
  return (
    <button
      className={cn("mq-tile", `r-${def.rarity}`, dim && "dim")}
      onClick={onOpen}
      data-testid={inst ? `mq-inst-${inst.uid}` : `mq-def-${def.id}`}
    >
      <img
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = ARTIFACT_PLACEHOLDER;
        }}
        src={artifactImage(def)}
        alt=""
        width={64}
        height={64}
        loading="lazy"
      />
      <span className="mq-tile-text">
        <strong>{def.name}</strong>
        <small>
          {ARTIFACT_RARITY_LABEL[def.rarity]}
          {inst ? `・Lv.${inst.level}` : ""}
          {count !== undefined ? `・持有 ${count}` : ""}
        </small>
        {inst ? (
          <small className="mq-wearer">
            {wearer ? `裝備於 ${wearer.name}` : "未裝備・點選裝備"}
          </small>
        ) : null}
        {inst && def.exclusive ? (
          <small className={exclusiveActive(def, inst.equippedBy) ? "mq-match" : "mq-muted"}>
            {exclusiveActive(def, inst.equippedBy)
              ? "命定相契・專屬已啟動"
              : `命定者 ${BY_ID[def.exclusiveCharacterId ?? ""]?.name}・專屬未啟動`}
          </small>
        ) : null}
      </span>
    </button>
  );
}

function Effects({
  def,
  wearerId,
  level = 1,
}: {
  def: ArtifactDef;
  wearerId: string | null;
  level?: number;
}) {
  const m3 = useSave((s) => s.m3);
  const unlocks = artifactUnlocks(m3, devArtifacts());
  return (
    <>
      <BattleBenefits def={def} level={level} wearerId={wearerId} resonance={unlocks.resonance} />
      <ArtifactEffects def={def} level={level} wearerId={wearerId} awakenOpen={unlocks.awaken} />
    </>
  );
}

function Head({ def }: { def: ArtifactDef }) {
  const owner = def.exclusiveCharacterId ? BY_ID[def.exclusiveCharacterId] : null;
  return (
    <div className="mq-head">
      <img
        onError={(e) => {
          e.currentTarget.onerror = null;
          e.currentTarget.src = ARTIFACT_PLACEHOLDER;
        }}
        src={artifactImage(def)}
        alt={def.name}
        width={120}
        height={120}
      />
      <div>
        <p className={cn("mq-rarity", `r-${def.rarity}`)}>{ARTIFACT_RARITY_LABEL[def.rarity]}</p>
        <h2>{def.name}</h2>
        <p className="mq-owner">{owner ? `專屬角色：${owner.name}` : "通用命器・無專屬角色"}</p>
        <details className="mq-lore-details">
          <summary>器物小記</summary>
          <p className="mq-lore">{def.lore}</p>
        </details>
      </div>
    </div>
  );
}

function DefDetail({ def, count }: { def: ArtifactDef; count: number }) {
  return (
    <div className="mq-content mq-detail">
      <Head def={def} />
      <p className="mq-meta">
        持有 {count} 件{count === 0 ? "・尚未取得，可於命器召喚尋覓" : ""}
      </p>
      <Effects def={def} wearerId={null} />
    </div>
  );
}

function InstanceDetail({
  inst,
  owned,
  initialCharacter,
  onNotice,
  onRefine,
}: {
  inst: ArtifactInstance;
  owned: Record<string, number>;
  initialCharacter?: string;
  onNotice: (s: string | null) => void;
  onRefine: () => void;
}) {
  const def = ARTIFACT_BY_ID[inst.eid]!;
  const save = useSave((s) => s.artifacts);
  const resonance = useSave((s) => artifactUnlocks(s.m3).resonance);
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState<{ to: string; from: string; base: ArtifactSave } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const wearer = inst.equippedBy ? BY_ID[inst.equippedBy] : null;
  const roster = CHARACTERS.filter((c) => (owned[c.id] ?? 0) > 0).sort(
    (a, b) =>
      (b.id === def.exclusiveCharacterId ? 1 : 0) - (a.id === def.exclusiveCharacterId ? 1 : 0) ||
      (b.id === initialCharacter ? 1 : 0) - (a.id === initialCharacter ? 1 : 0) ||
      RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity),
  );

  const equip = (to: string, ok = false) => {
    if (ok && confirm?.base !== useSave.getState().artifacts) {
      setConfirm(null);
      setMsg("裝備已變動，請重新選擇確認。");
      return;
    }
    const res = useSave.getState().equipArtifact(inst.uid, to, ok);
    if (!res.ok) {
      if (res.reason === "needs-confirm" || res.reason === "needs-replace-confirm") setConfirm({ to, from: res.from, base: useSave.getState().artifacts });
      else setMsg(res.reason === "locked" ? "通關主線第 5 關開放。" : res.reason === "battle-active" ? "戰鬥中不可換裝。" : "裝備失敗，原裝備未變更。");
      return;
    }
    setConfirm(null);
    setPicking(false);
    const replaced = res.replaced ? save.instances.find((i) => i.uid === res.replaced) : null;
    setMsg(
      `已裝備於${BY_ID[to]!.name}。${replaced ? `原本的「${ARTIFACT_BY_ID[replaced.eid]?.name}」已收回命器閣。` : ""}`,
    );
    onNotice(null);
  };

  return (
    <div className="mq-content mq-detail" data-testid="mq-detail">
      <Head def={def} />
      <p className="mq-meta">
        命器等級 Lv.{inst.level} / 10・{wearer ? `目前裝備：${wearer.name}` : "目前未裝備"}
      </p>
      {msg ? (
        <p className="hall-notice" role="status" data-testid="mq-msg">
          {msg}
        </p>
      ) : null}
      <div className="mq-actions">
        <button className="ui-primary" data-testid="mq-equip" onClick={() => setPicking((v) => !v)}>
          {wearer ? "更換裝備角色" : "裝備"}
        </button>
        {wearer ? (
          <button
            className="ui-quiet"
            data-testid="mq-unequip"
            onClick={() => {
              const ok = useSave.getState().unequipArtifact(inst.uid);
              setMsg(ok ? `已從${wearer.name}身上卸下，收回命器閣。` : "卸下失敗，原裝備未變更。");
            }}
          >
            卸下
          </button>
        ) : null}
        <button
          className="ui-quiet"
          onClick={() => useSave.getState().setArtifactLock(inst.uid, !inst.locked)}
        >
          {inst.locked ? "解除鎖定" : "鎖定"}
        </button>
      </div>
      <button className="ui-quiet mq-refine-link" data-testid="mq-to-refine" onClick={onRefine}>
        {inst.level >= 10 ? "查看覺醒" : "前往淬鍊・查看升級比較"}
      </button>
      {confirm ? (
        <div
          className="mq-confirm"
          role="alertdialog"
          aria-label="轉移命器"
          data-testid="mq-confirm"
        >
          <EquipmentComparison current={save.instances.find(i => i.equippedBy === confirm.to) ?? null} next={inst} charId={confirm.to} />
          <p>{inst.equippedBy && inst.equippedBy !== confirm.to ? transferPrompt(BY_ID[inst.equippedBy]!.name, BY_ID[confirm.to]!.name, def.name) : `確定替換${BY_ID[confirm.to]!.name}的命器嗎？`}</p>
          <p>目標角色原命器回庫，原佩戴者裝備欄清空；不會交換。</p>
          <div className="mq-actions">
            <button
              className="ui-primary"
              data-testid="mq-confirm-yes"
              onClick={() => equip(confirm.to, true)}
            >
              確認裝備
            </button>
            <button className="ui-quiet" onClick={() => setConfirm(null)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      {picking ? (
        <ul className="mq-roster" aria-label="選擇裝備角色" data-testid="mq-roster">
          {roster.map((c) => {
            const has = save.instances.find((i) => i.equippedBy === c.id);
            const match = exclusiveActive(def, c.id);
            return (
              <li key={c.id}>
                <button
                  className={cn("mq-person", inst.equippedBy === c.id && "on")}
                  onClick={() => equip(c.id)}
                  data-testid={`mq-pick-${c.id}`}
                >
                  <Portrait id={c.id} name={c.name} className="mq-face" />
                  <span>
                    <strong>
                      {c.name}
                      <em>{c.rarity}</em>
                    </strong>
                    <small>
                      {match ? "命定之人・專屬可喚醒" : def.exclusive ? "通用被動生效" : "可裝備"}
                      {has ? `・現裝備「${ARTIFACT_BY_ID[has.eid]?.name}」` : ""}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {inst.equippedBy && <p className="mq-meta">{equipmentStatus(inst, inst.equippedBy, resonance)}</p>}
      <Effects def={def} wearerId={inst.equippedBy} level={inst.level} />
    </div>
  );
}
