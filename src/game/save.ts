import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { BY_ID } from "@/game/data";
import { migrateLegacySr } from "@/game/migrate";
import type { CloudSave } from "@/game/store";
import { cleanVolumeAwards } from "@/game/levels";

function clean(input: CloudSave): CloudSave {
  input = migrateLegacySr(input);
  const owned: Record<string, number> = {};
  for (const [id, count] of Object.entries(input.owned ?? {})) {
    if (!BY_ID[id]) continue;
    const n = Math.floor(Number(count));
    if (n > 0) owned[id] = Math.min(n, 999);
  }
  const history = (input.history ?? []).filter((id) => typeof id === "string" && BY_ID[id]).slice(0, 40);
  const ink = Math.min(1_000_000, Math.max(0, Math.floor(Number(input.ink) || 0)));
  const pity = Math.min(49, Math.max(0, Math.floor(Number(input.pity) || 0)));
  const totalPulls = Math.min(1_000_000, Math.max(0, Math.floor(Number(input.totalPulls) || 0)));
  const lastDaily = typeof input.lastDaily === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.lastDaily) ? input.lastDaily : null;
  const volumeAwards = cleanVolumeAwards(input.volumeAwards);
  return { ink, pity, owned, totalPulls, lastDaily, history, volumeAwards };
}

export const loadSave = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      ink: number;
      pity: number;
      total_pulls: number;
      last_daily: string | null;
      owned: string;
      history: string;
      volume_awards: string | null;
    }>`select ink, pity, total_pulls, last_daily, owned, history, volume_awards from saves where user_id = ${context.userId}`;
    const row = rows[0];
    if (!row) return null;
    return clean({
      ink: row.ink,
      pity: row.pity,
      totalPulls: row.total_pulls,
      lastDaily: row.last_daily,
      owned: JSON.parse(row.owned) as Record<string, number>,
      history: JSON.parse(row.history) as string[],
      volumeAwards: JSON.parse(row.volume_awards ?? "[]") as number[],
    });
  });

export const writeSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: CloudSave) => clean(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owned = JSON.stringify(data.owned);
    const history = JSON.stringify(data.history);
    // Claimed 卷 are sticky: merge with what the row already has so a stale client can't clear them.
    const prev = await sql<{ volume_awards: string | null }>`select volume_awards from saves where user_id = ${context.userId}`;
    const volumeAwards = JSON.stringify(
      cleanVolumeAwards([...(data.volumeAwards ?? []), ...(JSON.parse(prev[0]?.volume_awards ?? "[]") as number[])]),
    );
    await sql`insert into saves (user_id, ink, pity, total_pulls, last_daily, owned, history, volume_awards)
      values (${context.userId}, ${data.ink}, ${data.pity}, ${data.totalPulls}, ${data.lastDaily}, ${owned}, ${history}, ${volumeAwards})
      on conflict (user_id) do update set
        ink = excluded.ink,
        pity = excluded.pity,
        total_pulls = excluded.total_pulls,
        last_daily = excluded.last_daily,
        owned = excluded.owned,
        history = excluded.history,
        volume_awards = excluded.volume_awards,
        updated_at = now()`;
    return data;
  });
