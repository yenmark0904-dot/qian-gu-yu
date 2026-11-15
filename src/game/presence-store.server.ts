import { MAX_TRACKED, PRESENCE_TTL_MS, type PresenceEntry } from "./presence.ts";

/**
 * Presence storage. Upstash Redis over REST when KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_*) is set,
 * else an in-memory map (per server instance — fine for local dev). Layout per environment prefix P:
 *   P:z          sorted set  member = presence id, score = lastSeen (ms)
 *   P:s:<id>     string      JSON {screen, nick}, expires after the TTL
 */
export interface PresenceStore {
  readonly kind: "redis" | "memory";
  beat(prefix: string, entry: PresenceEntry): Promise<void>;
  leave(prefix: string, id: string): Promise<void>;
  list(prefix: string, now: number): Promise<PresenceEntry[]>;
}

export type Pipe = (commands: (string | number)[][]) => Promise<unknown[]>;

/** Commands for one heartbeat (exported for tests). */
export function beatCommands(prefix: string, e: PresenceEntry): (string | number)[][] {
  const ttlSec = Math.ceil(PRESENCE_TTL_MS / 1000);
  return [
    ["SET", `${prefix}:s:${e.id}`, JSON.stringify({ screen: e.screen, nick: e.nick }), "EX", ttlSec],
    ["ZADD", `${prefix}:z`, e.lastSeen, e.id],
    ["ZREMRANGEBYSCORE", `${prefix}:z`, "-inf", `(${e.lastSeen - PRESENCE_TTL_MS}`],
    // Keep the set bounded: drop the oldest beyond the cap.
    ["ZREMRANGEBYRANK", `${prefix}:z`, 0, -(MAX_TRACKED + 1)],
    ["EXPIRE", `${prefix}:z`, ttlSec * 4],
  ];
}

export class RedisPresenceStore implements PresenceStore {
  readonly kind = "redis" as const;
  private pipe: Pipe;
  constructor(pipe: Pipe) {
    this.pipe = pipe;
  }
  async beat(prefix: string, e: PresenceEntry) {
    await this.pipe(beatCommands(prefix, e));
  }
  async leave(prefix: string, id: string) {
    await this.pipe([["ZREM", `${prefix}:z`, id], ["DEL", `${prefix}:s:${id}`]]);
  }
  async list(prefix: string, now: number): Promise<PresenceEntry[]> {
    const [, ranged] = await this.pipe([
      ["ZREMRANGEBYSCORE", `${prefix}:z`, "-inf", `(${now - PRESENCE_TTL_MS}`],
      ["ZRANGE", `${prefix}:z`, 0, -1, "WITHSCORES"],
    ]);
    const flat = Array.isArray(ranged) ? (ranged as unknown[]).map(String) : [];
    const ids: string[] = [];
    const seen: number[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      ids.push(flat[i]);
      seen.push(Number(flat[i + 1]) || 0);
    }
    if (!ids.length) return [];
    const [vals] = await this.pipe([["MGET", ...ids.map((id) => `${prefix}:s:${id}`)]]);
    const arr = Array.isArray(vals) ? (vals as unknown[]) : [];
    const out: PresenceEntry[] = [];
    ids.forEach((id, i) => {
      const raw = arr[i];
      if (typeof raw !== "string") return; // detail expired → treat as gone
      try {
        const v = JSON.parse(raw) as { screen?: unknown; nick?: unknown };
        out.push({ id, screen: typeof v.screen === "string" ? v.screen : "未知", nick: typeof v.nick === "string" ? v.nick : null, lastSeen: seen[i] });
      } catch {
        /* skip */
      }
    });
    return out;
  }
}

export class MemoryPresenceStore implements PresenceStore {
  readonly kind = "memory" as const;
  private data = new Map<string, Map<string, PresenceEntry>>();
  private bucket(prefix: string) {
    let b = this.data.get(prefix);
    if (!b) this.data.set(prefix, (b = new Map()));
    return b;
  }
  async beat(prefix: string, e: PresenceEntry) {
    const b = this.bucket(prefix);
    b.set(e.id, { ...e });
    for (const [id, v] of b) if (e.lastSeen - v.lastSeen > PRESENCE_TTL_MS) b.delete(id);
    if (b.size > MAX_TRACKED) {
      const oldest = [...b.values()].sort((x, y) => x.lastSeen - y.lastSeen).slice(0, b.size - MAX_TRACKED);
      for (const o of oldest) b.delete(o.id);
    }
  }
  async leave(prefix: string, id: string) {
    this.bucket(prefix).delete(id);
  }
  async list(prefix: string, now: number) {
    return [...this.bucket(prefix).values()].filter((v) => now - v.lastSeen <= PRESENCE_TTL_MS);
  }
}

function env(key: string) {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function restPipe(url: string, token: string): Pipe {
  return async (commands) => {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`presence redis http ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string }[];
    const err = body.find((r) => r?.error);
    if (err) throw new Error(`presence redis: ${err.error}`);
    return body.map((r) => r?.result);
  };
}

const g = globalThis as typeof globalThis & { __qgyPresenceStore__?: PresenceStore };
export function presenceStore(): PresenceStore {
  if (g.__qgyPresenceStore__) return g.__qgyPresenceStore__;
  const url = env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");
  return (g.__qgyPresenceStore__ = url && token ? new RedisPresenceStore(restPipe(url, token)) : new MemoryPresenceStore());
}
