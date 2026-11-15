/**
 * 命器共用效果引擎 — one engine for every 三消 mode (主線 50 關, 深宮・無盡晉封塔, and later
 * 鎮厄司 raid / 劇情特殊三消 / future modes). Pure and deterministic; the UI feeds it the waves a
 * PLAYER MOVE produced and applies what it returns.
 *
 * Loop safety (encoded, not just documented):
 *  - Only waves of normal player moves are fed in. Skill strikes and artifact effects never re-enter
 *    it, so a 命器 can never re-trigger itself.
 *  - Special-jade triggers read the detonation effects of a wave (實際引爆), never forging.
 *  - Every score rule has an explicit per-stage trigger count (前 N 次 / 首次).
 *  - Total extra % on one wave is capped team-wide (LIMITS.wavePct); extra points per move are capped.
 *  - Extra charge goes ONLY to the wearer, only from the direct (first) wave of a player move, and is
 *    capped per wearer per stage. Skills, artifact effects and cascades never produce charge.
 *  - 專屬 buffs: one trigger per cast, refreshed (never stacked) by re-casting, expire after
 *    ARMED_WINDOW_MOVES player moves. Nothing here adds moves or 墨玉.
 */
import type { Effect, Wave } from "./match3.ts";
import {
  ARMED_WINDOW_MOVES,
  ARTIFACT_BY_ID,
  exclusiveActive,
  exclusivePct,
  scaled,
  type ArtifactDef,
  type ArtifactRule,
  type ArtifactSave,
  type MoveCond,
  type StageNeed,
  type WaveCond,
} from "./artifacts.ts";

export const ARTIFACT_LIMITS = {
  /** Max extra share of one wave's score from all 命器 together (全隊上限). */
  wavePct: 0.6,
  /** Max extra points from 命器 in one player move. */
  movePoints: 400,
  /** Max extra charge per wearer per stage. */
  energyPerStage: 8,
  /** Max exclusive (專屬) triggers per wearer per stage. */
  exclusivePerStage: 6,
} as const;

/**
 * 命器共鳴 (第 30 關): the wearer's OWN active skill resonates with the equipped 命器's passive. It is not a
 * second active skill and never replaces the original — it only adds to the cast that already happened.
 *  - Trigger: the wearer casts their own skill (needs energy from normal player moves; skills never charge).
 *  - Every 命器: the 通用被動 gets back one spent trigger (前 N 次 → one more), and the skill hit gains a small %.
 *  - 命定之人 wearing their SSR / SS 專屬: the skill hit instead gains the 專屬 % (Lv.10 覺醒 → awakenPct).
 *  - Capped per wearer per battle, with a cooldown in player moves; grants no energy, no moves, no 墨玉.
 */
export const RESONANCE = {
  perBattle: 2,
  /** Player moves that must pass before the same wearer can resonate again. */
  cooldownMoves: 2,
  /** Generic skill-hit bonus at Lv.1 / Lv.10. */
  skillPct: [0.04, 0.08] as const,
  /** Hard cap on the skill-hit bonus share. */
  maxSkillPct: 0.4,
} as const;

export type ResonanceFire = {
  wearerId: string;
  /** 命器 name. */
  artifact: string;
  /** Label: the exclusive skill name for the 命定之人, else the general passive name. */
  name: string;
  exclusive: boolean;
  /** Extra share of the skill's own hit (already capped). */
  skillPct: number;
  /** One general trigger restored. */
  refilled: boolean;
};

export type WaveInfo = {
  /** 0 = the swap's own clear (普通消除), ≥1 = cascade (連消). */
  index: number;
  removed: number;
  lines: number;
  rowLines: number;
  bombs: number;
  colors: number;
  sealHits: number;
  /** ink seals fully removed (1→0) */
  sealsBroken: number;
  /** Points the wave scored after the skill multiplier (what the player actually got). */
  score: number;
};

export function waveInfo(w: Pick<Wave, "removed" | "effects" | "sealHits" | "sealsBroken">, index: number, score: number): WaveInfo {
  const count = (t: Effect["type"]) => w.effects.filter((e) => e.type === t).length;
  return {
    index,
    removed: w.removed.length,
    lines: count("row") + count("col"),
    rowLines: count("row"),
    bombs: count("bomb"),
    colors: count("color"),
    sealHits: w.sealHits.length,
    sealsBroken: w.sealsBroken,
    score: Math.max(0, Math.round(score)),
  };
}

export type ArtifactSlot = { wearerId: string; uid: string; eid: string; level: number };
type SlotState = {
  slot: ArtifactSlot;
  def: ArtifactDef;
  rule: ArtifactRule;
  exclusive: boolean;
  used: number;
  /** armed 專屬: player moves left before it expires */
  armed: { moves: number } | null;
  exclUsed: number;
  energy: number;
  /** 命器共鳴 fired this battle / player moves left on its cooldown. */
  resUsed: number;
  resCool: number;
};
export type ArtifactRun = { mode: string; moves: number; lastCleared: boolean; slots: SlotState[]; resonance: boolean };
/** What the stage offers; missing features switch seal / milestone / goal rules to their fallback. */
export type StageInfo = { mode: string; hasSeal: boolean; hasMilestone: boolean; hasGoal: boolean };

