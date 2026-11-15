import { BY_ID } from "./data.ts";

/** Avatar must be an owned character id, or null (遇 seal). */
export function resolveAvatarId(owned: Record<string, number>, id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(BY_ID, id)) return null;
  if ((owned[id] ?? 0) <= 0) return null;
  return id;
}
