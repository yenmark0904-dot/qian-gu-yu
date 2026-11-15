import { createFileRoute } from "@tanstack/react-router";
import { RateLimiter } from "@/game/feedback";
import {
  BEAT_IP_MAX,
  BEAT_IP_WINDOW_MS,
  MIN_BEAT_GAP_MS,
  bearer,
  cleanPresenceNick,
  cleanScreen,
  envPrefix,
  safeEqual,
  summarize,
  validPresenceId,
} from "@/game/presence";
import { presenceStore } from "@/game/presence-store.server";

/**
 * POST /api/presence — anonymous heartbeat from the game (same-origin only, rate-limited, 204).
 * GET  /api/presence — admin summary; needs `Authorization: Bearer <PRESENCE_ADMIN_TOKEN>`.
 * Data is keyed by VERCEL_ENV so preview and production never mix.
 */
const g = globalThis as typeof globalThis & { __qgyPresenceLimits__?: { id: RateLimiter; ip: RateLimiter } };
const limits = (g.__qgyPresenceLimits__ ??= { id: new RateLimiter(MIN_BEAT_GAP_MS, 1), ip: new RateLimiter(BEAT_IP_WINDOW_MS, BEAT_IP_MAX) });

const noStore = { "cache-control": "no-store" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...noStore } });

async function heartbeat(request: Request): Promise<Response> {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new Response(null, { status: 403, headers: noStore });
  const text = await request.text().catch(() => "");
  if (text.length > 1024) return new Response(null, { status: 413, headers: noStore });
  let body: { id?: unknown; screen?: unknown; nick?: unknown; leave?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400, headers: noStore });
  }
  if (!validPresenceId(body?.id)) return new Response(null, { status: 400, headers: noStore });
  const id = body.id as string;
  const prefix = envPrefix(process.env.VERCEL_ENV);
  const now = Date.now();
  try {
    if (body.leave === true) {
      await presenceStore().leave(prefix, id);
      return new Response(null, { status: 204, headers: noStore });
    }
    const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "").trim() || "unknown";
    if (!limits.id.allowed(id, now) || !limits.ip.allowed(ip, now)) return new Response(null, { status: 429, headers: noStore });
    limits.id.record(id, now);
    limits.ip.record(ip, now);
    await presenceStore().beat(prefix, { id, screen: cleanScreen(body.screen), nick: cleanPresenceNick(body.nick), lastSeen: now });
    return new Response(null, { status: 204, headers: noStore });
  } catch (err) {
    console.error("[presence] beat failed:", err instanceof Error ? err.message : "error");
    return new Response(null, { status: 503, headers: noStore });
  }
}

async function admin(request: Request): Promise<Response> {
  const expected = process.env.PRESENCE_ADMIN_TOKEN?.trim();
  if (!expected) return json(404, { error: "not_configured" });
  const given = bearer(request.headers.get("authorization"));
  if (!given || !safeEqual(given, expected)) return json(401, { error: "unauthorized" });
  const prefix = envPrefix(process.env.VERCEL_ENV);
  try {
    const store = presenceStore();
    const now = Date.now();
    const entries = await store.list(prefix, now);
    return json(200, { ...summarize(prefix.replace(/^pr:/, ""), entries, now), storage: store.kind, at: new Date(now).toISOString() });
  } catch (err) {
    console.error("[presence] list failed:", err instanceof Error ? err.message : "error");
    return json(503, { error: "unavailable" });
  }
}

export const Route = createFileRoute("/api/presence")({
  server: {
    handlers: {
      GET: ({ request }) => admin(request),
      POST: ({ request }) => heartbeat(request),
    },
  },
});