/** Pick the rule that applies on this stage (weaker fallback when the stage lacks what it needs). */
export function stageRule(rule: ArtifactRule, stage: Omit<StageInfo, "mode">): ArtifactRule {
  if (rule.kind === "charge" || !rule.fallback) return rule;
  const has: Record<StageNeed, boolean> = { seal: stage.hasSeal, milestone: stage.hasMilestone, goal: stage.hasGoal };
  return has[rule.fallback.when] ? rule : stageRule(rule.fallback.rule, stage);
}

/** The slots for the characters fighting this stage (main / tower: the one 助陣; raid: up to three). */
export function slotsFor(save: ArtifactSave, wearers: (string | null | undefined)[]): ArtifactSlot[] {
  const out: ArtifactSlot[] = [];
  for (const id of new Set(wearers.filter((x): x is string => !!x))) {
    const inst = save.instances.find((i) => i.equippedBy === id);
    if (inst && ARTIFACT_BY_ID[inst.eid]) out.push({ wearerId: id, uid: inst.uid, eid: inst.eid, level: inst.level });
  }
  return out;
}

/** `resonance` = 命器共鳴 unlocked (第 30 關 cleared). */
export function startArtifactRun(slots: ArtifactSlot[], stage: StageInfo, resonance = false): ArtifactRun {
  return {
    mode: stage.mode,
    moves: 0,
    lastCleared: false,
    resonance,
    slots: slots
      .filter((s) => ARTIFACT_BY_ID[s.eid])
      .map((slot) => {
        const def = ARTIFACT_BY_ID[slot.eid]!;
        return { slot, def, rule: stageRule(def.general.rule, stage), exclusive: exclusiveActive(def, slot.wearerId), used: 0, armed: null, exclUsed: 0, energy: 0, resUsed: 0, resCool: 0 };
      }),
  };
}

export function condMatches(c: WaveCond, w: WaveInfo): boolean {
  switch (c.on) {
    case "big":
      return w.removed >= c.min;
    case "cascade":
      return w.index >= (c.min ?? 1);
    case "normal":
      return w.index === 0 && w.removed > 0;
    case "normalBig":
      return w.index === 0 && w.removed >= c.min;
    case "line":
      return w.lines >= 1;
    case "rowLine":
      return w.rowLines >= 1;
    case "bomb":
      return w.bombs >= 1;
    case "lineOrBomb":
      return w.lines + w.bombs >= 1;
    case "color":
      return w.colors >= 1;
    case "seal":
      return w.sealHits >= 1;
    case "sealBroken":
      return w.sealsBroken >= 1;
  }
}

export type MoveFacts = {
  /** Goals completed before / after this move (before 命器 points, so a 命器 never triggers itself). */
  goals?: { before: number; after: number };
  /** Running score before / after this move (before 命器 points) and the stage's score milestones. */
  score?: { before: number; after: number; milestones: readonly number[] };
};

export function moveCondMatches(c: MoveCond, waves: WaveInfo[], facts: MoveFacts, prevCleared: boolean): boolean {
  switch (c.on) {
    case "chain":
      return waves.length >= c.min;
    case "specialKinds":
      return [waves.some((w) => w.lines > 0), waves.some((w) => w.bombs > 0), waves.some((w) => w.colors > 0)].filter(Boolean).length >= c.min;
    case "bombs":
      return waves.reduce((n, w) => n + w.bombs, 0) >= c.min;
    case "milestone": {
      const s = facts.score;
      return !!s && s.milestones.some((m) => s.before < m && s.after >= m);
    }
    case "goal":
      return !!facts.goals && facts.goals.after > facts.goals.before;
    case "consecutive":
      return prevCleared && waves.some((w) => w.removed > 0);
  }
}

/**
 * The wearer cast their skill. Arms the exclusive layer iff the wearer IS the 命定之人 (character ID)
 * and the skill is their own. Re-casting refreshes the window, never stacks.
 */
export function artifactCast(
  run: ArtifactRun,
  casterId: string,
  skillId: string,
): { run: ArtifactRun; armed: string[]; resonance: ResonanceFire[] } {
  const armed: string[] = [];
  const resonance: ResonanceFire[] = [];
  const slots = run.slots.map((s0) => {
    if (s0.slot.wearerId !== casterId) return s0;
    let s = s0;
    const ex = s.def.exclusive;
    if (ex && s.exclusive && ex.skillId === skillId && s.exclUsed < ARTIFACT_LIMITS.exclusivePerStage) {
      armed.push(ex.name);
      s = { ...s, armed: { moves: ARMED_WINDOW_MOVES } };
    }
    // 命器共鳴: the cast that already happened resonates once (cap + cooldown; cannot loop — casts need energy
    // from normal player moves, and neither skills nor 共鳴 ever produce energy).
    if (run.resonance && s.resUsed < RESONANCE.perBattle && s.resCool <= 0) {
      const own = !!ex && s.exclusive && ex.skillId === skillId;
      const pct = Math.min(RESONANCE.maxSkillPct, own ? exclusivePct(ex!, s.slot.level) : scaled(RESONANCE.skillPct, s.slot.level));
      const refilled = s.used > 0;
      s = { ...s, used: Math.max(0, s.used - 1), resUsed: s.resUsed + 1, resCool: RESONANCE.cooldownMoves };
      resonance.push({ wearerId: casterId, artifact: s.def.name, name: own ? ex!.name : s.def.general.name, exclusive: own, skillPct: pct, refilled });
    }
    return s;
  });
  return { run: { ...run, slots }, armed, resonance };
}

