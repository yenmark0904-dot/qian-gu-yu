import { cleanSummon } from "./artifact-summon.ts";
import type { ArtifactSummonState } from "./artifact-summon-state.ts";
import { cleanRaid, type RaidSave } from "./raid.ts";
import { cleanStoryEvents, type StoryEventSave } from "./story-events.ts";
import { cleanArtifacts, type ArtifactSave } from "./artifacts.ts";
import { resolveCompanion } from "./companion.ts";
import { cleanLetters, type LetterSave } from "./letters.ts";
/**
 * 雲端存檔 (Google 帳號綁定) — pure rules shared by the browser, the /api/cloud route and the node tests.
 *
 * A snapshot is the whole local save minus device-only prefs (sound), plus the 深宮 leaderboard device id
 * so the leaderboard record follows the account to a new phone. The server never trusts a snapshot: it is
 * size-capped, every field is clamped to its legal range, unknown ids are dropped, and one-time reward
 * ledgers (卷滿, 深宮 晉封, 緣分升階) go through the same cleaners the local save uses — so restoring or
 * uploading can never mint 墨玉 beyond what normal play allows.
 */
import { BY_ID } from "./data.ts";
import { MAX_BOND, MAX_DUPES } from "./bond.ts";
import { cleanVolumeAwards } from "./levels.ts";
import {
  cleanMainStoryHanRead,
  cleanMainStoryPrologueRead,
  cleanMainStoryQiRead,
  cleanMainStoryRead,
  cleanMainStoryTangRead,
  cleanMainStoryWuRead,
} from "./main-story.ts";
import { cleanMainStoryQinPlay, type QinStoryPlay } from "./qin-vn.ts";
import { COSMETIC_BY_ID, DEFAULT_BACKDROP, DEFAULT_FRAME } from "./shop.ts";
import { cleanNickname, cleanRanksPaid, validDeviceId } from "./shengong.ts";

export const CLOUD_MAX_BYTES = 64 * 1024;
export const INK_CAP = 5_000_000;
export const MARKS_CAP = 5_000_000;
const SKIN_IDS = new Set(["base", "gilt", "ink", "vow"]);

export type Snapshot = {
  /** 劇情三消 event records. */
  storyEvents: StoryEventSave;
  /** 動畫教學指引 version seen. */
  coachSeen: number;
  /** V2.0 命器 inventory / equip / materials / one-time grants. */
  artifacts: ArtifactSave;
  artifactSummon: ArtifactSummonState;
  raid: RaidSave;
  companionId: string | null;
  companionGuideDone: boolean;
  letters: LetterSave;
  lettersVersion: number;
  storyLast: Record<string, number>;
  ink: number;
  pity: number;
  owned: Record<string, number>;
  totalPulls: number;
  lastDaily: string | null;
  history: string[];
  m3: Record<string, { stars: number; best: number }>;
  volumeAwards: number[];
  /** 三消主線已讀卷 ids. */
  mainStoryRead: number[];
  /** 主線序章已讀. */
  mainStoryPrologueRead: boolean;
  /** 西漢篇已讀卷 ids. */
  mainStoryHanRead: number[];
  /** 三國篇已讀卷 ids. */
  mainStoryWuRead: number[];
  /** 北齊篇已讀卷 ids. */
  mainStoryQiRead: number[];
  /** 唐朝篇已讀卷 ids. */
  mainStoryTangRead: number[];
  /** 秦朝篇逐句演出進度與已做選擇. */
  mainStoryQinPlay: QinStoryPlay | null;
  /** 三國篇逐句演出進度與已做選擇. */
  mainStoryWuPlay: QinStoryPlay | null;
  mainStoryQiPlay: QinStoryPlay | null;
  /** 唐朝篇逐句演出進度與已做選擇. */
  mainStoryTangPlay: QinStoryPlay | null;
  m3Best: number;
  marks: number;
  cosmetics: string[];
  frame: string;
  backdrop: string;
  skins: Record<string, string>;
  assist: string | null;
  tierInkPaid: Record<string, number>;
  sgBest: number;
  sgTotal: number;
  sgRanksPaid: number[];
  sgNick: string | null;
  /** Player avatar: owned character id, or null for the default 遇 seal. */
  avatarId: string | null;
  /** 深宮 leaderboard device id (links the leaderboard record to the account). */
  deviceId: string | null;
};

export const SNAPSHOT_KEYS: (keyof Snapshot)[] = [
  "storyEvents",
  "coachSeen",
  "artifacts",
  "artifactSummon",
  "raid",
  "companionId",
  "companionGuideDone",
  "letters",
  "lettersVersion",
  "storyLast",
  "ink",
  "pity",
  "owned",
  "totalPulls",
  "lastDaily",
  "history",
  "m3",
  "volumeAwards",
  "mainStoryRead",
  "mainStoryPrologueRead",
  "mainStoryHanRead",
  "mainStoryWuRead",
  "mainStoryQiRead",
  "mainStoryTangRead",
  "mainStoryQinPlay",
  "mainStoryWuPlay",
  "mainStoryQiPlay",
  "mainStoryTangPlay",
  "m3Best",
  "marks",
  "cosmetics",
  "frame",
  "backdrop",
  "skins",
  "assist",
  "tierInkPaid",
  "sgBest",
  "sgTotal",
  "sgRanksPaid",
  "sgNick",
  "avatarId",
  "deviceId",
];

