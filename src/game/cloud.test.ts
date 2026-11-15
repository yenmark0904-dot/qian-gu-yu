import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOUD_MAX_BYTES, INK_CAP, decideSync, fingerprint, hasProgress, sanitizeSnapshot, summarize, cloudPrefix, type Snapshot } from "./cloud-save.ts";
import { accountId, bytesToB64url, maskEmail, readCookie, readSession, signSession, verifyGoogleIdToken, type Jwk } from "./google-auth.ts";
import { MemoryCloudStore } from "./cloud-store.server.ts";
import { handleCloudGet, handleCloudPost } from "./cloud-api.server.ts";
import { CHARACTERS } from "./data.ts";

const ID1 = CHARACTERS[0].id;
const ID2 = CHARACTERS[1].id;
const clean = (raw: unknown) => {
  const r = sanitizeSnapshot(raw);
  assert.ok(r.ok);
  return (r as { ok: true; data: Snapshot }).data;
};
const fresh = () => clean({});
const played = (over: Partial<Snapshot> = {}) => clean({ ink: 1200, owned: { [ID1]: 1 }, totalPulls: 10, sgBest: 3, sgRanksPaid: [], ...over });

test("sanitize clamps, drops unknown ids and caps 墨玉", () => {
  const d = clean({
    ink: 9e15, marks: -5, pity: 3.7, owned: { [ID1]: 2, nobody: 5, [ID2]: 0 }, totalPulls: "x",
    history: [ID1, "zzz", 5], lastDaily: "2026-11-06", m3: { "1": { stars: 9, best: 1234 }, abc: { stars: 1 } },
    cosmetics: ["nope"], skins: { [ID1]: "gilt", [ID2]: "hack" }, assist: "nobody", sgBest: 25, sgRanksPaid: [0, 1, 2, 7],
    sgNick: "<b>宮人</b>", avatarId: "nobody", mainStoryRead: [1, 9, 99, "x"], mainStoryPrologueRead: 1, mainStoryHanRead: [1, 99, 0], mainStoryWuRead: [3, 99], mainStoryQiRead: [4, 0, 99], mainStoryTangRead: [6, 0, 99], deviceId: "not valid!", extra: "ignored",
  });
  assert.equal(d.ink, INK_CAP);
  assert.equal(d.marks, 0);
  assert.equal(d.pity, 3);
  assert.deepEqual(d.owned, { [ID1]: 2 });
  assert.equal(d.totalPulls, 0);
  assert.deepEqual(d.history, [ID1]);
  assert.deepEqual(d.m3, { "1": { stars: 3, best: 1234 } });
  assert.deepEqual(d.cosmetics, []);
  assert.deepEqual(d.skins, { [ID1]: "gilt" });
  assert.equal(d.assist, null);
  assert.ok(d.sgRanksPaid.every((r) => r <= 2), "rank rewards beyond the floor reached are dropped");
  assert.equal(d.sgNick, "宮人");
  assert.equal(d.avatarId, null, "unowned / unknown avatar dropped");
  assert.deepEqual(d.mainStoryRead, [1, 9]);
  assert.equal(d.mainStoryPrologueRead, false, "truthy non-boolean prologue dropped");
  assert.deepEqual(d.mainStoryHanRead, [1]);
  assert.deepEqual(d.mainStoryWuRead, [3]);
  assert.deepEqual(d.mainStoryQiRead, [4]);
  assert.deepEqual(d.mainStoryTangRead, [6]);
  assert.equal(d.deviceId, null);
  assert.equal(d.mainStoryQinPlay, null);
  assert.equal("extra" in d, false);
});

test("sanitize rejects junk and oversized payloads", () => {
  assert.deepEqual(sanitizeSnapshot(null), { ok: false, error: "bad_shape" });
  assert.deepEqual(sanitizeSnapshot([1, 2]), { ok: false, error: "bad_shape" });
  assert.deepEqual(sanitizeSnapshot({ history: ["x".repeat(CLOUD_MAX_BYTES)] }), { ok: false, error: "too_large" });
});

test("summary + progress + fingerprint", () => {
  const p = played({ m3: { "1": { stars: 3, best: 1 }, "2": { stars: 2, best: 1 } } });
  assert.deepEqual(summarize(p), { ink: 1200, marks: 0, cards: 1, pulls: 10, sgBest: 3, m3Stars: 5 });
  assert.equal(hasProgress(fresh()), false);
  assert.equal(hasProgress(p), true);
  assert.equal(fingerprint(p), fingerprint(clean({ ...p, deviceId: "dev-aaaaaaaaaaaaaaaa" })), "device id is not progress");
  assert.notEqual(fingerprint(p), fingerprint({ ...p, ink: 1201 }));
});