/** Extra skill-hit damage from 命器共鳴 fires (bounded by the cast's own hit). */
export function resonanceDamage(skillDealt: number, fires: ResonanceFire[]): number {
  const pct = Math.min(RESONANCE.maxSkillPct, fires.reduce((n, f) => n + f.skillPct, 0));
  return Math.max(0, Math.round(Math.max(0, skillDealt) * pct));
}

export type MoveOutcome = {
  run: ArtifactRun;
  /** Extra points per wave (same order as the waves fed in; already capped). */
  perWave: number[];
  /** Extra points in total for this move (already capped). */
  bonus: number;
  /** Extra charge per wearer id (wearer only, capped). */
  energy: Record<string, number>;
  /** 墨厄討伐: wearers whose 專屬 asks for one limited shield shred this move (階段 E applies it). */
  shred: string[];
  /** 命器 / skill names that fired (floating text). */
  notes: string[];
};

/** A normal player move finished resolving: work out every 命器 effect for it. */
export function artifactMove(run: ArtifactRun, waves: WaveInfo[], facts: MoveFacts = {}): MoveOutcome {
  const slots = run.slots.map((s) => ({ ...s, armed: s.armed && { ...s.armed } }));
  const pct = waves.map(() => 0);
  const energy: Record<string, number> = {};
  const notes = new Set<string>();
  const shred: string[] = [];
  for (const s of slots) {
    const lv = s.slot.level;
    const r = s.rule;
    // 1) move-level general passive: +pct on every wave of this move
    if (r.kind === "movePct" && s.used < r.uses && moveCondMatches(r.cond, waves, facts, run.lastCleared)) {
      s.used += 1;
      const p = scaled(r.pct, lv);
      for (let i = 0; i < pct.length; i++) pct[i] += p;
      notes.add(s.def.general.name);
    }
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i]!;
      // 2) wave-level general passive / charge
      if (r.kind === "wavePct" && s.used < r.uses && condMatches(r.cond, w)) {
        s.used += 1;
        pct[i] += scaled(r.pct, lv);
        notes.add(s.def.general.name);
      } else if (r.kind === "charge" && w.index === 0 && s.used < r.uses && condMatches(r.cond, w)) {
        s.used += 1;
        const e = Math.min(Math.max(0, ARTIFACT_LIMITS.energyPerStage - s.energy), scaled(r.energy, lv, true));
        if (e > 0) {
          s.energy += e;
          energy[s.slot.wearerId] = (energy[s.slot.wearerId] ?? 0) + e;
          notes.add(s.def.general.name);
        }
      }
      // 3) owner-only exclusive, armed by the owner's own skill: one trigger, then gone
      const ex = s.def.exclusive;
      if (ex && s.exclusive && s.armed && s.exclUsed < ARTIFACT_LIMITS.exclusivePerStage && condMatches(ex.cond, w)) {
        pct[i] += exclusivePct(ex, lv);
        s.armed = null;
        s.exclUsed += 1;
        if (ex.raidShred && run.mode === "raid") shred.push(s.slot.wearerId);
        notes.add(ex.name);
      }
    }
    if (s.resCool > 0) s.resCool -= 1;
    // an armed buff that found nothing this move ticks down and expires (never lingers)
    if (s.armed) {
      s.armed.moves -= 1;
      if (s.armed.moves <= 0) s.armed = null;
    }
  }
  let room = ARTIFACT_LIMITS.movePoints;
  const perWave = waves.map((w, i) => {
    const take = Math.min(Math.round(w.score * Math.min(ARTIFACT_LIMITS.wavePct, pct[i]!)), room);
    room -= take;
    return take;
  });
  return {
    run: { ...run, moves: run.moves + 1, lastCleared: waves.some((w) => w.removed > 0), slots },
    perWave,
    bonus: perWave.reduce((a, b) => a + b, 0),
    energy,
    shred,
    notes: [...notes],
  };
}

/** UI helper: what a wearer gets from an instance (general always; exclusive only for the 命定之人). */
export function effectLayers(eid: string, wearerId: string | null) {
  const def = ARTIFACT_BY_ID[eid];
  if (!def) return null;
  return { general: true, exclusive: exclusiveActive(def, wearerId), hasExclusive: !!def.exclusive };
}
