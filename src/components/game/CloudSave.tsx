import { mergeRaid } from "@/game/raid";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Cloud, CloudAlert, RefreshCw, X } from "lucide-react";
import { cn } from "@/components/game/bits";
import { DEVICE_KEY } from "@/game/feedback";
import { useSave } from "@/game/store";
import {
  SNAPSHOT_KEYS,
  decideSync,
  fingerprint,
  sanitizeSnapshot,
  summarize,
  type CloudDoc,
  type SaveSummary,
  type Snapshot,
  type SyncMeta,
} from "@/game/cloud-save";

/**
 * 雲端存檔 — 綁定 Google 帳號. Google Identity Services gives an ID token; /api/cloud verifies it and sets an
 * httpOnly session cookie. Progress auto-saves (debounced) and syncs on load; when this device and the cloud
 * both changed, the player chooses 「用雲端進度」 or 「用這台裝置的進度」. Hidden when the server has no
 * GOOGLE_CLIENT_ID.
 */

const META_KEY = "qgy-cloud-v1";
const SAVE_DEBOUNCE_MS = 3000;

type Status = "off" | "checking" | "signedOut" | "syncing" | "synced" | "error" | "conflict";
type State = {
  status: Status;
  clientId: string | null;
  email: string | null;
  lastSync: number | null;
  sheet: boolean;
  conflict: { cloud: CloudDoc; local: Snapshot } | null;
  note: string | null;
};

let state: State = {
  status: "off",
  clientId: null,
  email: null,
  lastSync: null,
  sheet: false,
  conflict: null,
  note: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useCloud() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
export const openCloudSheet = () => set({ sheet: true });

/* ── local side ─────────────────────────────────────────────────────── */

type Meta = SyncMeta & { email?: string | null; at?: number };
function readMeta(): Meta | null {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? "null") as Meta | null;
    return m && typeof m.account === "string" && typeof m.rev === "number" ? m : null;
  } catch {
    return null;
  }
}
function writeMeta(m: Meta | null) {
  try {
    if (m) localStorage.setItem(META_KEY, JSON.stringify(m));
    else localStorage.removeItem(META_KEY);
  } catch {
    /* private mode */
  }
}

function localSnapshot(): Snapshot {
  const s = useSave.getState() as unknown as Record<string, unknown>;
  const raw: Record<string, unknown> = {};
  for (const k of SNAPSHOT_KEYS) if (k !== "deviceId") raw[k] = s[k];
  try {
    raw.deviceId = localStorage.getItem(DEVICE_KEY);
  } catch {
    raw.deviceId = null;
  }
  const r = sanitizeSnapshot(raw);
  return r.ok ? r.data : (sanitizeSnapshot({}) as { ok: true; data: Snapshot }).data;
}

/** Replace local progress with a cloud snapshot, through the store's own load-time cleaning. */
function applySnapshot(data: Snapshot) {
  const { deviceId, ...rest } = data;
  const cur = useSave.getState();
  const merge = useSave.persist.getOptions().merge;
  const next = merge ? merge(rest, cur) : { ...cur, ...rest };
  useSave.setState({
    ...(next as object),
    raid: mergeRaid(cur.raid, next.raid),
    muted: cur.muted,
  } as Partial<typeof cur>);
  if (deviceId) {
    try {
      localStorage.setItem(DEVICE_KEY, deviceId); // the 深宮 leaderboard record follows the account
    } catch {
      /* ignore */
    }
  }
}

/* ── server calls ───────────────────────────────────────────────────── */

