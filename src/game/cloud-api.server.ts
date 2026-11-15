import { RateLimiter } from "./feedback.ts";
import { cloudPrefix, sanitizeSnapshot, type CloudDoc } from "./cloud-save.ts";
import { cloudStore, type CloudStore } from "./cloud-store.server.ts";
import {
  GOOGLE_JWKS_URL,
  SESSION_COOKIE,
  SESSION_TTL_S,
  accountId,
  maskEmail,
  readCookie,
  readSession,
  sessionCookie,
  signSession,
  verifyGoogleIdToken,
  type Jwk,
} from "./google-auth.ts";

/**
 * 雲端存檔 API (Google 帳號綁定).
 *   GET  /api/cloud                     → { enabled, clientId, signedIn }  (clientId is public)
 *   POST /api/cloud {op:"signin", credential}  → verifies the GIS ID token, sets the httpOnly session cookie
 *   POST /api/cloud {op:"load"}                → { cloud }
 *   POST /api/cloud {op:"save", baseRev, data} → { rev } | 409 { cloud }   (compare-and-set)
 *   POST /api/cloud {op:"signout"}             → clears the cookie
 * Hidden entirely (enabled:false, 404 on POST) until GOOGLE_CLIENT_ID and CLOUD_SESSION_SECRET are set.
 */
const ACCOUNT_PEPPER = "qgy-cloud-v1";
const noStore = { "cache-control": "no-store" };
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...noStore, ...extra } });

export type CloudDeps = { getKeys?: () => Promise<Jwk[]>; store?: CloudStore; now?: () => number; env?: Record<string, string | undefined> };

const g = globalThis as typeof globalThis & {
  __qgyCloudLimits__?: { ip: RateLimiter; save: RateLimiter };
  __qgyJwks__?: { keys: Jwk[]; until: number };
};
const limits = (g.__qgyCloudLimits__ ??= { ip: new RateLimiter(60_000, 60), save: new RateLimiter(2_000, 1) });

function config(env: Record<string, string | undefined>) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const secret = env.CLOUD_SESSION_SECRET?.trim();
  return clientId && secret && secret.length >= 32 ? { clientId, secret } : null;
}

async function googleKeys(): Promise<Jwk[]> {
  const now = Date.now();
  if (g.__qgyJwks__ && g.__qgyJwks__.until > now) return g.__qgyJwks__.keys;
  const res = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`jwks http ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  g.__qgyJwks__ = { keys: body.keys ?? [], until: now + Math.min(maxAge, 6 * 3600) * 1000 };
  return g.__qgyJwks__.keys;
}

const clientIp = (r: Request) => (r.headers.get("x-forwarded-for")?.split(",")[0] ?? r.headers.get("x-real-ip") ?? "").trim() || "unknown";
const isSecure = (r: Request) => new URL(r.url).protocol === "https:" || r.headers.get("x-forwarded-proto") === "https";
const short = (account: string) => account.slice(0, 16);

export async function handleCloudGet(request: Request, deps: CloudDeps = {}) {
  const cfg = config(deps.env ?? process.env);
  if (!cfg) return json(200, { enabled: false });
  const account = await readSession(readCookie(request.headers.get("cookie"), SESSION_COOKIE), cfg.secret, Math.floor((deps.now?.() ?? Date.now()) / 1000));
  return json(200, { enabled: true, clientId: cfg.clientId, signedIn: !!account, account: account ? short(account) : null });
}

export async function handleCloudPost(request: Request, deps: CloudDeps = {}) {
  const env = deps.env ?? process.env;
  const cfg = config(env);
  if (!cfg) return json(404, { error: "disabled" });
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return json(403, { error: "cross_site" });
  const now = deps.now?.() ?? Date.now();
  const ip = clientIp(request);
  if (!limits.ip.allowed(ip, now)) return json(429, { error: "rate_limited" });
  limits.ip.record(ip, now);

  const text = await request.text().catch(() => "");
  if (text.length > 80 * 1024) return json(413, { error: "too_large" });
  let body: { op?: unknown; credential?: unknown; baseRev?: unknown; data?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "bad_json" });
  }
  const prefix = cloudPrefix(env.VERCEL_ENV);
  const store = deps.store ?? cloudStore();
  const nowS = Math.floor(now / 1000);

  try {
    if (body.op === "signin") {
      const v = await verifyGoogleIdToken(body.credential, { clientId: cfg.clientId, nowS, getKeys: deps.getKeys ?? googleKeys });
      if (!v.ok) return json(401, { error: "bad_token", reason: v.error });
      const account = await accountId(v.claims.sub, ACCOUNT_PEPPER);
      const cookie = sessionCookie(await signSession(account, nowS + SESSION_TTL_S, cfg.secret), SESSION_TTL_S, isSecure(request));
      const cloud = await store.load(prefix, account);
      return json(200, { ok: true, account: short(account), email: maskEmail(v.claims.email), cloud }, { "set-cookie": cookie });
    }
    if (body.op === "signout") {
      return json(200, { ok: true }, { "set-cookie": sessionCookie("", 0, isSecure(request)) });
    }
    const account = await readSession(readCookie(request.headers.get("cookie"), SESSION_COOKIE), cfg.secret, nowS);
    if (!account) return json(401, { error: "signed_out" });
    if (body.op === "load") {
      return json(200, { ok: true, account: short(account), cloud: await store.load(prefix, account) });
    }
    if (body.op === "save") {
      if (!limits.save.allowed(account, now)) return json(429, { error: "rate_limited" });
      limits.save.record(account, now);
      const baseRev = Number(body.baseRev);
      if (!Number.isInteger(baseRev) || baseRev < 0) return json(400, { error: "bad_rev" });
      const clean = sanitizeSnapshot(body.data);
      if (!clean.ok) return json(400, { error: clean.error });
      const doc: CloudDoc = { rev: baseRev + 1, data: clean.data, updatedAt: now };
      const out = await store.save(prefix, account, baseRev, doc);
      if (!out.ok) return json(409, { error: "conflict", cloud: out.conflict });
      return json(200, { ok: true, rev: out.rev, updatedAt: now, data: clean.data });
    }
    return json(400, { error: "bad_op" });
  } catch (err) {
    console.error("[cloud]", typeof body.op === "string" ? body.op : "?", err instanceof Error ? err.message : "error");
    return json(503, { error: "unavailable" });
  }
}

