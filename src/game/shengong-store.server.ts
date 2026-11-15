import { BOARD_SIZE, boardScore, cleanRanksPaid, type PlayerRecord } from "./shengong";

/**
 * 深宮 leaderboard storage. Upstash Redis (durable) when its REST env is present — names set by the Vercel
 * Marketplace integration (KV_REST_API_URL / KV_REST_API_TOKEN) or by Upstash directly
 * (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Otherwise the app's own DB (`@/lib/db`): Neon when
 * DATABASE_URL is set, else the embedded PGLite — which on Vercel lives only as long as a server instance.
 */
export interface LeaderboardStore {
  readonly kind: "redis" | "db";
  readonly durable: boolean;
  get(deviceId: string): Promise<PlayerRecord | null>;
  put(record: PlayerRecord): Promise<void>;
  /** Top named players, best first. */
  top(limit: number): Promise<PlayerRecord[]>;
  /** 1-based position a record would hold among named players (ties share the better place). */
  positionOf(record: PlayerRecord): Promise<number>;
  remove(deviceId: string): Promise<void>;
}

function env(key: string) {
  const v = process.env[key]?.trim();
  return v || undefined;
}

function parseRecord(raw: unknown, deviceId: string): PlayerRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const floor = Math.max(0, Math.floor(Number(r.floor) || 0));
  return {
    deviceId,
    nickname: typeof r.nickname === "string" && r.nickname ? r.nickname : null,
    floor,
    total: Math.max(0, Math.floor(Number(r.total) || 0)),
    lastScore: Math.max(0, Math.floor(Number(r.lastScore) || 0)),
    ranksPaid: cleanRanksPaid(r.ranksPaid, floor),
    updatedAt: Math.max(0, Math.floor(Number(r.updatedAt) || 0)),
  };
}

/* ── Upstash Redis over REST (no SDK needed) ─────────────────────────── */

const KEY_BOARD = "sg:board";
const keyPlayer = (id: string) => `sg:p:${id}`;

class RedisStore implements LeaderboardStore {
  readonly kind = "redis" as const;
  readonly durable = true;
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async pipe(commands: (string | number)[][]): Promise<unknown[]> {
    const res = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`redis HTTP ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    return out.map((x) => {
      if (x.error) throw new Error(`redis: ${x.error}`);
      return x.result;
    });
  }

  async get(deviceId: string) {
    const [raw] = await this.pipe([["GET", keyPlayer(deviceId)]]);
    if (typeof raw !== "string") return null;
    try {
      return parseRecord(JSON.parse(raw), deviceId);
    } catch {
      return null;
    }
  }

  async put(record: PlayerRecord) {
    const cmds: (string | number)[][] = [["SET", keyPlayer(record.deviceId), JSON.stringify(record)]];
    // Only named players are ranked on the board.
    if (record.nickname) cmds.push(["ZADD", KEY_BOARD, boardScore(record.floor, record.total), record.deviceId]);
    await this.pipe(cmds);
  }

  async top(limit: number) {
    const [ids] = await this.pipe([["ZRANGE", KEY_BOARD, 0, Math.min(BOARD_SIZE, limit) - 1, "REV"]]);
    const list = Array.isArray(ids) ? (ids as string[]) : [];
    if (!list.length) return [];
    const [raws] = await this.pipe([["MGET", ...list.map(keyPlayer)]]);
    const vals = Array.isArray(raws) ? raws : [];
    const out: PlayerRecord[] = [];
    list.forEach((id, i) => {
      try {
        const rec = typeof vals[i] === "string" ? parseRecord(JSON.parse(vals[i] as string), id) : null;
        if (rec?.nickname) out.push(rec);
      } catch {
        /* skip a corrupt row */
      }
    });
    return out;
  }

  async positionOf(record: PlayerRecord) {
    const [n] = await this.pipe([["ZCOUNT", KEY_BOARD, `(${boardScore(record.floor, record.total)}`, "+inf"]]);
    return Number(n ?? 0) + 1;
  }

  async remove(deviceId: string) {
    await this.pipe([
      ["ZREM", KEY_BOARD, deviceId],
      ["DEL", keyPlayer(deviceId)],
    ]);
  }
}

/* ── Fallback: the app DB (Neon or PGLite) ───────────────────────────── */

type Row = { device_id: string; nickname: string | null; floor: number; total: number; last_score: number; ranks_paid: string; updated_at: number };

function fromRow(r: Row): PlayerRecord | null {
  let paid: unknown = [];
  try {
    paid = JSON.parse(r.ranks_paid);
  } catch {
    paid = [];
  }
  return parseRecord({ nickname: r.nickname, floor: r.floor, total: r.total, lastScore: r.last_score, ranksPaid: paid, updatedAt: r.updated_at }, r.device_id);
}

class DbStore implements LeaderboardStore {
  readonly kind = "db" as const;
  readonly durable: boolean;
  constructor() {
    this.durable = !!env("DATABASE_URL");
  }
  private async sql() {
    const { getSql } = await import("@/lib/db");
    return getSql();
  }
  async get(deviceId: string) {
    const sql = await this.sql();
    const rows = await sql<Row>`select * from shengong_board where device_id = ${deviceId}`;
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async put(r: PlayerRecord) {
    const sql = await this.sql();
    await sql`insert into shengong_board (device_id, nickname, floor, total, last_score, ranks_paid, updated_at)
      values (${r.deviceId}, ${r.nickname}, ${r.floor}, ${r.total}, ${r.lastScore}, ${JSON.stringify(r.ranksPaid)}, ${r.updatedAt})
      on conflict (device_id) do update set nickname = excluded.nickname, floor = excluded.floor, total = excluded.total,
        last_score = excluded.last_score, ranks_paid = excluded.ranks_paid, updated_at = excluded.updated_at`;
  }
  async top(limit: number) {
    const sql = await this.sql();
    const rows = await sql<Row>`select * from shengong_board where nickname is not null
      order by floor desc, total desc, updated_at asc limit ${Math.min(BOARD_SIZE, limit)}`;
    return rows.map(fromRow).filter((x): x is PlayerRecord => !!x);
  }
  async positionOf(r: PlayerRecord) {
    const sql = await this.sql();
    const rows = await sql<{ n: number }>`select count(*) as n from shengong_board where nickname is not null
      and (floor > ${r.floor} or (floor = ${r.floor} and total > ${r.total}))`;
    return Number(rows[0]?.n ?? 0) + 1;
  }
  async remove(deviceId: string) {
    const sql = await this.sql();
    await sql`delete from shengong_board where device_id = ${deviceId}`;
  }
}

const g = globalThis as typeof globalThis & { __qgyShengongStore__?: LeaderboardStore };

export function leaderboardStore(): LeaderboardStore {
  if (g.__qgyShengongStore__) return g.__qgyShengongStore__;
  const url = env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");
  g.__qgyShengongStore__ = url && token ? new RedisStore(url, token) : new DbStore();
  return g.__qgyShengongStore__;
}