async function api<T>(body: Record<string, unknown>): Promise<{ status: number; body: T }> {
  const res = await fetch("/api/cloud", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    keepalive: body.op === "save",
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

let account: string | null = null;
let saving = false;
let pending = false;

function markSynced(rev: number, at = Date.now()) {
  const local = localSnapshot();
  const m: Meta = { account: account!, rev, synced: fingerprint(local), email: state.email, at };
  writeMeta(m);
  set({ status: "synced", lastSync: at, note: null });
}

async function act(cloud: CloudDoc | null): Promise<void> {
  if (!account) return;
  const local = localSnapshot();
  const action = decideSync(local, cloud, readMeta(), account);
  if (action.kind === "none") return markSynced(cloud?.rev ?? 0, cloud?.updatedAt);
  if (action.kind === "adopt" && cloud) {
    applySnapshot(cloud.data);
    return markSynced(cloud.rev, cloud.updatedAt);
  }
  if (action.kind === "upload") return upload(action.baseRev);
  if (cloud) set({ status: "conflict", conflict: { cloud, local }, sheet: false });
}

async function upload(baseRev: number): Promise<void> {
  if (!account) return;
  if (saving) {
    pending = true;
    return;
  }
  saving = true;
  set({ status: "syncing" });
  try {
    const local = localSnapshot();
    const r = await api<{
      rev?: number;
      updatedAt?: number;
      cloud?: CloudDoc | null;
      error?: string;
    }>({ op: "save", baseRev, data: local });
    if (r.status === 200 && r.body.rev) {
      const m: Meta = {
        account,
        rev: r.body.rev,
        synced: fingerprint(local),
        email: state.email,
        at: r.body.updatedAt,
      };
      writeMeta(m);
      set({ status: "synced", lastSync: r.body.updatedAt ?? Date.now(), note: null });
    } else if (r.status === 409) {
      saving = false;
      return act(r.body.cloud ?? null);
    } else if (r.status === 401) {
      signedOutLocally("登入已過期，請重新綁定。");
    } else if (r.status === 429) {
      pending = true;
    } else {
      set({ status: "error", note: "雲端暫時連不上，稍後會再試。" });
    }
  } catch {
    set({ status: "error", note: "網路不穩，稍後會再試。" });
  } finally {
    saving = false;
    if (pending) {
      pending = false;
      schedule(2500);
    }
  }
}

function signedOutLocally(note: string | null) {
  account = null;
  writeMeta(null);
  set({ status: "signedOut", email: null, lastSync: null, conflict: null, note });
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule(ms = SAVE_DEBOUNCE_MS) {
  if (!account || state.status === "conflict") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, ms);
}
async function flush() {
  if (!account || state.status === "conflict") return;
  const m = readMeta();
  if (m && m.account === account && fingerprint(localSnapshot()) === m.synced) return;
  await upload(m && m.account === account ? m.rev : 0);
}

export async function syncNow() {
  if (!account) return;
  set({ status: "syncing" });
  try {
    const r = await api<{ cloud?: CloudDoc | null }>({ op: "load" });
    if (r.status === 401) return signedOutLocally("登入已過期，請重新綁定。");
    if (r.status !== 200) return set({ status: "error", note: "雲端暫時連不上，稍後會再試。" });
    await act(r.body.cloud ?? null);
  } catch {
    set({ status: "error", note: "網路不穩，稍後會再試。" });
  }
}

async function onCredential(credential: string) {
  set({ status: "syncing", note: null });
  try {
    const r = await api<{
      account?: string;
      email?: string | null;
      cloud?: CloudDoc | null;
      error?: string;
    }>({ op: "signin", credential });
    if (r.status !== 200 || !r.body.account)
      return set({ status: "signedOut", note: "綁定失敗，請再試一次。" });
    account = r.body.account;
    set({ email: r.body.email ?? null });
    await act(r.body.cloud ?? null);
  } catch {
    set({ status: "signedOut", note: "網路不穩，請再試一次。" });
  }
}

export async function signOut() {
  await api({ op: "signout" }).catch(() => {});
  try {
    (
      window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } }
    ).google?.accounts?.id?.disableAutoSelect?.();
  } catch {
    /* ignore */
  }
  signedOutLocally("已登出此裝置。進度仍保留在這台裝置與雲端。");
}

