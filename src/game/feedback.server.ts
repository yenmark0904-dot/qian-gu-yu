import { getRequest } from "@tanstack/react-start/server";
import {
  RATE_IP_MAX,
  RATE_WINDOW_MS,
  RateLimiter,
  sheetPayload,
  shortUserAgent,
  taipeiTimestamp,
  validateFeedback,
  type FeedbackError,
} from "./feedback";

/**
 * 玩家心聲 ♡ — server half (`.server` suffix: imports request context; never shipped to the browser).
 * FEEDBACK_SHEET_WEBHOOK / FEEDBACK_SHEET_TOKEN are read from the server env only.
 */
const g = globalThis as typeof globalThis & { __qgyFeedbackLimits__?: { device: RateLimiter; ip: RateLimiter } };
const limits = (g.__qgyFeedbackLimits__ ??= {
  device: new RateLimiter(RATE_WINDOW_MS, 1),
  ip: new RateLimiter(RATE_WINDOW_MS, RATE_IP_MAX),
});

function envVal(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function appVersion(): string {
  const dep = envVal("VERCEL_DEPLOYMENT_ID");
  const sha = envVal("VERCEL_GIT_COMMIT_SHA")?.slice(0, 7);
  const env = envVal("VERCEL_ENV");
  return [dep ?? envVal("VERCEL_URL") ?? "local", sha, env].filter(Boolean).join(" · ").slice(0, 120);
}

export type SubmitResult = { ok: true; stored: { db: boolean; sheet: boolean } } | { ok: false; error: FeedbackError };

export async function submitFeedbackServer(raw: unknown): Promise<SubmitResult> {
  const checked = validateFeedback(raw);
  if (!checked.ok) return checked;
  const input = checked.value;

  const request = getRequest();
  const h = request?.headers;
  // Same rule as authMiddleware: refuse scripted cross-site / sibling-site posts.
  const site = h?.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return { ok: false, error: "invalid" };
  const ip = (h?.get("x-forwarded-for")?.split(",")[0] ?? h?.get("x-real-ip") ?? "").trim() || "unknown";
  const ua = shortUserAgent(h?.get("user-agent"));
  const now = Date.now();

  if (!limits.device.allowed(input.deviceId, now) || !limits.ip.allowed(ip, now)) return { ok: false, error: "rate_limited" };

  let db = false;
  let sql: Awaited<ReturnType<typeof import("@/lib/db").getSql>> | null = null;
  try {
    const { getSql } = await import("@/lib/db");
    sql = await getSql();
    const recent = await sql<{ n: number }>`select count(*) as n from feedback
      where device_id = ${input.deviceId} and created_at > now() - interval '10 minutes'`;
    if ((recent[0]?.n ?? 0) > 0) return { ok: false, error: "rate_limited" };
  } catch (err) {
    console.error("[feedback] DB unavailable, continuing with sheet only:", err);
    sql = null;
  }

  limits.device.record(input.deviceId, now);
  limits.ip.record(ip, now);

  const version = appVersion();
  const submittedAt = taipeiTimestamp(new Date(now));
  const device = [input.deviceId, ua].filter(Boolean).join(" · ");

  if (sql) {
    try {
      await sql`insert into feedback (device_id, answers, other, user_agent, version)
        values (${input.deviceId}, ${JSON.stringify(input.answers)}, ${input.other}, ${ua}, ${version})`;
      db = true;
    } catch (err) {
      console.error("[feedback] DB insert failed:", err);
    }
  }

  let sheet = false;
  const url = envVal("FEEDBACK_SHEET_WEBHOOK");
  const token = envVal("FEEDBACK_SHEET_TOKEN");
  if (!url || !token) {
    console.warn(`[feedback] FEEDBACK_SHEET_WEBHOOK/TOKEN not set — reply kept in DB only (db=${db}).`, JSON.stringify(sheetPayload(input, { submittedAt, device, version })));
  } else {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token, ...sheetPayload(input, { submittedAt, device, version }) }),
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      sheet = res.ok && /"ok"\s*:\s*true/.test(text);
      if (!sheet) console.error(`[feedback] sheet webhook refused: HTTP ${res.status} ${text.slice(0, 200)}`);
    } catch (err) {
      console.error("[feedback] sheet webhook failed:", err);
    }
  }
  return { ok: true, stored: { db, sheet } };
}
