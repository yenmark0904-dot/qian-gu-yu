import { MAIN_HERO } from "./main-story.ts";

const ART = "/cg/prologue/";
const EMPEROR = MAIN_HERO.split("・")[1];

export function qinSceneBackground(name: string): string {
  if (/神社|青川|現世/.test(name)) return `${ART}shrine.jpg`;
  if (/時隙/.test(name)) return `${ART}rift.jpg`;
  return `${ART}palace.jpg`;
}

export type QinChoiceId = "A" | "B" | "C";

type Stage = { background: string; sprite?: string; sfx?: string; fx?: string };

export type QinBeat = Stage & (
  | { kind: "dialogue"; text: string; speaker: string; thought: boolean }
  | { kind: "narration" | "title"; text: string }
  | { kind: "choice"; choices: { id: QinChoiceId; text: string }[]; next: Record<QinChoiceId, number> }
  | { kind: "goto"; to: number }
);

const SCENE = /^【場景[一二三四五六七八九十]?｜(.+)】$/;
const SFX = /^【音效】(.*)$/;
const FX = /^【演出】(.*)$/;
const SHOT = /^【畫面】(.*)$/;
const OPTION = /^【玩家選項/;
const BRANCH = /^【分支 ([ABC])/;
const BRANCH_END = /^【分支結束/;
const JOIN = /^【共同劇情】$/;
const VOL_END = /^【卷[一二三四五六七八九十]+・結束】$/;
const ASIDE = /^【旁白/;
const INNER = /^【我・內心】$/;
/** `名：「…」` — chapter 3 also has verbatim lines like `「…」他挑眉。`, so trailing narration is allowed. */
const SPOKEN = /^([^：「」]+)：(「.*)$/;
const QUOTE = /^「.*」$/;
const CHOICE_LINE = /^([ABC])\.\s*(.+)$/;

function normalizeSpeaker(raw: string): { speaker: string; thought: boolean } {
  if (raw === "我（心聲）") return { speaker: "我", thought: true };
  const name = raw.replace(/（[^）]*）/g, "").trim();
  // 唐朝篇「月影之聲」is 墨厄 speaking through the moon reflection, not the guide 月.
  if (raw.startsWith("月") && !raw.startsWith("月影")) return { speaker: "月", thought: false };
  if (raw.startsWith("嬴政") || raw.startsWith("秦始皇") || raw === EMPEROR) return { speaker: EMPEROR, thought: false };
  if (raw.startsWith("？？？")) return { speaker: "？？？", thought: false };
  if (raw.startsWith("我")) return { speaker: "我", thought: raw.includes("心聲") };
  return { speaker: name || raw, thought: false };
}

function spriteFor(speaker: string): string | undefined {
  if (speaker === "我") return `${ART}witch.png`;
  if (speaker === EMPEROR) return `${ART}qin.png`;
  return undefined;
}

/** Per-chapter stage: Qin defaults; other chapters swap backgrounds and sprites. */
export type VnStage = {
  initialScene: string;
  /** Chapter 4 explicitly presents the chosen option once before its branch. */
  presentChosenOption?: boolean;
  background: (scene: string) => string;
  sprite: (speaker: string) => string | undefined;
};

const QIN_STAGE: VnStage = { initialScene: "秦宮・深夜", background: qinSceneBackground, sprite: spriteFor };

function optionCovered(optionText: string, branchText: string): boolean {
  const core = optionText.replace(/^[ABC]\.\s*/, "").trim();
  const quoted = core.match(/^「([^「」]*)」$/);
  if (quoted) return branchText.includes(quoted[1]) || branchText.includes(core);
  if (core.includes("吻") && branchText.includes("吻")) return true;
  if ((core.includes("抱") || core.includes("擁抱")) && branchText.includes("抱")) return true;
  return branchText.includes(core.replace(/[「」]/g, ""));
}

function optionBeat(optionText: string, background: string, stage: VnStage): QinBeat {
  const core = optionText.replace(/^[ABC]\.\s*/, "").trim();
  if (/^「.*」$/.test(core)) {
    return { kind: "dialogue", text: core, speaker: "我", thought: false, background, sprite: stage.sprite("我") };
  }
  return { kind: "narration", text: core, background };
}

/** Follow goto markers so callers never land on a hidden jump. */
export function resolveQinIndex(beats: readonly QinBeat[], index: number): number {
  const seen = new Set<number>();
  let current = index;
  while (current >= 0 && current < beats.length) {
    const beat = beats[current];
    if (beat.kind !== "goto") break;
    if (seen.has(current)) break;
    seen.add(current);
    current = beat.to;
  }
  return current;
}

