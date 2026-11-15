/**
 * 召喚揭曉「一筆牽緣，墨門逢君」— presentation data and pure helpers.
 *
 * NOTHING in this file grants, rolls or prices anything. The pull transaction lives in store.ts `pull()`
 * (rates / pity / cost / 緣分 / 墨痕 / tier 墨玉 all settle there, once, and are persisted before any
 * animation starts). This module only:
 *   - holds the editable reveal config (timings, SSR scenes, summon lines, SFX cues),
 *   - plans which card gets a full or fast reveal,
 *   - summarises the already-settled PullCard[] for the result page,
 *   - keeps a presentation-only "last summon" record so an interrupted reveal can be re-watched,
 *   - stores the 自動播放 / 精簡動畫 preferences,
 *   - builds dev-only demo cards (never touching the save).
 *
 * 命器召喚 uses the same 宮門牽緣 presentation (PalaceGate + rarity pacing);
 * only the revealed art, name and copy change to the 命器.
 * Both pools share the owner-provided 宮門牽緣 canvas ink-drop / bloom prelude.
 */
import { BOND_TIER_NAMES, MAX_BOND, bondLevel } from "./bond.ts";
import { copiesToNext, tierUnlocks, type Unlock } from "./bond-feedback.ts";
import { CHARACTERS, RARITY_META, type Character, type Rarity } from "./data.ts";
import type { PullCard } from "./logic.ts";

/* ───────────────────────── editable config ───────────────────────── */

export type RevealStyle = "ink" | "book" | "scroll" | "gate";

/** Per-rarity performance. `targetMs` = ink-drop → character fully revealed (single pull). */
export const REVEAL_RARITY: Record<
  Rarity,
  { style: RevealStyle; title: string; targetMs: number; fastMs: number; colour: string; caption: string }
> = {
  R: { style: "ink", title: "墨中初逢", targetMs: 1800, fastMs: 650, colour: "#b8ad9d", caption: "R" },
  S: { style: "book", title: "書頁相遇", targetMs: 2800, fastMs: 750, colour: "#f1e8da", caption: "S" },
  SS: { style: "scroll", title: "畫卷映君", targetMs: 4600, fastMs: 900, colour: "#d0604c", caption: "SS" },
  SSR: { style: "gate", title: "天命赴約", targetMs: 7200, fastMs: 1100, colour: "#e58c76", caption: "SSR・天命" },
};

/** Shared opening: ink drop + prompt. */
export const OPENING = {
  prompt: "輕觸墨痕，牽起此緣",
  dropMs: 900,
  /** 精簡動畫: one short fade, then the card. */
  liteMs: 420,
};

/**
 * Beat timeline (ms from the ink drop) for each full performance. Components read these so the
 * pacing lives in one place. `revealAt` = portrait fully visible; `captionAt` = name / dynasty / rarity.
 */
export const BEATS = {
  R: { drop: 0, bloom: 350, card: 700, revealAt: 1500, captionAt: 1650 },
  S: { drop: 0, book: 400, turn1: 900, turn2: 1250, flow: 1200, card: 1800, revealAt: 2550, captionAt: 2700 },
  SS: { drop: 0, rods: 350, unfurl: 700, line: 1500, card: 3100, revealAt: 4100, captionAt: 4400 },
  SSR: { drop: 0, lines: 450, gate: 1700, seam: 2100, open: 2900, scene: 3200, line: 3700, fog: 5400, revealAt: 6500, captionAt: 6900 },
} as const;

/** 十連 omen by the pull's highest rarity (hints the rarity, never the character). */
export const OMEN: Record<Rarity, { style: RevealStyle; label: string; ms: number }> = {
  R: { style: "ink", label: "墨紋泛開", ms: 1300 },
  S: { style: "book", label: "墨紋化作書頁", ms: 1700 },
  SS: { style: "scroll", label: "畫卷輪廓展開", ms: 2100 },
  SSR: { style: "gate", label: "宮門縫中透光", ms: 2600 },
};

export type SsrScene = "palace" | "river" | "snowgate" | "moon" | "dawngate";

/**
 * SSR 天命赴約 — owner-provided summon lines (verbatim) and the exclusive scene, keyed by character ID.
 * Lines here are summon-only and have NO voice: they are shown as text (the existing 情話 VO is a
 * different sentence and is never paired with them).
 */
