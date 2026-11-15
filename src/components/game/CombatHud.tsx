import { useState, useSyncExternalStore, type ReactNode } from "react";
import { TeamEquipment } from "./QuickEquip";
/** 共用戰鬥 UI: 墨厄面板、三人助陣列、共鳴演出、編隊、劇情事件結算。All modes share these. */
import { cn, Portrait, RarityMark } from "@/components/game/bits";
import { BY_ID, CHARACTERS, type Character } from "@/game/data";
import { RANK } from "@/game/logic";
import { skillOf } from "@/game/skills";
import { useSave } from "@/game/store";
import { COMBAT, COMBO_NAME, enemyImage, hpRatio, type EnemyDef, type EnemyState } from "@/game/combat";
import { raidEnemyMedia } from "@/game/raid-media";
import { autoTeam } from "@/game/team";
import type { StoryEvent } from "@/game/story-events";
import { SkillButton } from "@/components/game/Match3";
import "./combat.css";

/** Code-drawn 墨厄: an ink body whose silhouette changes with its kind. */
export function EnemyArt({ art, boss, size = 64 }: { art: EnemyDef["art"]; boss?: boolean; size?: number }) {
  const horns = art === "beast" || art === "lord";
  const wings = art === "crow" || art === "moth";
  const flame = art === "lamp";
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("cb-art", `cb-art-${art}`, boss && "cb-art-boss")} aria-hidden>
      <defs>
        <radialGradient id={`cbg-${art}`} cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#3b3140" />
          <stop offset="70%" stopColor="#120e14" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {wings ? (
        <g className="cb-art-wing" fill="#1a141c" opacity="0.9">
          <path d="M30 30 C14 14 4 22 6 34 C14 30 22 34 30 36Z" />
          <path d="M34 30 C50 14 60 22 58 34 C50 30 42 34 34 36Z" />
        </g>
      ) : null}
      {horns ? (
        <g fill="#2a1f22" stroke="#c9a14a" strokeWidth="0.8">
          <path d="M22 18 L16 4 L27 15Z" />
          <path d="M42 18 L48 4 L37 15Z" />
        </g>
      ) : null}
      <path
        className="cb-art-body"
        d="M32 10 C46 10 54 22 54 34 C54 46 48 56 40 58 C38 52 35 56 32 60 C29 56 26 52 24 58 C16 56 10 46 10 34 C10 22 18 10 32 10Z"
        fill={`url(#cbg-${art})`}
        stroke={boss ? "#c9a14a" : "#5b4a56"}
        strokeWidth={boss ? 1.4 : 0.8}
      />
      <g className="cb-art-eyes">
        <ellipse cx="24" cy="31" rx="4" ry={art === "mirage" ? 1.4 : 2.4} fill={flame ? "#ffcf7a" : "#e04a3a"} />
        <ellipse cx="40" cy="31" rx="4" ry={art === "mirage" ? 1.4 : 2.4} fill={flame ? "#ffcf7a" : "#e04a3a"} />
      </g>
      {art === "lord" ? <path d="M22 12 L26 6 L32 11 L38 6 L42 12Z" fill="#c9a14a" /> : null}
      {flame ? <path className="cb-art-flame" d="M32 2 C35 7 37 9 32 15 C27 9 29 7 32 2Z" fill="#ffb347" /> : null}
    </svg>
  );
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(notify: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** Raid-only presentation; load failures retain the illustration / SVG fallback. */
export function RaidEnemyVisual({ id, name, variant, children }: {
  id: string; name: string; variant: "picker" | "detail" | "combat"; children: ReactNode;
}) {
  const media = raidEnemyMedia(id);
  const reduced = useSyncExternalStore(subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches, () => true);
  const [videoFailed, setVideoFailed] = useState<string | null>(null);
  const [posterFailed, setPosterFailed] = useState<string | null>(null);
  if (!media || (videoFailed === id && posterFailed === id) || (reduced && posterFailed === id)) return <>{children}</>;
  return (
    <span className={`raid-media raid-media-${variant}`} data-raid-media={id} style={{ objectPosition: media.position }}>
      {reduced || videoFailed === id || media.video.endsWith(".webp") || media.video.endsWith(".png") ? (
        <img src={reduced || videoFailed === id ? media.poster : media.video} alt={name} draggable={false} onError={() => setPosterFailed(id)} />
      ) : (
        <video key={id} src={media.video} poster={media.poster} aria-label={name}
          muted loop playsInline autoPlay preload="metadata" disablePictureInPicture
          onError={() => setVideoFailed(id)} />
      )}
    </span>
  );
}

export type HitFx = { key: number; amount: number; kind: "hit" | "skill" | "duo" | "trio" | "purge" };

/**
 * The big 墨厄 stage (top of every fight): a large art slot — an illustration from ENEMY_IMAGES when one is
 * set, otherwise the code-drawn ink body — with name, 倒數, 生命/護盾 and 燈火 under it. The status note
 * floats over the bottom of the art so the board keeps its height.
 */
export function EnemyPanel({
  def,
  state,
  hit,
  attack,
  lampKind,
  note,
}: {
  def: EnemyDef;
  state: EnemyState;
  hit: HitFx | null;
  attack: { key: number } | null;
  lampKind?: string;
  note?: string | null;
}) {
  const ratio = hpRatio(state);
  const shieldPct = Math.min(100, (state.shield / Math.max(1, state.maxHp)) * 100 * 4);
  const image = enemyImage(def);
  return (
    <div
      className={cn("cb-enemy cb-stage mx-auto mt-1 w-[calc(100%-0.75rem)]", state.defeated && "cb-dead", def.boss && "cb-boss", state.phase === 2 && "cb-phase2")}
      data-testid="cb-enemy"
      data-hp={state.hp}
      data-maxhp={state.maxHp}
      data-shield={state.shield}
      data-countdown={state.countdown}
      data-defeated={state.defeated ? "1" : "0"}
      data-phase={state.phase}
      data-enemy={def.id}
    >
      <div className="cb-stage-art" data-testid="cb-enemy-art" data-image={image ? "1" : "0"}>
        <div key={raidEnemyMedia(def.id) ? def.id : hit?.key ?? 0} className={cn("cb-enemy-art", raidEnemyMedia(def.id) && "cb-raid-art", hit && !state.defeated && "cb-hit", attack && "cb-attacking")}>
          <RaidEnemyVisual id={def.id} name={def.name} variant="combat">
            {image ? <img src={image} alt={def.name} className="cb-stage-img" draggable={false} /> : <EnemyArt art={def.art} boss={def.boss} size={160} />}
          </RaidEnemyVisual>
          {hit && hit.amount > 0 ? (
            <span className={cn("cb-dmg", `cb-dmg-${hit.kind}`)} aria-hidden>
              −{hit.amount}
            </span>
          ) : null}
        </div>
        <p className="m3-note cb-stage-note text-center text-sm" aria-live="polite">
          {note ?? ""}
        </p>
      </div>
      <div className="cb-stage-info">
        <div className="flex items-center gap-2">
          <p className="min-w-0 max-w-[42%] truncate font-serif text-sm leading-tight text-fg">
            {def.name}
            <span className="ml-1 text-[0.6rem] tracking-wider text-muted">{def.title}</span>
          </p>
          <div className="cb-hp relative h-3.5 min-w-0 flex-1 rounded-full" aria-label={`墨厄生命 ${state.hp}/${state.maxHp}`}>
            <span className="cb-hp-fill" style={{ width: `${ratio * 100}%` }} />
            {def.phaseAt > 0 ? <i className="cb-hp-phase" style={{ left: `${def.phaseAt * 100}%` }} /> : null}
            {state.shield > 0 && !state.defeated ? <span className="cb-shield-fill" style={{ width: `${shieldPct}%` }} /> : null}
            <span className="cb-hp-text tabular-nums">
              {state.hp}/{state.maxHp}
              {state.shield > 0 && !state.defeated ? <span className="cb-shield-chip ml-1">盾 {state.shield}</span> : null}
            </span>
          </div>
          {state.defeated ? (
            <span className="cb-purged shrink-0 text-xs" data-testid="cb-purged">破厄</span>
          ) : (
            <span className={cn("cb-count shrink-0 text-[0.7rem] tabular-nums", state.countdown <= 1 && "cb-count-soon")} data-testid="cb-countdown">
              {state.countdown} 回後出手
            </span>
          )}
        </div>
        {state.lamp !== null ? (
          <div className="mt-1 flex items-center gap-1.5" data-testid="cb-lamp" data-lamp={state.lamp}>
            <span className="text-[0.62rem] text-gold">燈火</span>
            <div className="cb-lamp relative h-2 flex-1 rounded-full">
              <span className={cn("cb-lamp-fill", state.lamp <= 25 && "low")} style={{ width: `${state.lamp}%` }} />
            </div>
            <span className="w-7 text-right text-[0.62rem] tabular-nums text-gold">{state.lamp}</span>
            {lampKind ? <span className="text-[0.58rem] text-muted">{lampKind}添火</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ComboBanner({ combo }: { combo: { key: number; kind: "duo" | "trio" | "purge"; ids: string[] } | null }) {
  if (!combo) return null;
  const title = combo.kind === "purge" ? "破厄" : COMBO_NAME[combo.kind];
  return (
    <div key={combo.key} className={cn("cb-combo", `cb-combo-${combo.kind}`)} data-testid="cb-combo" data-kind={combo.kind} aria-live="polite">
      <span className="cb-combo-ink" aria-hidden />
      <div className="cb-combo-faces" aria-hidden>
        {combo.ids.map((id) => (BY_ID[id] ? <Portrait key={id} id={id} name={BY_ID[id]!.name} className="cb-combo-face" /> : null))}
      </div>
      <p className="cb-combo-title font-serif">{title}</p>
      <p className="cb-combo-sub">
        {combo.kind === "purge" ? "墨厄潰散 · 墨封化開 · 全隊蓄勢" : combo.kind === "trio" ? "三人同心 · 重擊破盾" : "兩人相應 · 追擊削盾"}
      </p>
    </div>
  );
}

export type DockMember = { id: string; energy: number; cost: number; uses: number };

/** 我的戰隊 — right under the 墨厄: three compact cards (ring + name + skill); tap a full ring to 發動. */
export function TeamDock({
  members,
  ready,
  chain,
  onActivate,
  artifacts,
}: {
  members: DockMember[];
  ready: boolean;
  chain: string[];
  onActivate: (id: string) => void;
  artifacts: Record<string, string | undefined>;
}) {
  return (
    <div className="cb-team mx-auto mt-1.5 grid w-[calc(100%-0.75rem)] grid-cols-3 gap-1.5" data-testid="cb-team" data-size={members.length}>
      {members.map((m) => {
        const who = BY_ID[m.id]!;
        const skill = skillOf(m.id);
        const full = m.cost > 0 && m.energy >= m.cost;
        const linked = chain.includes(m.id);
        return (
          <div
            key={m.id}
            className={cn("cb-member flex min-w-0 items-center gap-1.5", full && "cb-member-full", linked && "cb-linked")}
            data-testid={`cb-member-${m.id}`}
            data-energy={m.energy}
            data-cost={m.cost}
            data-uses={m.uses}
          >
            <SkillButton who={who} ratio={m.cost ? m.energy / m.cost : 0} full={full} disabled={!full || !ready} onTap={() => onActivate(m.id)} size="sm" />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate font-serif text-[0.74rem] leading-tight text-fg">{who.name}</p>
              <p className="truncate text-[0.6rem] leading-tight text-gold/80">「{skill?.name}」</p>
              {artifacts[m.id] ? <p className="truncate text-[0.54rem] leading-tight text-muted">命器 {artifacts[m.id]}</p> : null}
            </div>
          </div>
        );
      })}
      {Array.from({ length: Math.max(0, COMBAT.teamMax - members.length) }, (_, i) => (
        <div key={`empty-${i}`} className="cb-member cb-member-empty grid place-items-center text-[0.62rem] text-muted" aria-hidden>
          空位
        </div>
      ))}
    </div>
  );
}

/** 自動配對: pin first, then rarity / copies, preferring different skill effects. Saves the 編隊. */
function useAutoPair() {
  return () => {
    const st = useSave.getState();
    const team = autoTeam(CHARACTERS, st.owned, { pinned: st.assist });
    st.setRaidTeam(team);
    return team;
  };
}

/** Intro card block: the 三人戰隊 that will fight, 自動配對 and the 編隊 button. */
export function TeamSlot({ team, onEdit }: { team: string[]; onEdit: () => void }) {
  const autoPair = useAutoPair();
  return (
    <div
      className="cb-team-slot mt-3 rounded-2xl px-3 py-2.5 text-left"
      data-testid="cb-team-slot"
      data-size={team.length}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs tracking-widest text-muted">我的戰隊 · 三人</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="cb-edit rounded-full px-2.5 py-0.5 text-xs"
            onClick={() => autoPair()}
            data-testid="cb-team-auto"
          >
            自動配對
          </button>
          <button
            type="button"
            className="cb-edit rounded-full px-2.5 py-0.5 text-xs"
            onClick={onEdit}
            data-testid="cb-team-edit"
          >
            編隊
          </button>
        </div>
      </div>
      <TeamEquipment team={team} onAdd={onEdit} />
    </div>
  );
}

export function TeamPicker({ onClose }: { onClose: () => void }) {
  const owned = useSave((s) => s.owned);
  const team = useSave((s) => s.raid.team);
  const setTeam = useSave((s) => s.setRaidTeam);
  const autoPair = useAutoPair();
  const [target, setTarget] = useState<number | null>(null);
  const list: Character[] = CHARACTERS.filter((c) => (owned[c.id] ?? 0) > 0 && skillOf(c.id)).sort(
    (a, b) =>
      RANK[b.rarity] - RANK[a.rarity] ||
      (owned[b.id] ?? 0) - (owned[a.id] ?? 0) ||
      a.name.localeCompare(b.name, "zh-Hant"),
  );
  const toggle = (id: string) => {
    if (team.includes(id)) setTeam(team.filter((x) => x !== id));
    else if (target !== null && target < team.length)
      setTeam(team.map((x, i) => (i === target ? id : x)));
    else setTeam([...team, id].slice(0, COMBAT.teamMax));
    setTarget(null);
  };
  return (
    <div
      className="m3-modal fixed inset-0 z-[60] grid place-items-center p-4"
      onClick={onClose}
      data-testid="cb-team-picker"
    >
      <div
        className="m3-card cb-picker-card flex w-full max-w-sm flex-col rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl">我的戰隊</h3>
          <button
            className="cb-confirm rounded-xl bg-gold px-5"
            onClick={onClose}
            data-testid="cb-team-done"
          >
            完成
          </button>
        </div>
        <p className="mt-1 text-center text-xs text-muted">
          共用三人戰隊（{team.length}/{COMBAT.teamMax}）· 點卡片查看詳情／替換
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="cb-edit rounded-full px-2.5 py-0.5 text-xs"
            onClick={() => autoPair()}
            data-testid="cb-team-auto-pick"
          >
            自動配對
          </button>
          {team.length ? (
            <button
              type="button"
              className="ui-quiet text-xs"
              onClick={() => setTeam([])}
              data-testid="cb-team-clear"
            >
              清空
            </button>
          ) : null}
        </div>
        <div className="scroll-area mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          <TeamEquipment team={team} onSelect={setTarget} />
          <p className="cb-roster-hint">
            {target !== null
              ? `選擇人物替換第 ${target + 1} 位，或點已入隊人物移出`
              : "點上方角色卡替換；點下方已入隊人物可移出"}
          </p>
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">尚未相逢任何人物。先去召喚吧。</p>
          ) : null}
          {list.map((c) => {
            const skill = skillOf(c.id)!;
            const on = team.includes(c.id);
            const full = !on && team.length >= COMBAT.teamMax && target === null;
            return (
              <button
                key={c.id}
                type="button"
                disabled={full}
                className={cn(
                  "m3-pick flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left",
                  on && "on",
                  full && "opacity-50",
                )}
                onClick={() => toggle(c.id)}
                data-testid={`cb-pick-${c.id}`}
              >
                <Portrait
                  id={c.id}
                  name={c.name}
                  className={cn(
                    "m3-pick-face h-11 w-11 shrink-0 rounded-full object-cover object-top",
                    `rar-${c.rarity}`,
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <RarityMark rarity={c.rarity} />
                    <span className="font-serif text-fg">{c.name}</span>
                    <span className="m3-skill-name text-xs">「{skill.name}」</span>
                    {on ? (
                      <span className="cb-chip rounded-full px-1.5 text-[0.6rem]">
                        第 {team.indexOf(c.id) + 1} 位
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function EnemyPreview({ def }: { def: EnemyDef }) {
  // The interval is already shown explicitly; keep the limited preview for actual mechanics.
  const mechanics = def.traits.filter((t) => !/^每 \d+ 回出手一次，傷你的氣血$/.test(t));
  return (
    <div
      className={cn(
        "cb-preview mt-3 flex items-start gap-3 rounded-2xl px-3 py-2.5 text-left",
        def.boss && "cb-boss",
      )}
      data-testid="cb-preview"
    >
      <EnemyArt art={def.art} boss={def.boss} size={46} />
      <div className="min-w-0 flex-1">
        <p className="font-serif text-sm text-fg">
          {def.name} <span className="text-xs text-muted">生命 {def.hp}</span>
        </p>
        <p className="cb-enemy-interval">每 {def.attackEvery} 步出手</p>
        <ul className="mt-0.5 space-y-0.5 text-xs leading-snug text-muted">
          {mechanics.slice(0, 2).map((t) => (
            <li key={t}>· {t}</li>
          ))}
        </ul>
        <details className="cb-intel-details">
          <summary>查看詳細</summary>
          {mechanics.slice(2).map((t) => (
            <p key={t}>· {t}</p>
          ))}
          <p>打倒即「破厄」過關；氣血歸零則失敗</p>
        </details>
      </div>
    </div>
  );
}

export function StoryDone({
  event,
  won,
  reason,
  onRetry,
  onLeave,
}: {
  event: StoryEvent;
  won: boolean;
  reason: string;
  onRetry: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="m3-modal fixed inset-0 z-50 grid place-items-center overflow-y-auto p-5" data-testid="story-event-result" data-won={won ? "1" : "0"}>
      <div className={cn("m3-card w-full max-w-sm rounded-2xl p-5 text-center", won && "m3-card-win")}>
        <p className="text-xs tracking-[0.3em] text-muted">
          卷{event.volume}《{event.volumeTitle}》· 特殊事件
        </p>
        <h2 className="m3-result-title mt-1 font-serif text-3xl tracking-[0.25em]">{won ? "燈火長明" : "燈熄了"}</h2>
        <p className="mt-2 text-sm text-muted">{reason}</p>
        {won ? (
          <div className="cb-scene mt-4 space-y-1.5 rounded-xl px-3 py-3 text-left text-sm leading-relaxed" data-testid="story-event-scene">
            <p className="text-center font-serif text-gold">{event.reward.title}</p>
            {event.reward.lines.map((l, i) => (
              <p key={i}>
                {l.speaker === "旁白" ? <span className="text-muted">{l.text}</span> : (
                  <>
                    <span className="text-gold">{l.speaker}：</span>「{l.text}」
                  </>
                )}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">失敗不影響主線，可以再試或直接繼續閱讀。</p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="min-h-11 rounded-xl border border-line text-sm" onClick={onRetry} data-testid="story-event-retry">
            {won ? "再玩一次" : "再試一次"}
          </button>
          <button type="button" className="min-h-11 rounded-xl bg-gold text-sm" onClick={onLeave} data-testid="story-event-leave">
            繼續故事
          </button>
        </div>
      </div>
    </div>
  );
}


