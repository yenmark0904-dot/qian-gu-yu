import { useEffect } from "react";
import { HEARTBEAT_MS, PRESENCE_ID_KEY, describeScreen, newPresenceId, validPresenceId, type ScreenSnapshot } from "@/game/presence";

/**
 * Anonymous "who's online" heartbeat: every 30 s while the tab is visible (paused when hidden), plus one
 * beat on becoming visible and a best-effort "leave" when the page goes away. Reads the current screen from
 * the DOM so no game component needs wiring. Sends no cookies-based identity, no PII.
 */
function presenceId(): string | null {
  try {
    let id = localStorage.getItem(PRESENCE_ID_KEY);
    if (!validPresenceId(id)) {
      id = newPresenceId((n) => crypto.getRandomValues(new Uint8Array(n)));
      localStorage.setItem(PRESENCE_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function nickname(): string | null {
  try {
    const raw = localStorage.getItem("qiangu-yu");
    const nick = raw ? (JSON.parse(raw) as { state?: { sgNick?: unknown } }).state?.sgNick : null;
    return typeof nick === "string" && nick ? nick : null;
  } catch {
    return null;
  }
}

function text(sel: string): string | null {
  const t = document.querySelector(sel)?.textContent?.trim();
  return t ? t.slice(0, 20) : null;
}

export function snapshotScreen(): ScreenSnapshot {
  const q = (sel: string) => !!document.querySelector(sel);
  const m3 = document.querySelector('[role="dialog"][aria-label="三消闖關"]');
  const card = document.querySelector('[role="dialog"]:has([data-testid="codex-hero"])');
  return {
    tab: document.querySelector("[data-tab]")?.getAttribute("data-tab") ?? null,
    survey: q('[data-testid="survey"]'),
    shengongFloor: text('[data-testid="sg-floor-head"] .ink-title'),
    shengongBoard: q('[data-testid="sg-board"]'),
    shengongHome: q('[data-testid="sg-rank"]'),
    match3Level: m3?.querySelector('[data-testid="m3-hud"]') ? (m3.querySelector(".ink-title")?.textContent?.trim().slice(0, 20) ?? "關卡") : null,
    match3Map: !!m3?.querySelector('[data-testid="m3-map"]'),
    summoning: q('[role="dialog"][aria-label="召喚中"]') || q(".ritual-screen"),
    cardName: card?.getAttribute("aria-label")?.slice(0, 20) ?? null,
  };
}

function send(body: Record<string, unknown>, beacon = false) {
  const payload = JSON.stringify(body);
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/presence", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true, credentials: "omit" }).catch(() => {});
  } catch {
    /* offline etc. — presence is best-effort */
  }
}

export function PresenceHeartbeat() {
  useEffect(() => {
    const id = presenceId();
    if (!id) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      send({ id, screen: describeScreen(snapshotScreen()), nick: nickname() });
    };
    const start = () => {
      if (timer) return;
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    const onHide = () => send({ id, leave: true }, true);
    // First beat once the app has painted its first screen.
    const first = setTimeout(onVis, 1500);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearTimeout(first);
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
  return null;
}