export async function resolveConflict(choice: "cloud" | "local") {
  const c = state.conflict;
  if (!c || !account) return;
  set({ conflict: null, status: "syncing" });
  if (choice === "cloud") {
    applySnapshot(c.cloud.data);
    markSynced(c.cloud.rev, c.cloud.updatedAt);
  } else {
    await upload(c.cloud.rev);
  }
}

/* ── boot ───────────────────────────────────────────────────────────── */

function previewDemo(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("cloudtest");
  const host = window.location.hostname;
  const ok =
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^qian-gu-[a-z0-9]{9}-[a-z0-9-]+\.vercel\.app$/.test(host);
  return ok ? q : null;
}

function hydrated(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (useSave.persist.hasHydrated()) return resolve();
    const un = useSave.persist.onFinishHydration(() => {
      un();
      resolve();
    });
  });
}

let booted = false;
async function boot() {
  if (booted) return;
  booted = true;
  const demo = previewDemo();
  if (demo) {
    await hydrated();
    return bootDemo(demo);
  }
  set({ status: "checking" });
  let cfg: { enabled?: boolean; clientId?: string; signedIn?: boolean; account?: string | null };
  try {
    cfg = await (await fetch("/api/cloud", { credentials: "same-origin" })).json();
  } catch {
    return set({ status: "off" });
  }
  if (!cfg.enabled || !cfg.clientId) return set({ status: "off" });
  await hydrated();
  const meta = readMeta();
  set({ clientId: cfg.clientId, email: meta?.email ?? null, lastSync: meta?.at ?? null });
  if (cfg.signedIn && cfg.account) {
    account = cfg.account;
    await syncNow();
  } else {
    if (meta) writeMeta(null);
    set({ status: "signedOut", note: meta ? "登入已過期，請重新綁定。" : null });
  }
  useSave.subscribe(() => schedule());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        void flush();
      }
    } else if (account) void syncNow();
  });
}

/** Preview-only (`?cloudtest=signedout|synced|conflict`): fake states for screenshots, no network. */
function bootDemo(kind: string) {
  const local = localSnapshot();
  const cloudData: Snapshot = {
    ...local,
    ink: 12800,
    marks: 340,
    totalPulls: 96,
    sgBest: 23,
    owned: { ...local.owned },
    m3: {
      "1": { stars: 3, best: 3000 },
      "2": { stars: 3, best: 3000 },
      "3": { stars: 2, best: 2000 },
    },
  };
  set({ clientId: "demo", email: kind === "signedout" ? null : "p…r@gmail.com" });
  if (kind === "conflict")
    set({
      status: "conflict",
      conflict: { cloud: { rev: 7, data: cloudData, updatedAt: Date.now() - 3600_000 }, local },
    });
  else if (kind === "synced") set({ status: "synced", lastSync: Date.now() - 20_000, sheet: true });
  else set({ status: "signedOut", sheet: true });
}

/* ── Google Identity Services ───────────────────────────────────────── */

type Gis = {
  accounts: {
    id: {
      initialize: (o: Record<string, unknown>) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
      disableAutoSelect: () => void;
    };
  };
};
let gisPromise: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error("gis")));
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("gis"));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function GoogleButton({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (clientId === "demo") return;
    let alive = true;
    loadGis()
      .then((g) => {
        if (!alive || !ref.current) return;
        g.accounts.id.initialize({
          client_id: clientId,
          callback: (r: { credential?: string }) => r.credential && void onCredential(r.credential),
          ux_mode: "popup",
          itp_support: true,
          use_fedcm_for_button: false,
        });
        g.accounts.id.renderButton(ref.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
          locale: "zh-TW",
          width: Math.min(300, ref.current.clientWidth || 300),
        });
      })
      .catch(() => alive && set({ note: "無法載入 Google 登入，請檢查網路後再試。" }));
    return () => {
      alive = false;
    };
  }, [clientId]);
  return (
    <div
      ref={ref}
      className="cloud-gbtn flex min-h-11 w-full justify-center"
      data-testid="cloud-google-button"
    >
      {clientId === "demo" ? <span className="cloud-gbtn-demo">使用 Google 帳號繼續</span> : null}
    </div>
  );
}

