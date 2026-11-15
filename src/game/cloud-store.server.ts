import type { CloudDoc } from "./cloud-save.ts";
import { restPipe, type Pipe } from "./presence-store.server.ts";

/**
 * 雲端存檔 storage: one JSON doc per (environment, account) — key `<prefix>:a:<account>` where account is
 * a salted SHA-256 of the Google `sub` (no email, no name stored). Upstash Redis when configured, else an
 * in-memory map (local dev). Saves are compare-and-set on `rev` so two devices can't silently clobber.
 */
export type SaveOutcome = { ok: true; rev: number } | { ok: false; conflict: CloudDoc | null };

export interface CloudStore {
  readonly kind: "redis" | "memory";
  load(prefix: string, account: string): Promise<CloudDoc | null>;
  /** Store `doc` (whose rev must be baseRev + 1) only if the current rev equals baseRev (0 = none yet). */
  save(prefix: string, account: string, baseRev: number, doc: CloudDoc): Promise<SaveOutcome>;
}

export const CAS_SCRIPT = `local cur = redis.call('GET', KEYS[1])
local rev = 0
if cur then rev = tonumber(cjson.decode(cur)['rev']) or 0 end
if rev ~= tonumber(ARGV[1]) then return {0, cur or ''} end
redis.call('SET', KEYS[1], ARGV[2])
return {1, ''}`;

function parseDoc(raw: unknown): CloudDoc | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const d = JSON.parse(raw) as CloudDoc;
    return d && typeof d.rev === "number" && d.data && typeof d.data === "object" ? d : null;
  } catch {
    return null;
  }
}

export class RedisCloudStore implements CloudStore {
  readonly kind = "redis" as const;
  private pipe: Pipe;
  constructor(pipe: Pipe) {
    this.pipe = pipe;
  }
  async load(prefix: string, account: string) {
    const [raw] = await this.pipe([["GET", `${prefix}:a:${account}`]]);
    return parseDoc(raw);
  }
  async save(prefix: string, account: string, baseRev: number, doc: CloudDoc): Promise<SaveOutcome> {
    const [res] = await this.pipe([["EVAL", CAS_SCRIPT, 1, `${prefix}:a:${account}`, baseRev, JSON.stringify(doc)]]);
    const arr = Array.isArray(res) ? res : [];
    if (Number(arr[0]) === 1) return { ok: true, rev: doc.rev };
    return { ok: false, conflict: parseDoc(arr[1]) };
  }
}

export class MemoryCloudStore implements CloudStore {
  readonly kind = "memory" as const;
  private docs = new Map<string, string>();
  async load(prefix: string, account: string) {
    return parseDoc(this.docs.get(`${prefix}:a:${account}`));
  }
  async save(prefix: string, account: string, baseRev: number, doc: CloudDoc): Promise<SaveOutcome> {
    const key = `${prefix}:a:${account}`;
    const cur = parseDoc(this.docs.get(key));
    if ((cur?.rev ?? 0) !== baseRev) return { ok: false, conflict: cur };
    this.docs.set(key, JSON.stringify(doc));
    return { ok: true, rev: doc.rev };
  }
}

const env = (k: string) => process.env[k]?.trim() || undefined;
const g = globalThis as typeof globalThis & { __qgyCloudStore__?: CloudStore };
export function cloudStore(): CloudStore {
  if (g.__qgyCloudStore__) return g.__qgyCloudStore__;
  const url = env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");
  return (g.__qgyCloudStore__ = url && token ? new RedisCloudStore(restPipe(url, token)) : new MemoryCloudStore());
}