export function nextQinIndex(beats: readonly QinBeat[], index: number): number {
  return resolveQinIndex(beats, index + 1);
}

export function qinChoiceIndex(beats: readonly QinBeat[], index: number, id: QinChoiceId): number | null {
  const beat = beats[index];
  if (!beat || beat.kind !== "choice") return null;
  const target = beat.next[id];
  if (target === undefined) return null;
  return resolveQinIndex(beats, target);
}

/** Visible beats for a single chosen path, used by tests and replay. */
export function walkQin(beats: readonly QinBeat[], pick?: QinChoiceId): QinBeat[] {
  const seen = new Set<number>();
  const out: QinBeat[] = [];
  let i = resolveQinIndex(beats, 0);
  while (i < beats.length && !seen.has(i)) {
    seen.add(i);
    const beat = beats[i];
    if (beat.kind === "goto") {
      i = resolveQinIndex(beats, beat.to);
      continue;
    }
    if (beat.kind === "choice") {
      out.push(beat);
      if (!pick) break;
      const next = qinChoiceIndex(beats, i, pick);
      if (next === null) break;
      i = next;
      continue;
    }
    out.push(beat);
    i = nextQinIndex(beats, i);
  }
  return out;
}

export function parseQinVolume(text: string, stage: VnStage = QIN_STAGE): QinBeat[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let at = 0;
  while (at < lines.length && !lines[at].startsWith("【")) at += 1;

  const beats: QinBeat[] = [];
  let background = stage.background(stage.initialScene);
  let previousSpeaker = "";
  let innerThought = false;
  let pendingSfx: string | undefined;
  let pendingFx: string | undefined;

  const decorate = <T extends QinBeat>(beat: T): T => {
    if (pendingSfx) { beat.sfx = pendingSfx; pendingSfx = undefined; }
    if (pendingFx) { beat.fx = pendingFx; pendingFx = undefined; }
    return beat;
  };

  const pushDialogue = (rawSpeaker: string, value: string, thoughtOverride?: boolean) => {
    const { speaker, thought } = normalizeSpeaker(rawSpeaker);
    const next: QinBeat = decorate({
      kind: "dialogue",
      text: value,
      speaker,
      thought: thoughtOverride ?? thought,
      background,
      sprite: stage.sprite(speaker),
    });
    beats.push(next);
  };

  const pushNarration = (value: string) => {
    beats.push(decorate({ kind: "narration", text: value, background }));
  };

  const applyContent = (line: string): boolean => {
    const scene = line.match(SCENE);
    if (scene) {
      background = stage.background(scene[1]);
      previousSpeaker = "";
      innerThought = false;
      return true;
    }
    const sfx = line.match(SFX);
    if (sfx) { pendingSfx = sfx[1].trim() || "sfx"; previousSpeaker = ""; innerThought = false; return true; }
    const fx = line.match(FX);
    if (fx) { pendingFx = fx[1].trim() || "fx"; previousSpeaker = ""; innerThought = false; return true; }
    const shot = line.match(SHOT);
    if (shot) { pendingFx = shot[1].trim() || pendingFx; previousSpeaker = ""; innerThought = false; return true; }
    if (ASIDE.test(line)) {
      previousSpeaker = "我";
      innerThought = false;
      return true;
    }
    if (INNER.test(line) || line === "【祈願紙】") {
      innerThought = line !== "【祈願紙】";
      previousSpeaker = line === "【祈願紙】" ? "祈願紙" : "我";
      return true;
    }
    if (VOL_END.test(line) || JOIN.test(line) || OPTION.test(line) || BRANCH.test(line) || BRANCH_END.test(line)) {
      return false;
    }
    if (/^【系統/.test(line) || /^【流程/.test(line)) return true;
    const spoken = line.match(SPOKEN);
    if (spoken) {
      innerThought = false;
      previousSpeaker = spoken[1];
      pushDialogue(previousSpeaker, spoken[2]);
      return true;
    }
    if (QUOTE.test(line) && previousSpeaker) {
      pushDialogue(previousSpeaker, line, innerThought);
      return true;
    }
    if (innerThought && previousSpeaker) {
      pushDialogue(previousSpeaker, line, true);
      return true;
    }
    pushNarration(line);
    return true;
  };

  const collectUntil = (stop: (line: string) => boolean): string[] => {
    const collected: string[] = [];
    while (at < lines.length && !stop(lines[at])) {
      collected.push(lines[at]);
      at += 1;
    }
    return collected;
  };

  const parseBlock = (block: string[]) => {
    const savedAt = at;
    const savedLines = lines;
    // Re-run applyContent over an isolated list by temporarily walking a copy.
    void savedAt;
    void savedLines;
    for (const line of block) applyContent(line);
  };

  while (at < lines.length) {
    const line = lines[at];
    if (VOL_END.test(line)) break;
    if (JOIN.test(line)) { at += 1; continue; }
    if (OPTION.test(line)) {
      at += 1;
      const choices: { id: QinChoiceId; text: string }[] = [];
      while (at < lines.length) {
        const choice = lines[at].match(CHOICE_LINE);
        if (!choice) break;
        choices.push({ id: choice[1] as QinChoiceId, text: choice[2] });
        at += 1;
      }
      const branches: Record<QinChoiceId, string[]> = { A: [], B: [], C: [] };
      for (const id of ["A", "B", "C"] as QinChoiceId[]) {
        while (at < lines.length && !BRANCH.test(lines[at]) && !JOIN.test(lines[at]) && !VOL_END.test(lines[at])) at += 1;
        if (at < lines.length && BRANCH.test(lines[at])) {
          const which = lines[at].match(BRANCH)?.[1] as QinChoiceId;
          at += 1;
          const block = collectUntil((item) => BRANCH_END.test(item) || JOIN.test(item) || VOL_END.test(item) || (BRANCH.test(item) && !BRANCH_END.test(item)));
          if (at < lines.length && BRANCH_END.test(lines[at])) at += 1;
          branches[which ?? id] = block;
        }
      }
      while (at < lines.length && !JOIN.test(lines[at]) && !VOL_END.test(lines[at])) at += 1;
      if (at < lines.length && JOIN.test(lines[at])) at += 1;

      const choiceIndex = beats.length;
      beats.push({
        kind: "choice",
        choices,
        next: { A: 0, B: 0, C: 0 },
        background,
      });
      const starts: Record<QinChoiceId, number> = { A: 0, B: 0, C: 0 };
      const gotos: number[] = [];
      for (const id of ["A", "B", "C"] as QinChoiceId[]) {
        starts[id] = beats.length;
        const option = choices.find((item) => item.id === id)?.text ?? "";
        const block = branches[id] ?? [];
        if (option && (stage.presentChosenOption || !optionCovered(option, block.join("\n")))) {
          beats.push(optionBeat(option, background, stage));
        }
        parseBlock(block);
        gotos.push(beats.length);
        beats.push({ kind: "goto", to: 0, background });
      }
      const joinStart = beats.length;
      for (const gotoIndex of gotos) {
        const marker = beats[gotoIndex];
        if (marker.kind === "goto") marker.to = joinStart;
      }
      const choiceBeat = beats[choiceIndex];
      if (choiceBeat.kind === "choice") choiceBeat.next = starts;
      continue;
    }
    if (!applyContent(line)) { at += 1; continue; }
    at += 1;
  }
  return beats;
}


