/**
 * Google Identity Services ID-token verification + the signed session cookie. WebCrypto only (works in
 * Node ≥ 20 and the Vercel runtime); keys and clock are injectable so the node tests can sign their own.
 */
export const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const SESSION_COOKIE = "qgy_cloud";
export const SESSION_TTL_S = 180 * 24 * 3600;
const CLOCK_SKEW_S = 120;

export type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string; use?: string };
export type GoogleClaims = { sub: string; aud: string; iss: string; exp: number; iat: number; email?: string; email_verified?: boolean; name?: string };
export type VerifyError = "malformed" | "alg" | "kid" | "signature" | "issuer" | "audience" | "expired" | "not_yet_valid" | "no_sub";

const enc = new TextEncoder();

export function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64url(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function jsonPart<T>(part: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(part))) as T;
  } catch {
    return null;
  }
}

export async function verifyGoogleIdToken(
  token: unknown,
  opts: { clientId: string; nowS: number; getKeys: () => Promise<Jwk[]> },
): Promise<{ ok: true; claims: GoogleClaims } | { ok: false; error: VerifyError }> {
  if (typeof token !== "string" || token.length > 4096) return { ok: false, error: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "malformed" };
  const header = jsonPart<{ alg?: string; kid?: string }>(parts[0]);
  const claims = jsonPart<GoogleClaims>(parts[1]);
  if (!header || !claims) return { ok: false, error: "malformed" };
  if (header.alg !== "RS256") return { ok: false, error: "alg" };
  const jwk = (await opts.getKeys()).find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) return { ok: false, error: "kid" };
  let valid = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "signature" };
  if (!GOOGLE_ISSUERS.includes(claims.iss)) return { ok: false, error: "issuer" };
  if (claims.aud !== opts.clientId) return { ok: false, error: "audience" };
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < opts.nowS) return { ok: false, error: "expired" };
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_S > opts.nowS) return { ok: false, error: "not_yet_valid" };
  if (typeof claims.sub !== "string" || !/^[0-9A-Za-z_-]{1,255}$/.test(claims.sub)) return { ok: false, error: "no_sub" };
  return { ok: true, claims };
}

/** Opaque account id stored server-side: SHA-256(sub + pepper), hex — never the raw Google id. */
export async function accountId(sub: string, pepper: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(`qgy:${pepper}:${sub}`));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToB64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

/** Session value: "v1.<account>.<exp>.<hmac>". */
export async function signSession(account: string, expS: number, secret: string): Promise<string> {
  const body = `v1.${account}.${expS}`;
  return `${body}.${await hmac(secret, body)}`;
}

export async function readSession(value: string | null | undefined, secret: string, nowS: number): Promise<string | null> {
  if (!value || value.length > 300) return null;
  const m = /^v1\.([0-9a-f]{40})\.(\d{1,12})\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!m) return null;
  const expect = await hmac(secret, `v1.${m[1]}.${m[2]}`);
  if (expect.length !== m[3].length) return null;
  let diff = 0;
  for (let i = 0; i < expect.length; i++) diff |= expect.charCodeAt(i) ^ m[3].charCodeAt(i);
  if (diff !== 0) return null;
  if (Number(m[2]) < nowS) return null;
  return m[1];
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(value: string, maxAgeS: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/api/cloud; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure ? "; Secure" : ""}`;
}

/** Display-only hint for the UI ("已綁定 a…z@gmail.com"); never stored server-side. */
export function maskEmail(email: string | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const [u, d] = email.split("@");
  return `${u.slice(0, 1)}${u.length > 2 ? "…" : ""}${u.length > 1 ? u.slice(-1) : ""}@${d}`;
}