export const SSR_SUMMON: Record<string, { scene: SsrScene; sceneNote: string; line: string; sfx: SsrScene }> = {
  qin: {
    scene: "palace",
    sceneNote: "暗色宮闕中，一盞燈亮起，金色墨線沿殿門展開",
    line: "既已來到朕面前，便再走近些。",
    sfx: "palace",
  },
  zhouyu: {
    scene: "river",
    sceneNote: "江面泛起漣漪，琴弦輕響，水霧向兩側退開",
    line: "方才那一曲，你可聽見了？",
    sfx: "river",
  },
  lanling: {
    scene: "snowgate",
    sceneNote: "風雪掠過城門，面具剪影短暫浮現，雪勢漸緩",
    line: "別怕。到我身後來。",
    sfx: "snowgate",
  },
  libai: {
    scene: "moon",
    sceneNote: "水中月影暈開，桃花掠過，墨門映出山月",
    line: "來得正好，這輪月亮，分你一半。",
    sfx: "moon",
  },
  liuche: {
    scene: "dawngate",
    sceneNote: "朱色宮門透出晨光，旌旗剪影掠過，暖金光照亮人物",
    line: "你既來了，便陪朕看看這萬里山河。",
    sfx: "dawngate",
  },
};

/**
 * SS 畫卷映君 short lines. By default an SS reuses its existing 情話・其一 (`Character.line`), which is
 * also exactly what its existing Japanese VO says — so the VO matches the subtitle. Put an override
 * here to show a different line; an override is NEVER voiced (no VO exists for new text).
 */
export const SS_LINE_OVERRIDES: Record<string, string> = {};

/** Generic SSR scene for a future SSR that has no entry in SSR_SUMMON yet (no line → name + epithet). */
export const SSR_FALLBACK_SCENE: SsrScene = "palace";

export type ReveaLine = { text: string; voiced: boolean };

/** The line a full SS / SSR performance shows before the portrait (null = none). */
export function revealLine(c: Pick<Character, "id" | "rarity" | "line" | "epithet" | "name">): ReveaLine | null {
  if (c.rarity === "SSR") {
    const s = SSR_SUMMON[c.id];
    return s ? { text: s.line, voiced: false } : { text: `${c.epithet}，${c.name}`, voiced: false };
  }
  if (c.rarity === "SS") {
    const o = SS_LINE_OVERRIDES[c.id];
    if (o) return { text: o, voiced: false };
    if (c.line?.trim()) return { text: c.line.trim(), voiced: true };
    return { text: `${c.epithet}，${c.name}`, voiced: false };
  }
  return null;
}

export function ssrScene(id: string): SsrScene {
  return SSR_SUMMON[id]?.scene ?? SSR_FALLBACK_SCENE;
}

export function captionOf(c: Pick<Character, "rarity">): string {
  return REVEAL_RARITY[c.rarity].caption;
}

/** Portrait URL (always the base card art: locked 定情 / CG are never used by the reveal). */
/** Only the four newly isolated SSR portraits use alpha-capable PNGs. */
const CUTOUT_PORTRAITS = new Set(["libai", "liuche", "zhouyu", "lanling"]);
// Collection, summon, roster and character cards retain the original background.
export const portraitSrc = (id: string) => `/portraits/${id}.jpg?v=17`;

// Only story standups use the approved transparent portraits.
export const storyPortraitSrc = (id: string) =>
  CUTOUT_PORTRAITS.has(id) ? `/sprites/${id}.png?v=20` : `/portraits/${id}.jpg?v=17`;

/* ───────────────────────── planning ───────────────────────── */

const RANKS: Record<Rarity, number> = { R: 0, S: 1, SS: 2, SSR: 3 };

export function highestRarity(cards: { character: { rarity: Rarity } }[]): Rarity {
  let best: Rarity = "R";
  for (const c of cards) if (RANKS[c.character.rarity] > RANKS[best]) best = c.character.rarity;
  return best;
}

export type RevealMode = "full" | "fast";

/**
 * Single pull: every rarity plays its full performance.
 * 十連: SSR full; SS full only on 初逢 (isNew — judged sequentially by store.pull, so a second copy of the
 * same SS inside one 十連 is already 重逢); R / S fast.
 */
export function revealMode(card: Pick<PullCard, "isNew" | "character">, ten: boolean): RevealMode {
  if (!ten) return "full";
  const r = card.character.rarity;
  if (r === "SSR") return "full";
  if (r === "SS" && card.isNew) return "full";
  return "fast";
}

/* ───────────────────────── settlement view ───────────────────────── */

export type CardKind = "new" | "dupe" | "rankup" | "max";