const int = (v: unknown, min: number, max: number, dflt = min) => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : dflt;
  return Math.min(max, Math.max(min, n));
};
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const known = (id: unknown): id is string =>
  typeof id === "string" && Object.prototype.hasOwnProperty.call(BY_ID, id);

export type SanitizeResult =
  { ok: true; data: Snapshot } | { ok: false; error: "too_large" | "bad_shape" };

/** Clamp an untrusted snapshot into a legal one (server and client both run this). */
export function sanitizeSnapshot(raw: unknown): SanitizeResult {
  let size = 0;
  try {
    size = new TextEncoder().encode(JSON.stringify(raw) ?? "").length;
  } catch {
    return { ok: false, error: "bad_shape" };
  }
  if (size > CLOUD_MAX_BYTES) return { ok: false, error: "too_large" };
  if (!isObj(raw)) return { ok: false, error: "bad_shape" };
  const r = raw;

  const owned: Record<string, number> = {};
  if (isObj(r.owned))
    for (const [id, n] of Object.entries(r.owned))
      if (known(id)) {
        const c = int(n, 0, MAX_DUPES + 1, 0);
        if (c > 0) owned[id] = c;
      }
  const m3: Snapshot["m3"] = {};
  if (isObj(r.m3))
    for (const [id, rec] of Object.entries(r.m3)) {
      if (!/^\d{1,4}$/.test(id) || !isObj(rec)) continue;
      m3[id] = { stars: int(rec.stars, 0, 3, 0), best: int(rec.best, 0, 10_000_000, 0) };
    }
  const cosmetics = Array.isArray(r.cosmetics)
    ? [
        ...new Set(
          r.cosmetics.filter(
            (c): c is string =>
              typeof c === "string" && Object.prototype.hasOwnProperty.call(COSMETIC_BY_ID, c),
          ),
        ),
      ]
    : [];
  const pick = (v: unknown) =>
    typeof v === "string" &&
    v.length <= 40 &&
    (Object.prototype.hasOwnProperty.call(COSMETIC_BY_ID, v) || /^[a-z0-9-]+$/.test(v))
      ? v
      : null;
  const skins: Record<string, string> = {};
  if (isObj(r.skins))
    for (const [id, s] of Object.entries(r.skins))
      if (known(id) && typeof s === "string" && SKIN_IDS.has(s)) skins[id] = s;
  const tierInkPaid: Record<string, number> = {};
  if (isObj(r.tierInkPaid))
    for (const [id, t] of Object.entries(r.tierInkPaid))
      if (known(id)) tierInkPaid[id] = int(t, 0, MAX_BOND, 0);
  // A tier is "paid" for every owned card at least up to its current tier is handled by the store's merge
  // (settleTierPaid); here we only keep the ledger well-formed.
  const sgBest = int(r.sgBest, 0, 100_000, 0);
  const lastDaily =
    typeof r.lastDaily === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.lastDaily) ? r.lastDaily : null;
  const assist = r.assist === "none" || known(r.assist) ? (r.assist as string) : null;

  return {
    ok: true,
    data: {
      artifacts: cleanArtifacts(r.artifacts, owned),
      artifactSummon: cleanSummon(r.artifactSummon),
      raid: cleanRaid(r.raid, owned),
      storyEvents: cleanStoryEvents(r.storyEvents),
      coachSeen: int(r.coachSeen, 0, 99, 0),
      companionId: resolveCompanion(r.companionId, owned),
      companionGuideDone: r.companionGuideDone === true,
      letters: cleanLetters(r.letters),
      lettersVersion: 1,
      storyLast: isObj(r.storyLast)
        ? (Object.fromEntries(
            Object.entries(r.storyLast).filter(
              ([k, v]) =>
                /^[1-5]$/.test(k) &&
                typeof v === "number" &&
                Number.isInteger(v) &&
                v >= 1 &&
                v <= 10,
            ),
          ) as Record<string, number>)
        : {},
      ink: int(r.ink, 0, INK_CAP, 0),
      pity: int(r.pity, 0, 1000, 0),
      owned,
      totalPulls: int(r.totalPulls, 0, 10_000_000, 0),
      lastDaily,
      history: Array.isArray(r.history) ? r.history.filter(known).slice(0, 40) : [],
      m3,
      volumeAwards: cleanVolumeAwards(r.volumeAwards),
      mainStoryRead: cleanMainStoryRead(r.mainStoryRead),
      mainStoryPrologueRead: cleanMainStoryPrologueRead(r.mainStoryPrologueRead),
      mainStoryHanRead: cleanMainStoryHanRead(r.mainStoryHanRead),
      mainStoryWuRead: cleanMainStoryWuRead(r.mainStoryWuRead),
      mainStoryQiRead: cleanMainStoryQiRead(r.mainStoryQiRead),
      mainStoryTangRead: cleanMainStoryTangRead(r.mainStoryTangRead),
      mainStoryQinPlay: cleanMainStoryQinPlay(r.mainStoryQinPlay),
      mainStoryWuPlay: cleanMainStoryQinPlay(r.mainStoryWuPlay),
      mainStoryQiPlay: cleanMainStoryQinPlay(r.mainStoryQiPlay),
      mainStoryTangPlay: cleanMainStoryQinPlay(r.mainStoryTangPlay),
      m3Best: int(r.m3Best, 0, 100_000_000, 0),
      marks: int(r.marks, 0, MARKS_CAP, 0),
      cosmetics,
      frame: pick(r.frame) ?? DEFAULT_FRAME,
      backdrop: pick(r.backdrop) ?? DEFAULT_BACKDROP,
      skins,
      assist,
      tierInkPaid,
      sgBest,
      sgTotal: int(r.sgTotal, 0, 1e13, 0),
      sgRanksPaid: cleanRanksPaid(r.sgRanksPaid, sgBest),
      sgNick: r.sgNick == null || r.sgNick === "" ? null : cleanNickname(r.sgNick),
      avatarId:
        known(r.avatarId) && (owned[r.avatarId as string] ?? 0) > 0 ? (r.avatarId as string) : null,
      deviceId: validDeviceId(r.deviceId) ? (r.deviceId as string) : null,
    },
  };
}

