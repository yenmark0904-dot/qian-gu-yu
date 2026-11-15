import { getRequest } from "@tanstack/react-start/server";
import { RateLimiter } from "./feedback";
import {
  BOARD_SIZE,
  MIN_SUBMIT_GAP_MS,
  SUBMIT_IP_MAX,
  SUBMIT_WINDOW_MS,
  applySubmission,
  cleanNickname,
  rankForFloor,
  validDeviceId,
  validateSubmission,
  type BoardRow,
  type PlayerRecord,
  type SubmitError,
} from "./shengong";
import { leaderboardStore } from "./shengong-store.server";

/** 深宮 — server half (`.server`: request context + storage; never shipped to the browser). */
const g = globalThis as typeof globalThis & { __qgyShengongLimits__?: { device: RateLimiter; ip: RateLimiter } };
const limits = (g.__qgyShengongLimits__ ??= {
  device: new RateLimiter(MIN_SUBMIT_GAP_MS, 1),
  ip: new RateLimiter(SUBMIT_WINDOW_MS, SUBMIT_IP_MAX),
});

/** Same request checks as the survey route: same-origin only; client IP for the per-IP cap. */
function requestInfo(): { ok: boolean; ip: string } {
  const h = getRequest()?.headers;
  const site = h?.get("sec-fetch-site");
  const ok = !site || site === "same-origin" || site === "none";
  const ip = (h?.get("x-forwarded-for")?.split(",")[0] ?? h?.get("x-real-ip") ?? "").trim() || "unknown";
  return { ok, ip };
}

export type Me = { floor: number; total: number; nickname: string | null; position: number | null; ranksPaid: number[] };
export type BoardResult =
  | { ok: true; storage: "redis" | "db"; durable: boolean; rows: BoardRow[]; me: Me | null }
  | { ok: false; error: "unavailable" };

function meOf(rec: PlayerRecord | null, position: number | null): Me | null {
  return rec ? { floor: rec.floor, total: rec.total, nickname: rec.nickname, position, ranksPaid: rec.ranksPaid } : null;
}

export async function boardServer(raw: unknown): Promise<BoardResult> {
  const deviceId = (raw as { deviceId?: unknown } | null)?.deviceId;
  try {
    const store = leaderboardStore();
    const top = await store.top(BOARD_SIZE);
    const id = validDeviceId(deviceId) ? deviceId : null;
    const rec = id ? await store.get(id) : null;
    const position = rec && rec.floor > 0 ? await store.positionOf(rec) : null;
    const rows: BoardRow[] = top.map((r, i) => ({
      position: i + 1,
      nickname: r.nickname ?? "",
      title: rankForFloor(r.floor).name,
      floor: r.floor,
      total: r.total,
      me: !!id && r.deviceId === id,
    }));
    // Ties share a place: walk down and reuse the previous position when floor+total match.
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!;
      const b = rows[i]!;
      if (a.floor === b.floor && a.total === b.total) b.position = a.position;
    }
    return { ok: true, storage: store.kind, durable: store.durable, rows, me: meOf(rec, position) };
  } catch (err) {
    console.error("[shengong] board read failed:", err);
    return { ok: false, error: "unavailable" };
  }
}

export type SubmitResult =
  | { ok: true; floor: number; total: number; position: number | null; newRanks: number[]; ink: number }
  | { ok: false; error: SubmitError | "unavailable"; expected?: number };

export async function submitServer(raw: unknown): Promise<SubmitResult> {
  const req = requestInfo();
  if (!req.ok) return { ok: false, error: "invalid" };
  const deviceId = (raw as { deviceId?: unknown } | null)?.deviceId;
  if (!validDeviceId(deviceId)) return { ok: false, error: "invalid" };
  const now = Date.now();
  if (!limits.device.allowed(deviceId, now) || !limits.ip.allowed(req.ip, now)) return { ok: false, error: "rate_limited" };
  limits.device.record(deviceId, now);
  limits.ip.record(req.ip, now);
  try {
    const store = leaderboardStore();
    const prev = await store.get(deviceId);
    const checked = validateSubmission(prev, raw, now);
    if (!checked.ok) return checked;
    const { record, newRanks, ink } = applySubmission(prev, checked.value, now);
    await store.put(record);
    const position = record.nickname ? await store.positionOf(record) : null;
    return { ok: true, floor: record.floor, total: record.total, position, newRanks, ink };
  } catch (err) {
    console.error("[shengong] submit failed:", err);
    return { ok: false, error: "unavailable" };
  }
}

export type NickResult = { ok: true; nickname: string } | { ok: false; error: "invalid" | "nickname" | "no_record" | "rate_limited" | "unavailable" };

export async function nicknameServer(raw: unknown): Promise<NickResult> {
  const req = requestInfo();
  if (!req.ok) return { ok: false, error: "invalid" };
  const r = (raw ?? {}) as { deviceId?: unknown; nickname?: unknown };
  if (!validDeviceId(r.deviceId)) return { ok: false, error: "invalid" };
  const nickname = cleanNickname(r.nickname);
  if (!nickname) return { ok: false, error: "nickname" };
  const now = Date.now();
  if (!limits.ip.allowed(req.ip, now)) return { ok: false, error: "rate_limited" };
  limits.ip.record(req.ip, now);
  try {
    const store = leaderboardStore();
    const prev = await store.get(r.deviceId);
    if (!prev || prev.floor <= 0) return { ok: false, error: "no_record" };
    await store.put({ ...prev, nickname });
    return { ok: true, nickname };
  } catch (err) {
    console.error("[shengong] nickname failed:", err);
    return { ok: false, error: "unavailable" };
  }
}

/** Remove this device's own entry (used to clean up test runs; a player can only delete their own id). */
export async function forgetServer(raw: unknown): Promise<{ ok: boolean }> {
  const req = requestInfo();
  const deviceId = (raw as { deviceId?: unknown } | null)?.deviceId;
  if (!req.ok || !validDeviceId(deviceId)) return { ok: false };
  try {
    await leaderboardStore().remove(deviceId);
    return { ok: true };
  } catch (err) {
    console.error("[shengong] forget failed:", err);
    return { ok: false };
  }
}