/* ── UI ─────────────────────────────────────────────────────────────── */

const taipei = (ms: number | null) =>
  ms
    ? new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(ms)
    : "—";

/** Always-mounted (in the top bar, no visible UI): boots the sync engine and hosts the sheet / conflict dialog. */
export function CloudHost() {
  useEffect(() => {
    void boot();
  }, []);
  return <CloudLayer />;
}

/** Home-screen entry: 「綁定 Google 帳號」 until bound, then a small sync-status chip that opens the sheet. */
export function CloudBindChip() {
  const s = useCloud();
  if (s.status === "off" || s.status === "checking") return null;
  if (s.status === "signedOut")
    return (
      <button
        type="button"
        className="cloud-chip inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs"
        onClick={openCloudSheet}
        data-testid="cloud-bind-chip"
      >
        <Cloud className="h-3.5 w-3.5" aria-hidden />
        綁定 Google 帳號 · 換機不怕進度消失
      </button>
    );
  const Icon = s.status === "error" || s.status === "conflict" ? CloudAlert : Cloud;
  const label =
    s.status === "syncing"
      ? "同步中…"
      : s.status === "error"
        ? "雲端暫時無法同步"
        : s.status === "conflict"
          ? "請選擇要保留的進度"
          : "雲端存檔 · 已同步";
  return (
    <button
      type="button"
      className={cn(
        "cloud-chip cloud-chip-bound inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs",
        `cloud-${s.status}`,
      )}
      onClick={openCloudSheet}
      data-testid="cloud-button"
      data-status={s.status}
    >
      <Icon className={cn("h-3.5 w-3.5", s.status === "syncing" && "cloud-pulse")} aria-hidden />
      {label}
    </button>
  );
}

function CloudLayer() {
  const s = useCloud();
  if (typeof document === "undefined" || (!s.sheet && !(s.status === "conflict" && s.conflict)))
    return null;
  // Portal to the game stage (keeps its theme colours) — not inside the top bar, which may create a
  // containing block (backdrop-filter) for fixed children.
  const host = document.querySelector<HTMLElement>(".ink-stage") ?? document.body;
  return createPortal(
    <>
      {s.sheet ? <CloudSheet /> : null}
      {s.status === "conflict" && s.conflict ? <ConflictDialog /> : null}
    </>,
    host,
  );
}

function SummaryList({ sum }: { sum: SaveSummary }) {
  return (
    <dl className="cloud-sum grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
      <dt>墨玉</dt>
      <dd className="tabular-nums">{sum.ink.toLocaleString()}</dd>
      <dt>墨痕</dt>
      <dd className="tabular-nums">{sum.marks.toLocaleString()}</dd>
      <dt>相逢</dt>
      <dd className="tabular-nums">{sum.cards} 位</dd>
      <dt>召喚</dt>
      <dd className="tabular-nums">{sum.pulls} 次</dd>
      <dt>深宮</dt>
      <dd className="tabular-nums">{sum.sgBest ? `第 ${sum.sgBest} 層` : "未登層"}</dd>
      <dt>三消</dt>
      <dd className="tabular-nums">{sum.m3Stars} 星</dd>
    </dl>
  );
}