test("sync decisions", () => {
  const acct = "acct1";
  const local = played();
  const cloudDoc = (data: Snapshot, rev: number) => ({ rev, data, updatedAt: 1 });
  // First binding
  assert.deepEqual(decideSync(local, null, null, acct), { kind: "upload", baseRev: 0 });
  assert.deepEqual(decideSync(fresh(), cloudDoc(local, 4), null, acct), { kind: "adopt" });
  assert.deepEqual(decideSync(local, cloudDoc(local, 4), null, acct), { kind: "none" });
  assert.deepEqual(decideSync(played({ ink: 5 }), cloudDoc(local, 4), null, acct), { kind: "conflict" });
  // Known account
  const meta = { account: acct, rev: 4, synced: fingerprint(local) };
  assert.deepEqual(decideSync(local, cloudDoc(local, 4), meta, acct), { kind: "none" });
  assert.deepEqual(decideSync(played({ ink: 99 }), cloudDoc(local, 4), meta, acct), { kind: "upload", baseRev: 4 });
  assert.deepEqual(decideSync(local, cloudDoc(played({ ink: 7 }), 5), meta, acct), { kind: "adopt" }, "other device moved on, we are clean");
  assert.deepEqual(decideSync(played({ ink: 99 }), cloudDoc(played({ ink: 7 }), 5), meta, acct), { kind: "conflict" }, "both changed");
  // Meta for another account counts as a first binding
  assert.deepEqual(decideSync(played({ ink: 5 }), cloudDoc(local, 4), { ...meta, account: "other" }, acct), { kind: "conflict" });
  assert.equal(cloudPrefix("production"), "cs:prod");
  assert.equal(cloudPrefix("preview"), "cs:preview");
  assert.equal(cloudPrefix(undefined), "cs:dev");
});

