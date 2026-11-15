/** Presentation-only media: exact raid enemy IDs, never shared story art keys. */
export type RaidEnemyMedia = { video: string; poster: string; position: string };
export const RAID_ENEMY_MEDIA: Readonly<Record<string, RaidEnemyMedia>> = Object.freeze({
  "raid-ink-shadow": { video: "/raid/moe-normal.mp4", poster: "/raid/moe-normal.webp", position: "center" },
  "raid-elite-colossus": { video: "/raid/moe-elite.mp4", poster: "/raid/moe-elite.webp", position: "center" },
  "raid-sovereign-abyss": { video: "/raid/moe-sovereign.mp4", poster: "/raid/moe-sovereign.webp", position: "center 15%" },
});
export function raidEnemyMedia(id: string): RaidEnemyMedia | undefined {
  return Object.hasOwn(RAID_ENEMY_MEDIA, id) ? RAID_ENEMY_MEDIA[id] : undefined;
}