function CloudSheet() {
  const s = useCloud();
  const close = () => set({ sheet: false });
  const signedIn = s.status !== "signedOut";
  return (
    <div
      className="cloud-modal ink-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={close}
      data-testid="cloud-sheet"
    >
      <div
        className="cloud-sheet safe-bottom w-full max-w-md rounded-t-2xl px-5 pb-6 pt-5 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="cloud-title" className="font-serif text-xl tracking-[0.3em] text-fg">
            雲端存檔
          </h2>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full text-muted"
            onClick={close}
            aria-label="關閉"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {!signedIn ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-fg/85">
              綁定 Google
              帳號，進度會自動存到雲端。換手機時，用同一個帳號登入就能接續——墨玉、相逢的人、深宮位號與排行都會跟著你。
            </p>
            <div className="cloud-local mt-4 rounded-xl p-3">
              <p className="mb-2 text-xs tracking-widest text-muted">這台裝置目前的進度</p>
              <SummaryList sum={summarize(localSnapshot())} />
            </div>
            <div className="mt-5">{s.clientId ? <GoogleButton clientId={s.clientId} /> : null}</div>
            <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-muted">
              只保存遊戲進度；不保存你的 Email、姓名或照片。
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-fg/85" data-testid="cloud-bound">
              已綁定 Google 帳號{s.email ? <span className="text-gold"> {s.email}</span> : null}
            </p>
            <p className="mt-1 text-xs text-muted" data-testid="cloud-state">
              {s.status === "syncing"
                ? "同步中…"
                : s.status === "error"
                  ? "暫時無法同步"
                  : `已同步 · ${taipei(s.lastSync)}`}
            </p>
            <div className="cloud-local mt-4 rounded-xl p-3">
              <p className="mb-2 text-xs tracking-widest text-muted">目前進度（自動存到雲端）</p>
              <SummaryList sum={summarize(localSnapshot())} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                className="ink-ghost flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm"
                onClick={() => void syncNow()}
                data-testid="cloud-sync"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                立即同步
              </button>
              <button
                type="button"
                className="ink-ghost min-h-11 rounded-xl text-sm text-muted"
                onClick={() => void signOut()}
                data-testid="cloud-signout"
              >
                登出此裝置
              </button>
            </div>
          </>
        )}
        {s.note ? (
          <p className="mt-3 text-center text-xs text-[#e8a08f]" role="status">
            {s.note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ConflictDialog() {
  const s = useCloud();
  const c = s.conflict!;
  return (
    <div
      className="cloud-modal ink-overlay fixed inset-0 z-[60] grid place-items-center p-4"
      data-testid="cloud-conflict"
    >
      <div
        className="cloud-sheet w-full max-w-md rounded-2xl px-5 pb-5 pt-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-conflict-title"
      >
        <h2
          id="cloud-conflict-title"
          className="text-center font-serif text-lg tracking-[0.25em] text-fg"
        >
          兩份進度不同
        </h2>
        <p className="mt-2 text-center text-xs leading-relaxed text-muted">
          雲端與這台裝置各有進度。選一份保留，另一份會被取代。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="cloud-side rounded-xl p-3" data-testid="cloud-side-cloud">
            <p className="mb-2 flex items-center gap-1 text-xs tracking-widest text-gold">
              <Cloud className="h-3.5 w-3.5" aria-hidden />
              雲端
            </p>
            <SummaryList sum={summarize(c.cloud.data)} />
            <p className="mt-2 text-[0.65rem] text-muted">存於 {taipei(c.cloud.updatedAt)}</p>
          </div>
          <div className="cloud-side rounded-xl p-3" data-testid="cloud-side-local">
            <p className="mb-2 text-xs tracking-widest text-gold">這台裝置</p>
            <SummaryList sum={summarize(c.local)} />
            <p className="mt-2 text-[0.65rem] text-muted">尚未上傳</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="cloud-choose min-h-12 rounded-xl text-sm"
            onClick={() => void resolveConflict("cloud")}
            data-testid="cloud-use-cloud"
          >
            用雲端進度
          </button>
          <button
            type="button"
            className="cloud-choose min-h-12 rounded-xl text-sm"
            onClick={() => void resolveConflict("local")}
            data-testid="cloud-use-local"
          >
            用這台裝置的進度
          </button>
        </div>
      </div>
    </div>
  );
}