export type CardSettlement = {
  kind: CardKind;
  /** 墨痕 actually credited for this copy (from store.pull). */
  marks: number;
  /** tier-up 墨玉 actually credited for this copy (from store.pull; auto-paid by the existing economy). */
  tierInk: number;
  count: number;
  prevLevel: number;
  level: number;
  prevName: string;
  levelName: string;
  /** Copies still needed for the next rank (0 at max). */
  toNext: number;
  nextName: string | null;
  unlocks: Unlock[];
};

/** Read-only description of one already-settled copy. Never computes a reward: marks / tierInk are copied. */
export function settlementOf(card: PullCard): CardSettlement {
  const count = Math.max(1, card.count);
  const level = card.bond ?? bondLevel(count);
  const prevLevel = card.isNew ? 0 : bondLevel(count - 1);
  const kind: CardKind = card.isNew ? "new" : card.overflow ? "max" : card.bondUp ? "rankup" : "dupe";
  const toNext = level >= MAX_BOND ? 0 : copiesToNext(count);
  const unlocks: Unlock[] = [];
  if (card.bondUp) for (let t = prevLevel + 1; t <= level; t++) unlocks.push(...tierUnlocks(card.character.rarity, t));
  return {
    kind,
    marks: card.marks ?? 0,
    tierInk: card.tierInk ?? 0,
    count,
    prevLevel,
    level,
    prevName: BOND_TIER_NAMES[prevLevel]!,
    levelName: BOND_TIER_NAMES[level]!,
    toNext,
    nextName: level >= MAX_BOND ? null : BOND_TIER_NAMES[level + 1]!,
    unlocks,
  };
}

export type PullSummary = {
  marks: number;
  tierInk: number;
  firsts: number;
  rankUps: { id: string; name: string; from: string; to: string }[];
  maxed: number;
};

/** Totals for the result page: plain sums of what store.pull already credited. */
export function summarise(cards: PullCard[]): PullSummary {
  const out: PullSummary = { marks: 0, tierInk: 0, firsts: 0, rankUps: [], maxed: 0 };
  for (const card of cards) {
    const s = settlementOf(card);
    out.marks += s.marks;
    out.tierInk += s.tierInk;
    if (s.kind === "new") out.firsts++;
    if (s.kind === "max") out.maxed++;
    if (s.kind === "rankup") out.rankUps.push({ id: card.character.id, name: card.character.name, from: s.prevName, to: s.levelName });
  }
  return out;
}

/* ───────────────────────── last-summon record (presentation only) ───────────────────────── */

export const LAST_SUMMON_KEY = "qgy-last-summon-v1";