export type QinStoryPlay = {
  volume: number;
  beat: number;
  done: boolean;
  positions: Partial<Record<string, number>>;
  finished: Partial<Record<string, boolean>>;
  choices: Partial<Record<string, QinChoiceId>>;
};

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function cleanVolumeMap<T>(raw: unknown, keep: (value: unknown) => T | null): Partial<Record<string, T>> {
  const out: Partial<Record<string, T>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(?:[1-9]|10)$/.test(key)) continue;
    const next = keep(value);
    if (next !== null) out[key] = next;
  }
  return out;
}

/** Drop junk so a cloud or older local save cannot invent a chapter cursor. */
export function cleanMainStoryQinPlay(raw: unknown): QinStoryPlay | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const volume = clampInt(row.volume, 1, 10);
  const beat = clampInt(row.beat, 0, 20_000);
  if (volume === null || beat === null) return null;
  const positions = cleanVolumeMap(row.positions, (value) => clampInt(value, 0, 20_000));
  if (positions[String(volume)] === undefined) positions[String(volume)] = beat;
  return {
    volume,
    beat,
    done: row.done === true,
    positions,
    finished: cleanVolumeMap(row.finished, (value) => (value === true ? true : null)),
    choices: cleanVolumeMap(row.choices, (value) => (value === "A" || value === "B" || value === "C" ? value : null)),
  };
}

export function qinResumeIndex(volume: number, beats: readonly QinBeat[], play: QinStoryPlay | null): number {
  if (!play) return 0;
  const key = String(volume);
  if (play.finished[key]) return 0;
  const saved = play.positions[key] ?? (play.volume === volume ? play.beat : undefined);
  if (saved === undefined) return 0;
  return resolveQinIndex(beats, saved);
}