/* ── Google ID token (self-signed test key standing in for Google's JWKS) ── */
const CLIENT = "test-client.apps.googleusercontent.com";
const keyPair = (await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const pub = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey;
const jwks: Jwk[] = [{ kid: "k1", kty: "RSA", n: pub.n!, e: pub.e!, alg: "RS256" }];
const enc = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
async function idToken(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1", typ: "JWT" }) {
  const head = `${enc(header)}.${enc(claims)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(head));
  return `${head}.${bytesToB64url(sig)}`;
}
const NOW = 1_800_000_000;
const good = { iss: "https://accounts.google.com", aud: CLIENT, sub: "1234567890", exp: NOW + 600, iat: NOW - 10, email: "player@gmail.com" };
const opts = { clientId: CLIENT, nowS: NOW, getKeys: async () => jwks };

test("google id token verification", async () => {
  const ok = await verifyGoogleIdToken(await idToken(good), opts);
  assert.ok(ok.ok && ok.claims.sub === "1234567890");
  assert.deepEqual(await verifyGoogleIdToken(await idToken({ ...good, aud: "someone-else" }), opts), { ok: false, error: "audience" });
  assert.deepEqual(await verifyGoogleIdToken(await idToken({ ...good, iss: "evil.com" }), opts), { ok: false, error: "issuer" });
  assert.deepEqual(await verifyGoogleIdToken(await idToken({ ...good, exp: NOW - 3600 }), opts), { ok: false, error: "expired" });
  assert.deepEqual(await verifyGoogleIdToken(await idToken(good, { alg: "none", kid: "k1" }), opts), { ok: false, error: "alg" });
  assert.deepEqual(await verifyGoogleIdToken(await idToken(good, { alg: "RS256", kid: "k9" }), opts), { ok: false, error: "kid" });
  const t = await idToken(good);
  const tampered = t.split(".");
  tampered[1] = enc({ ...good, sub: "999" });
  assert.deepEqual(await verifyGoogleIdToken(tampered.join("."), opts), { ok: false, error: "signature" });
  assert.deepEqual(await verifyGoogleIdToken("abc", opts), { ok: false, error: "malformed" });
});

test("session cookie: signed, expiring, account hashed", async () => {
  const acct = await accountId("1234567890", "pep");
  assert.match(acct, /^[0-9a-f]{40}$/);
  assert.notEqual(acct, await accountId("1234567891", "pep"));
  const s = await signSession(acct, NOW + 100, "s".repeat(40));
  assert.equal(await readSession(s, "s".repeat(40), NOW), acct);
  assert.equal(await readSession(s, "t".repeat(40), NOW), null, "wrong secret");
  assert.equal(await readSession(s, "s".repeat(40), NOW + 101), null, "expired");
  assert.equal(await readSession(s.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "s".repeat(40), NOW), null, "tampered");
  assert.equal(readCookie("a=1; qgy_cloud=xyz; b=2", "qgy_cloud"), "xyz");
  assert.equal(maskEmail("player@gmail.com"), "p…r@gmail.com");
});

test("api flow: disabled → signin → upload → conflict (409) → load", async () => {
  const store = new MemoryCloudStore();
  let clock = NOW * 1000;
  const env = { GOOGLE_CLIENT_ID: CLIENT, CLOUD_SESSION_SECRET: "x".repeat(48), VERCEL_ENV: "preview" };
  const deps = { store, env, getKeys: async () => jwks, now: () => clock };
  const url = "https://qgy.test/api/cloud";
  const post = (body: unknown, cookie = "") =>
    handleCloudPost(new Request(url, { method: "POST", body: JSON.stringify(body), headers: { cookie, "x-forwarded-for": "10.0.0.1", "sec-fetch-site": "same-origin" } }), deps);

  // Hidden when not configured
  assert.deepEqual(await (await handleCloudGet(new Request(url), { env: {} })).json(), { enabled: false });
  assert.equal((await handleCloudPost(new Request(url, { method: "POST", body: "{}" }), { env: {} })).status, 404);
  // Cross-site posts are refused
  assert.equal((await handleCloudPost(new Request(url, { method: "POST", body: "{}", headers: { "sec-fetch-site": "cross-site" } }), deps)).status, 403);

  const cfg = await (await handleCloudGet(new Request(url), deps)).json();
  assert.deepEqual(cfg, { enabled: true, clientId: CLIENT, signedIn: false, account: null });

  assert.equal((await post({ op: "signin", credential: await idToken({ ...good, aud: "x" }) })).status, 401);
  const si = await post({ op: "signin", credential: await idToken(good) });
  assert.equal(si.status, 200);
  const setCookie = si.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /Path=\/api\/cloud/);
  const cookie = setCookie.split(";")[0];
  const siBody = await si.json();
  assert.equal(siBody.cloud, null);
  assert.equal(siBody.email, "p…r@gmail.com");
  assert.equal(JSON.stringify(await store.load("cs:preview", (await accountId("1234567890", "qgy-cloud-v1")))), "null");

  assert.equal((await post({ op: "load" })).status, 401, "no cookie → signed out");
  // First upload (baseRev 0) with a cheated 墨玉 amount → clamped
  const up = await post({ op: "save", baseRev: 0, data: { ...played(), ink: 1e12 } }, cookie);
  assert.equal(up.status, 200);
  assert.equal((await up.json()).rev, 1);
  clock += 3000;
  // Second device still thinks rev 0 → conflict with the cloud copy attached
  const stale = await post({ op: "save", baseRev: 0, data: fresh() }, cookie);
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.cloud.rev, 1);
  assert.equal(conflict.cloud.data.ink, INK_CAP);
  clock += 3000;
  // Rate limit: two saves inside 2 s
  assert.equal((await post({ op: "save", baseRev: 1, data: played({ ink: 10 }) }, cookie)).status, 200);
  assert.equal((await post({ op: "save", baseRev: 2, data: played({ ink: 11 }) }, cookie)).status, 429);
  clock += 3000;
  const ld = await (await post({ op: "load" }, cookie)).json();
  assert.equal(ld.cloud.rev, 2);
  assert.equal(ld.cloud.data.ink, 10);
  // Environment isolation: production prefix sees nothing
  const prodLoad = await handleCloudPost(new Request(url, { method: "POST", body: JSON.stringify({ op: "load" }), headers: { cookie, "x-forwarded-for": "10.0.0.2" } }), { ...deps, env: { ...env, VERCEL_ENV: "production" } });
  assert.equal((await prodLoad.json()).cloud, null);
  // Sign out clears the cookie
  const so = await post({ op: "signout" }, cookie);
  assert.match(so.headers.get("set-cookie")!, /Max-Age=0/);
});