type StoredCard = Omit<PullCard, "character"> & { id: string };
export type LastSummon = { at: number; n: 1 | 10; watched: boolean; cards: StoredCard[] };

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Remember an already-settled pull so it can be viewed again after a refresh / interruption. Not a grant. */
export function recordLastSummon(cards: PullCard[], n: 1 | 10, now = Date.now()): boolean {
  const s = storage();
  if (!s) return false;
  const rec: LastSummon = {
    at: now,
    n,
    watched: false,
    cards: cards.map(({ character, ...rest }) => ({ ...rest, id: character.id })),
  };
  try {
    s.setItem(LAST_SUMMON_KEY, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

export function markSummonWatched() {
  const s = storage();
  const rec = readLastSummonRaw();
  if (!s || !rec || rec.watched) return;
  try {
    s.setItem(LAST_SUMMON_KEY, JSON.stringify({ ...rec, watched: true }));
  } catch {
    /* ignore */
  }
}

function readLastSummonRaw(): LastSummon | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(LAST_SUMMON_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as LastSummon;
    if (!rec || !Array.isArray(rec.cards) || rec.cards.length === 0) return null;
    return rec;
  } catch {
    return null;
  }
}

/** Rebuild PullCard[] from the record (unknown ids are dropped, never substituted). */
export function readLastSummon(): { n: 1 | 10; watched: boolean; at: number; cards: PullCard[] } | null {
  const rec = readLastSummonRaw();
  if (!rec) return null;
  const cards: PullCard[] = [];
  for (const { id, ...rest } of rec.cards) {
    const character = CHARACTERS.find((c) => c.id === id);
    if (character) cards.push({ ...rest, character });
  }
  if (cards.length === 0) return null;
  return { n: rec.n === 10 ? 10 : 1, watched: !!rec.watched, at: rec.at, cards };
}

/* ───────────────────────── preferences ───────────────────────── */

export const PREFS_KEY = "qgy-summon-prefs-v1";
export type SummonPrefs = { autoPlay: boolean; lite: boolean; tenMode: "each" | "all" };
export const DEFAULT_PREFS: SummonPrefs = { autoPlay: false, lite: false, tenMode: "each" };

export function readPrefs(): SummonPrefs {
  const s = storage();
  try {
    const raw = s?.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<SummonPrefs>;
    return {
      autoPlay: typeof p.autoPlay === "boolean" ? p.autoPlay : DEFAULT_PREFS.autoPlay,
      lite: typeof p.lite === "boolean" ? p.lite : DEFAULT_PREFS.lite,
      tenMode: p.tenMode === "all" ? "all" : "each",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(p: SummonPrefs) {
  try {
    storage()?.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/* ───────────────────────── dev demo (never touches the save) ───────────────────────── */

/** Hosts where ?summonDemo is ignored (the live game). */
export const DEMO_BLOCKED_HOSTS = ["qian-gu-yu.vercel.app"];

export function demoAllowed(host: string): boolean {
  return !DEMO_BLOCKED_HOSTS.includes(host);
}

const byId = (id: string) => CHARACTERS.find((c) => c.id === id);
const firstOf = (r: Rarity) => CHARACTERS.find((c) => c.rarity === r)!;

/** Fake, already-"settled" cards for previewing — computed from the same bond rules, saved nowhere. */
export function demoCard(character: Character, prevCopies: number): PullCard {
  const count = prevCopies + 1;
  const prevLevel = prevCopies > 0 ? bondLevel(prevCopies) : 0;
  const level = bondLevel(count);
  const overflow = prevCopies - 1 >= MAX_BOND * 5;
  const trickle: Record<Rarity, number> = { R: 1, S: 2, SS: 5, SSR: 10 };
  const full: Record<Rarity, number> = { R: 10, S: 30, SS: 80, SSR: 200 };
  return {
    character,
    isNew: prevCopies === 0,
    count,
    refund: 0,
    bond: level,
    bondUp: prevCopies > 0 && level > prevLevel,
    marks: prevCopies === 0 ? 0 : overflow ? full[character.rarity] : trickle[character.rarity],
    tierInk: prevCopies > 0 && level > prevLevel ? (level - prevLevel) * 500 : 0,
    overflow: prevCopies > 0 && overflow,
  };
}

/**
 * ?summonDemo=R|S|SS|SSR[&char=<id>][&state=new|dupe|rankup|max]  → single pull demo
 * ?summonDemo=ten[&top=S|SS|SSR]                                   → 十連 demo
 */
export function demoCards(params: URLSearchParams): { n: 1 | 10; cards: PullCard[] } | null {
  const kind = params.get("summonDemo");
  if (!kind) return null;
  const state = params.get("state") ?? "new";
  const prevFor = (s: string) => (s === "dupe" ? 2 : s === "rankup" ? 5 : s === "max" ? 31 : 0);
  if (kind === "R" || kind === "S" || kind === "SS" || kind === "SSR") {
    const pick = params.get("char");
    const c = (pick && byId(pick)?.rarity === kind ? byId(pick) : undefined) ?? firstOf(kind);
    return { n: 1, cards: [demoCard(c, prevFor(state))] };
  }
  if (kind === "ten") {
    const top = (params.get("top") ?? "SSR") as Rarity;
    const R = CHARACTERS.filter((c) => c.rarity === "R");
    const S = CHARACTERS.filter((c) => c.rarity === "S");
    const SS = CHARACTERS.filter((c) => c.rarity === "SS");
    const list: PullCard[] = [
      demoCard(R[0]!, 0),
      demoCard(S[0]!, 3),
      demoCard(R[1]!, 5), // rank-up
      demoCard(R[0]!, 1), // same character again inside the pull → 重逢
      demoCard(R[2]!, 31), // 緣分已圓滿
      demoCard(S[1]!, 0),
      demoCard(R[3]!, 2),
      demoCard(R[4]!, 0),
      demoCard(R[5]!, 1),
      demoCard(S[2]!, 1),
    ];
    if (top === "SS" || top === "SSR") {
      list[5] = demoCard(SS[0]!, 0); // 初逢 SS → full
      list[8] = demoCard(SS[1]!, 4); // 重逢 SS → fast
    }
    if (top === "SSR") {
      list[6] = demoCard(byId("libai")!, 0);
      list[7] = demoCard(byId("qin")!, 0); // two SSR in one 十連
    }
    return { n: 10, cards: list };
  }
  return null;
}

export const rarityEpithet = (r: Rarity) => RARITY_META[r].epithet;
