import { UNLOCK_AT, UNLOCK_NAMES } from "./artifacts.ts";

/**
 * Dev / QA only: `?dev-mingqi` or localStorage qgy-dev-mingqi=1 opens 命器閣 before 第 5 關.
 * Ignored in production builds, so players can never skip the 第 5 關 gate or its gift timing.
 */
export function devArtifacts(): boolean {
  if (typeof window === "undefined") return false;
  if ((import.meta as { env?: { PROD?: boolean } }).env?.PROD) return false;
  try {
    return (
      new URLSearchParams(window.location.search).has("dev-mingqi") ||
      window.localStorage.getItem("qgy-dev-mingqi") === "1"
    );
  } catch {
    return false;
  }
}

/** 第 5 關 gate text for the hall entry. */
export const VAULT_GATE_TEXT = `通關第 ${UNLOCK_AT.vault} 關開啟${UNLOCK_NAMES.vault}`;
