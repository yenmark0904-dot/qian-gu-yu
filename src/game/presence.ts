/**
 * Online presence — pure, dependency-light rules shared by the browser heartbeat, the server route and the
 * node tests. Anonymous: a random per-browser id (its own localStorage key, NOT the leaderboard device id),
 * the current screen label, and the 深宮 nickname only if the player chose one. No IP, no user agent stored.
 */
import { cleanNickname } from "./shengong.ts";

export const PRESENCE_ID_KEY = "qgy-presence-id";
/** Client beat interval while the tab is visible. */
export const HEARTBEAT_MS = 30_000;
/** A browser counts as online for this long after its last beat (≈ 2.5 beats). */
export const PRESENCE_TTL_MS = 75_000;
/** Server: at most one beat per id per this many ms (visibility flips can beat early). */
export const MIN_BEAT_GAP_MS = 8_000;
/** Server: per-IP cap per minute (a household / school NAT with many tabs still fits). */
export const BEAT_IP_WINDOW_MS = 60_000;
export const BEAT_IP_MAX = 60;
/** Hard cap on tracked browsers per environment (protects Redis from floods). */
export const MAX_TRACKED = 5000;
export const MAX_SCREEN_LEN = 40;

export function validPresenceId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}

export function newPresenceId(rand: (n: number) => Uint8Array): string {
  return Array.from(rand(16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Strip anything odd from a client-sent screen label; keep CJK, letters, digits, a few separators. */
export function cleanScreen(raw: unknown): string {
  if (typeof raw !== "string") return "未知";
  const s = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[^\p{L}\p{N} ·#\-–:：/（）()]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SCREEN_LEN);
  return s || "未知";
}

export function cleanPresenceNick(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  return cleanNickname(raw);
}

/** Redis key prefix per Vercel environment, so preview traffic never mixes with production. */
export function envPrefix(vercelEnv: string | undefined): string {
  const e = (vercelEnv ?? "").trim().toLowerCase();
  const name = e === "production" ? "prod" : e === "preview" ? "preview" : "dev";
  return `pr:${name}`;
}

/** What the DOM says the player is looking at (collected in the browser, turned into a label here). */
export type ScreenSnapshot = {
  tab?: string | null;
  survey?: boolean;
  shengongFloor?: string | null;
  shengongBoard?: boolean;
  shengongHome?: boolean;
  match3Level?: string | null;
  match3Map?: boolean;
  summoning?: boolean;
  cardName?: string | null;
};

const TAB_LABEL: Record<string, string> = { home: "墨門", summon: "首頁·召喚", codex: "圖鑑", shop: "墨寶閣", rates: "機率" };

export function describeScreen(s: ScreenSnapshot): string {
  if (s.survey) return "問卷";
  if (s.shengongFloor) return `深宮 ${s.shengongFloor}`;
  if (s.shengongBoard) return "深宮排行";
  if (s.shengongHome) return "深宮";
  if (s.match3Level) return `三消 ${s.match3Level}`;
  if (s.match3Map) return "三消地圖";
  if (s.summoning) return "召喚中";
  if (s.cardName) return `角色 ${s.cardName}`;
  return (s.tab && TAB_LABEL[s.tab]) || "首頁";
}

export type PresenceEntry = { id: string; screen: string; nick: string | null; lastSeen: number };
export type PresenceRow = { id: string; nick: string | null; screen: string; secondsAgo: number };
export type PresenceSummary = { env: string; online: number; ttlSeconds: number; users: PresenceRow[] };

/** Admin view: only entries seen within the TTL, newest first, ids shortened. */
export function summarize(env: string, entries: PresenceEntry[], now: number): PresenceSummary {
  const live = entries.filter((e) => now - e.lastSeen <= PRESENCE_TTL_MS).sort((a, b) => b.lastSeen - a.lastSeen);
  return {
    env,
    online: live.length,
    ttlSeconds: PRESENCE_TTL_MS / 1000,
    users: live.map((e) => ({ id: e.id.slice(0, 6), nick: e.nick, screen: e.screen, secondsAgo: Math.max(0, Math.round((now - e.lastSeen) / 1000)) })),
  };
}

/** Constant-time string compare (admin token). */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** "Bearer xyz" → "xyz". */
export function bearer(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
}
