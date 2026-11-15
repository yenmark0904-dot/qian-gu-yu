import { MAIN_HERO } from "./main-story.ts";

const ART = "/cg/prologue/";
export const PROLOGUE_SCENES: Readonly<Record<string, string>> = {
  "山中神社・深夜": `${ART}shrine.jpg`,
  "時隙・墨線之間": `${ART}rift.jpg`,
  "時隙盡頭": `${ART}rift-end.jpg`,
  "秦宮・深夜": `${ART}palace.jpg`,
};
// Read the emperor's exact name from the story module, not a retyped lookalike.
const EMPEROR = MAIN_HERO.split("・")[1];
type Stage = { background: string; sprite?: string };
export type PrologueBeat = Stage & (
  | { kind: "dialogue"; text: string; speaker: string; thought: boolean }
  | { kind: "narration" | "title"; text: string }
  | { kind: "choice"; choices: { id: string; text: string }[] }
);

/** One non-empty script line per beat; control tags are not displayed as script. */
export function parsePrologue(text: string): PrologueBeat[] {
  const beats: PrologueBeat[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let background = PROLOGUE_SCENES["山中神社・深夜"];
  let previousSpeaker = "";
  let innerThought = false;
  let swordConfrontation = false;
  const dialogue = (speaker: string, value: string) => {
    const thought = innerThought || speaker === "我（心聲）";
    // All mysterious palace dialogue belongs to the sword confrontation once begun.
    if (speaker === "？？？" && background === PROLOGUE_SCENES["秦宮・深夜"] && /何人|臉|朕/.test(value)) swordConfrontation = true;
    const sprite = speaker === "我" || speaker === "我（心聲）" ? `${ART}witch.png`
      : speaker === EMPEROR || (speaker === "？？？" && background === PROLOGUE_SCENES["秦宮・深夜"] && swordConfrontation) ? `${ART}qin.png`
      : undefined;
    beats.push({ kind: "dialogue", speaker: speaker === "我（心聲）" ? "我" : speaker === "月（小聲）" ? "月" : speaker, thought, text: value, background, sprite });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const scene = line.match(/^【場景：(.+)】$/);
    if (scene) {
      background = PROLOGUE_SCENES[scene[1]] ?? background;
      previousSpeaker = "";
      innerThought = false;
      swordConfrontation = false;
      continue;
    }
    if (line === "【玩家選項・序章關鍵互動】") {
      const choices: { id: string; text: string }[] = [];
      while (i + 1 < lines.length) {
        const choice = lines[i + 1].match(/^([ABC])\.\s*(.+)$/);
        if (!choice) break;
        choices.push({ id: choice[1], text: choice[2] });
        i++;
      }
      if (choices.length) beats.push({ kind: "choice", choices, background });
      innerThought = false;
      previousSpeaker = "";
      continue;
    }
    if (line === "【共同劇情】") continue;
    if (line === "【我・內心】") {
      innerThought = true;
      previousSpeaker = "我";
      continue;
    }
    if (line === "【祈願紙】") {
      innerThought = false;
      previousSpeaker = "祈願紙";
      continue;
    }
    if (/^第[一二三四五六七八九十]+[幕章][｜・]/.test(line) || /^《.+》$/.test(line)) {
      beats.push({ kind: "title", text: line, background });
      innerThought = false;
      previousSpeaker = "";
      continue;
    }
    const direction = line.match(/^【(?:演出|畫面|音效)】(.*)$/);
    if (direction) {
      innerThought = false;
      if (direction[1]) beats.push({ kind: "narration", text: direction[1], background });
      continue;
    }
    const spoken = line.match(/^([^：「」]+)：(「.*」)$/);
    if (spoken) {
      innerThought = false;
      previousSpeaker = spoken[1];
      dialogue(previousSpeaker, spoken[2]);
      continue;
    }
    if (/^「.*」$/.test(line) && (previousSpeaker || innerThought)) {
      if (!previousSpeaker) previousSpeaker = "我";
      const resumeThought: boolean = innerThought;
      innerThought = false;
      dialogue(previousSpeaker, line);
      innerThought = resumeThought;
      continue;
    }
    if (innerThought) {
      dialogue(previousSpeaker || "我", line);
      continue;
    }
    beats.push({ kind: "narration", text: line, background });
  }
  return beats;
}