export type SaveSummary = {
  ink: number;
  marks: number;
  cards: number;
  pulls: number;
  sgBest: number;
  m3Stars: number;
};

export function summarize(s: Snapshot): SaveSummary {
  return {
    ink: s.ink,
    marks: s.marks,
    cards: Object.keys(s.owned).length,
    pulls: s.totalPulls,
    sgBest: s.sgBest,
    m3Stars: Object.values(s.m3).reduce((a, r) => a + r.stars, 0),
  };
}

/** Has this device played at all? (A brand-new device just adopts the cloud save without asking.) */
export function hasProgress(s: Snapshot): boolean {
  return (
    s.totalPulls > 0 ||
    Object.keys(s.owned).length > 0 ||
    s.sgBest > 0 ||
    Object.keys(s.m3).length > 0 ||
    s.marks > 0 ||
    s.cosmetics.length > 0
  );
}

/** Stable fingerprint of the parts that matter (key order independent; the device id excluded). */
export function fingerprint(s: Snapshot): string {
  const norm = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(norm)
      : isObj(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, norm(v[k])]),
          )
        : v;
  const { deviceId: _ignored, ...rest } = s;
  const str = JSON.stringify(norm(rest));
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${str.length.toString(36)}-${h.toString(36)}`;
}

/* ── Sync decisions ─────────────────────────────────────────────────── */

export type CloudDoc = { rev: number; data: Snapshot; updatedAt: number };
/** What this device remembers about the last successful sync with its bound account. */
export type SyncMeta = { account: string; rev: number; synced: string };

export type SyncAction =
  | { kind: "upload"; baseRev: number } // push local to cloud
  | { kind: "adopt" } // overwrite local with cloud silently
  | { kind: "conflict" } // ask: 用雲端進度 / 用這台裝置的進度
  | { kind: "none" };

/**
 * Decide what to do when we learn the cloud state for `account`.
 * - First binding (no meta for this account): no cloud → upload; cloud + fresh device → adopt;
 *   identical → nothing; otherwise ask.
 * - Known account: cloud unchanged since our last sync → upload if we changed locally;
 *   cloud moved on (another device) → adopt if we have no unsynced local changes, else ask.
 */
export function decideSync(
  local: Snapshot,
  cloud: CloudDoc | null,
  meta: SyncMeta | null,
  account: string,
): SyncAction {
  const localFp = fingerprint(local);
  const m = meta && meta.account === account ? meta : null;
  if (!cloud) return { kind: "upload", baseRev: 0 };
  const cloudFp = fingerprint(cloud.data);
  if (!m) {
    if (cloudFp === localFp) return { kind: "none" };
    if (!hasProgress(local)) return { kind: "adopt" };
    return { kind: "conflict" };
  }
  const localDirty = localFp !== m.synced;
  if (cloud.rev === m.rev)
    return localDirty ? { kind: "upload", baseRev: cloud.rev } : { kind: "none" };
  if (cloudFp === localFp) return { kind: "none" };
  return localDirty ? { kind: "conflict" } : { kind: "adopt" };
}

export function cloudPrefix(vercelEnv: string | undefined): string {
  const e = (vercelEnv ?? "").trim().toLowerCase();
  return `cs:${e === "production" ? "prod" : e === "preview" ? "preview" : "dev"}`;
}
