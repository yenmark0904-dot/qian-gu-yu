import { TeamEquipment } from "./QuickEquip";
/**
 * 鎮厄司 lobby (階段 H / I / J; UI t470). Fights run on the SHARED HP combat — the Match3 `Game` in raid mode — so
 * 氣血, 7×8, 回春玉, 三人戰隊, 天命連攜 and 命器 all behave exactly as in 主線 / 深宮.
 * Gates: 鎮厄司 第 10 關 · 精英討伐 第 20 關 · 首領封印 第 40 關 (auto-unlocked from stars for old saves).
 *
 * Layout (t470): BOSS picker → single BOSS detail (危險 tags / 查看詳情) → 討伐獎勵 → 出戰編隊 → sticky 討伐 button.
 * Every number shown is read from RAID_ENCOUNTERS + the shared combat constants (see game/raid-lobby.ts).
 */
import { useMemo, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { CHARACTERS } from "@/game/data";
import { useSave } from "@/game/store";
import { autoTeam, fightTeam } from "@/game/team";
import { MATERIALS, UNLOCK_AT, UNLOCK_NAMES, artifactUnlocks } from "@/game/artifacts";
import { devArtifacts } from "@/game/artifact-dev";
import { RAID_ENCOUNTERS, RAID_TIER_NAME, cleanRaidTeam, markRaidTry, type RaidEncounter } from "@/game/raid";
import {
  raidActionLabel,
  raidMechanics,
  raidNeeds,
  raidRewards,
  raidStats,
  raidTags,
  raidTeamFit,
  type RewardLine,
} from "@/game/raid-lobby";
import { MoYu, cn } from "./bits";
import { EnemyArt, RaidEnemyVisual, TeamPicker } from "./CombatHud";
import { Game } from "./Match3";
import "./raid.css";
import "./raid-lobby.css";

const MAT_NAME: Record<string, string> = Object.fromEntries(MATERIALS.map((m) => [m.id, m.name]));
const TIER_SEAL: Record<RaidEncounter["tier"], string> = { normal: "壹", elite: "貳", sovereign: "參" };

function RewardChips({ items, muted }: { items: RewardLine[]; muted?: boolean }) {
  return (
    <span className="rh-chips">
      {items.map((it) => (
        <span key={it.id} className={cn("rh-chip", `rh-mat-${it.id}`, muted && "muted")}>
          {it.id === "ink" ? <MoYu /> : <i aria-hidden />}
          {it.id === "ink" ? "墨玉" : (MAT_NAME[it.id] ?? it.id)} ×{it.n}
        </span>
      ))}
    </span>
  );
}

export function Raid({ onClose }: { onClose: () => void }) {
  const owned = useSave((s) => s.owned);
  const raid = useSave((s) => s.raid);
  const m3 = useSave((s) => s.m3);
  const pinned = useSave((s) => s.assist);
  const dev = useMemo(devArtifacts, []);
  const unlocks = artifactUnlocks(m3, dev);
  const [fight, setFight] = useState<{ enc: RaidEncounter; run: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState(false);
  // Default: the first open encounter not yet won, else the highest open one.
  const [selId, setSelId] = useState<string>(() => {
    const open = RAID_ENCOUNTERS.filter((e) => unlocks[e.unlock]);
    return (open.find((e) => !raid.records[e.id]?.clears && !raid.records[e.id]?.cleared) ?? open.at(-1) ?? RAID_ENCOUNTERS[0]!).id;
  });
  const saved = cleanRaidTeam(raid.team, owned);

  if (!unlocks.raid)
    return (
      <section className="raid-lobby" data-testid="raid-lobby" data-locked="1">
        <header>
          <button onClick={onClose}>返回</button>
          <h2>鎮厄司</h2>
        </header>
        <div className="raid-locked" data-testid="raid-locked">
          <Lock size={30} strokeWidth={1.2} />
          <h3>鎮厄司尚未開啟</h3>
          <p>通關主線第 {UNLOCK_AT.raid} 關後開放。開放後可重複討伐墨厄，取得命器淬鍊材料。</p>
          <ul className="raid-gates">
            {(["raid", "elite", "sovereign"] as const).map((k) => (
              <li key={k}>
                第 {UNLOCK_AT[k]} 關 · {UNLOCK_NAMES[k]}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );

  if (fight)
    return (
      <div className="flex h-full flex-col" data-testid="raid-battle">
        <Game
          key={fight.run}
          def={fight.enc.def}
          onMap={() => setFight(null)}
          onPlay={() => setFight({ enc: fight.enc, run: Date.now() })}
          raid={{
            enc: fight.enc,
            onClear: () => useSave.getState().winRaid(fight.enc.id, dev),
            onLeave: () => setFight(null),
          }}
        />
      </div>
    );

  const enc = RAID_ENCOUNTERS.find((e) => e.id === selId) ?? RAID_ENCOUNTERS[0]!;
  const open = unlocks[enc.unlock];
  const rec = raid.records[enc.id];
  const stats = raidStats(enc);
  const tags = raidTags(enc);
  const mechanics = raidMechanics(enc);
  const rewards = raidRewards(enc, rec);
  // The team that will actually fight: the saved 編隊 topped up by 自動配對 (same rule as every 三消 mode).
  const team = fightTeam(saved, owned, CHARACTERS, pinned);
  const fit = raidTeamFit(enc, team);
  const needs = raidNeeds(enc);
  const canFight = open && team.length > 0;
  const label = raidActionLabel(rec);

  const start = () => {
    if (!canFight) return;
    // 統一三人戰隊: a short / empty 編隊 is topped up by 自動配對 when the fight starts.
    const st = useSave.getState();
    if (team.join() !== saved.join()) st.setRaidTeam(team);
    useSave.setState({ raid: markRaidTry(useSave.getState().raid, enc.id) });
    setFight({ enc, run: Date.now() });
  };

  return (
    <section className={cn("raid-hall", `rh-tier-${enc.tier}`)} data-testid="raid-lobby" data-selected={enc.id}>
      <header className="rh-head">
        <button type="button" className="rh-back" onClick={onClose}>
          返回
        </button>
        <h2>鎮厄司</h2>
        <span className="rh-head-pad" aria-hidden />
      </header>
      <p className="rh-intro" data-testid="raid-explain">
        討伐墨厄得<b>命器淬鍊材料</b> · 失敗不扣資源 · 可重複挑戰
      </p>

      {/* ── BOSS picker ── */}
      <div className="rh-picker" role="tablist" aria-label="選擇討伐對象" data-testid="raid-tiers">
        {RAID_ENCOUNTERS.map((e) => {
          const isOpen = unlocks[e.unlock];
          const r = raid.records[e.id];
          const on = e.id === enc.id;
          return (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={cn("rh-pick", `rh-pick-${e.tier}`, on && "on", !isOpen && "locked")}
              data-testid={`raid-tier-${e.tier}`}
              data-open={isOpen ? "1" : "0"}
              onClick={() => {
                setSelId(e.id);
                setDetail(false);
              }}
            >
              <span className="rh-pick-tier">{RAID_TIER_NAME[e.tier]}</span>
              <span className="rh-pick-art">
                <RaidEnemyVisual id={e.enemy.id} name={e.enemy.name} variant="picker">
                  <EnemyArt art={e.enemy.art} boss={e.enemy.boss} size={44} />
                </RaidEnemyVisual>
                {!isOpen ? (
                  <span className="rh-pick-lock">
                    <Lock size={14} />
                  </span>
                ) : null}
              </span>
              <span className="rh-pick-name">{e.enemy.name}</span>
              <span className="rh-pick-state">
                {!isOpen ? `第 ${UNLOCK_AT[e.unlock]} 關開放` : r?.clears ? `已討伐 ${r.clears}` : r?.firstDrop ? "已通關" : "首勝待領"}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── BOSS detail ── */}
      <article className="rh-detail" data-testid="raid-detail" aria-live="polite">
        <div className="rh-stage">
          <div className="rh-mist" aria-hidden />
          <span className="rh-seal" aria-hidden>
            {TIER_SEAL[enc.tier]}
          </span>
          <div className="rh-boss-art">
            <RaidEnemyVisual id={enc.enemy.id} name={enc.enemy.name} variant="detail">
              <EnemyArt art={enc.enemy.art} boss={enc.enemy.boss} size={112} />
            </RaidEnemyVisual>
          </div>
          <div className="rh-boss-id">
            <p className="rh-boss-tier">{RAID_TIER_NAME[enc.tier]}</p>
            <h3 data-testid="raid-boss-name">{enc.enemy.name}</h3>
            <p className="rh-record" data-testid="raid-record">
              {rec?.clears ? `已討伐 ${rec.clears} 次` : (rec?.tries ?? 0) > 0 ? "已挑戰 · 尚未勝利" : "尚未挑戰"}
            </p>
          </div>
        </div>
        <dl className="rh-stats">
          <div>
            <dt>墨厄生命</dt>
            <dd data-testid="raid-boss-hp">{stats.hp.toLocaleString()}</dd>
          </div>
          <div>
            <dt>你的氣血</dt>
            <dd data-testid="raid-player-hp">{stats.playerHp.toLocaleString()}</dd>
          </div>
          <div>
            <dt>出手</dt>
            <dd>
              每 {stats.every} 回<small> · 傷 {stats.hit}</small>
            </dd>
          </div>
        </dl>

        {!open ? (
          <p className="rh-gate" data-testid={`raid-gate-${enc.tier}`}>
            <Lock size={14} /> 通關主線第 {UNLOCK_AT[enc.unlock]} 關後開放
          </p>
        ) : null}

        <section className="rh-block" aria-label="主要危險">
          <h4>主要危險</h4>
          <ul className="rh-tags" data-testid="raid-tags">
            {tags.map((t) => (
              <li key={t.key} className={`rh-tag rh-tag-${t.key}`}>
                {t.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="rh-more"
            aria-expanded={detail}
            onClick={() => setDetail((v) => !v)}
            data-testid="raid-detail-toggle"
          >
            {detail ? "收起詳情" : "查看詳情"}
            <ChevronDown size={14} className={cn("rh-more-icon", detail && "up")} />
          </button>
          {detail ? (
            <ul className="rh-mech" data-testid="raid-mechanics">
              {mechanics.map((m) => (
                <li key={m.key} data-key={m.key}>
                  <b>{m.title}</b>
                  <span>{m.text}</span>
                </li>
              ))}
              <li data-key="tip">
                <b>攻略</b>
                <span>{enc.def.tip}</span>
              </li>
            </ul>
          ) : null}
        </section>

        <section className="rh-block" aria-label="討伐獎勵" data-testid={`raid-drop-${enc.tier}`}>
          <h4>討伐獎勵</h4>
          <div className="rh-reward" data-testid="raid-reward-every">
            <span className="rh-reward-k">每次勝利</span>
            <RewardChips items={rewards.every} />
            <span className="rh-reward-note">必得</span>
          </div>
          <div className={cn("rh-reward", rewards.firstWin.claimed && "claimed")} data-testid="raid-reward-first" data-claimed={rewards.firstWin.claimed ? "1" : "0"}>
            <span className="rh-reward-k">首勝加贈</span>
            <RewardChips items={rewards.firstWin.items} muted={rewards.firstWin.claimed} />
            <span className="rh-reward-note">{rewards.firstWin.claimed ? "已領取" : "限一次"}</span>
          </div>
          {rewards.legacyInk ? (
            <div className={cn("rh-reward", rewards.legacyInk.claimed && "claimed")} data-testid="raid-legacy-ink" data-claimed={rewards.legacyInk.claimed ? "1" : "0"}>
              <span className="rh-reward-k">首勝墨玉</span>
              <RewardChips items={[{ id: "ink", n: rewards.legacyInk.n }]} muted={rewards.legacyInk.claimed} />
              <span className="rh-reward-note">{rewards.legacyInk.claimed ? "已領取" : "限一次"}</span>
            </div>
          ) : null}
          <p className="rh-fine">首次挑戰（未勝）無另外獎勵；重複討伐只掉材料，不發墨玉。</p>
        </section>

        <section className="rh-block" aria-label="出戰編隊" data-testid="raid-team-block">
          <div className="rh-team-head">
            <h4>出戰編隊</h4>
            <div className="rh-team-actions">
              <button
                type="button"
                className="rh-ghost"
                data-testid="raid-auto"
                onClick={() => useSave.getState().setRaidTeam(autoTeam(CHARACTERS, owned, { pinned }))}
              >
                自動配對
              </button>
              <button type="button" className="rh-ghost" data-testid="raid-edit-team" onClick={() => setPicking(true)}>
                編隊
              </button>
            </div>
          </div>
          {team.length === 0 ? (
            <p className="rh-empty" data-testid="raid-team-empty">
              尚未相逢可出戰的人物。先回主頁召喚，再來討伐。
            </p>
          ) : (
            <>
              {saved.length < team.length ? (
                <p className="rh-autonote" data-testid="raid-team-autofill">
                  {saved.length === 0 ? "尚未編隊：" : "空位："}開戰時由自動配對補上（標「自動」者）
                </p>
              ) : null}
              <TeamEquipment team={team} onSelect={() => setPicking(true)} reminder={!picking} savedTeam={saved} raid />
              <div className={cn("rh-fit", `rh-fit-${fit.level}`)} data-testid="raid-fit" data-level={fit.level}>
                <p className="rh-fit-head">{fit.text}</p>
                <ul>
                  {needs.map((n) => (
                    <li key={n.cls} className={fit.missing.some((m) => m.cls === n.cls) ? "miss" : "ok"}>
                      <b>{n.cls}</b> {n.why}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>

      </article>
      <div className="rh-cta" data-testid="raid-cta">
        <button
          type="button"
          className="rh-start"
          data-testid="raid-start"
          data-tier={enc.tier}
          disabled={!canFight}
          onClick={start}
        >
          {!open ? `第 ${UNLOCK_AT[enc.unlock]} 關後開放` : team.length === 0 ? "先召喚人物" : label}
          {canFight ? (
            <small data-testid="raid-cta-fit">
              {enc.enemy.name} · {fit.level === "good" ? "隊伍搭配合適" : `建議補：${fit.missing.map((m) => m.cls).join("、")}`}
            </small>
          ) : null}
        </button>
      </div>
      {picking ? <TeamPicker onClose={() => setPicking(false)} /> : null}
    </section>
  );
}
