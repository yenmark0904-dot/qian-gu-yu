import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Crown, ListOrdered } from "lucide-react";
import { cn, MoYu } from "@/components/game/bits";
import { Game } from "@/components/game/Match3";
import { DEVICE_KEY } from "@/game/feedback";
import {
  NICK_MAX,
  NICK_MIN,
  RANKS,
  cleanNickname,
  floorDef,
  floorsToNextRank,
  isTrialFloor,
  rankForFloor,
  rankIndexForFloor,
  scoreBounds,
  type BoardRow,
} from "@/game/shengong";
import { sgBoard, sgForget, sgNickname, sgSubmit } from "@/game/shengong-api";
import type { BoardResult } from "@/game/shengong.server";
import { useSave } from "@/game/store";

/** Same anonymous id as the survey (no account needed). */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Date.now().toString(36)}`;
  }
}

/** Test-only shortcut (?sgtest=1), never on a production domain: clears the next floor with a plausible score. */
function testMode() {
  if (typeof window === "undefined") return false;
  if (!new URLSearchParams(window.location.search).has("sgtest")) return false;
  const host = window.location.hostname;
  // Only on localhost or hashed per-deployment preview URLs — never on a production domain.
  return host === "localhost" || host === "127.0.0.1" || /^qian-gu-[a-z0-9]{9}-[a-z0-9-]+\.vercel\.app$/.test(host);
}

type View = { kind: "home" } | { kind: "play"; floor: number; run: number } | { kind: "board" };
type Promotion = { rank: number; ink: number };
type Sync = { tone: "ok" | "warn"; text: string } | null;

const SUBMIT_ERRORS: Record<string, string> = {
  sequence: "排行榜上的層數與本機不同步，此層未計入排行榜。",
  score: "此層分數未通過檢核，未計入排行榜。",
  rate_limited: "提交太頻繁，此層未計入排行榜。",
  invalid: "提交格式有誤，未計入排行榜。",
  unavailable: "排行榜暫時連不上，進度已存在本機。",
};

export function Shengong({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "home" });
  const [promo, setPromo] = useState<Promotion | null>(null);
  const [sync, setSync] = useState<Sync>(null);
  const best = useSave((s) => s.sgBest);

  const submit = useCallback(async (floor: number, score: number) => {
    try {
      const res = await sgSubmit({ data: { deviceId: deviceId(), floor, score } });
      if (res.ok) setSync({ tone: "ok", text: res.position ? `已計入排行榜 · 目前第 ${res.position} 名` : "已計入排行榜，取個名號就能上榜。" });
      else setSync({ tone: "warn", text: SUBMIT_ERRORS[res.error] ?? SUBMIT_ERRORS.unavailable! });
    } catch {
      setSync({ tone: "warn", text: SUBMIT_ERRORS.unavailable! });
    }
  }, []);

  /** A floor cleared (real play or the test shortcut): local progress + one-time rank 墨玉, then the server. */
  const cleared = useCallback(
    (floor: number, final: number) => {
      const res = useSave.getState().clearFloor(floor, final);
      if (!res.counted) return { ink: 0, note: "此層已登過，不再計入。" };
      void submit(floor, final);
      const top = res.ranks.length ? Math.max(...res.ranks) : -1;
      if (top >= 0) window.setTimeout(() => setPromo({ rank: top, ink: res.ink }), 900);
      const title = rankForFloor(floor).name;
      return { ink: res.ink, note: top >= 0 ? `晉封${RANKS[top]!.name} · 賞墨玉 ${res.ink}` : `已登第 ${floor} 層 · 位號 ${title}` };
    },
    [submit],
  );

  return (
    <div className="ink-overlay m3-screen sg-screen fixed inset-0 z-40 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="深宮">
      {view.kind === "play" ? (
        <Game
          key={view.run}
          def={floorDef(view.floor)}
          onMap={() => setView({ kind: "home" })}
          onPlay={(id) => setView({ kind: "play", floor: Math.min(id, useSave.getState().sgBest + 1), run: Date.now() })}
          tower={{
            title: `第 ${view.floor} 層`,
            sub: `${rankForFloor(Math.max(view.floor - 1, 1)).name} · 深宮${isTrialFloor(view.floor) ? " · 晉封試煉" : ""}`,
            intro: isTrialFloor(view.floor) ? "晉封試煉：墨厄更強，打倒即過關。深宮不按層賜墨玉，晉封新位號時一次賞賜。" : "深宮不按層賜墨玉，晉封新位號時一次賞賜。",
            onClear: (final) => cleared(view.floor, final),
          }}
        />
      ) : view.kind === "board" ? (
        <Board onBack={() => setView({ kind: "home" })} />
      ) : (
        <Home
          best={best}
          sync={sync}
          onClose={onClose}
          onPlay={() => setView({ kind: "play", floor: best + 1, run: Date.now() })}
          onBoard={() => setView({ kind: "board" })}
          onTestClear={
            testMode()
              ? () => {
                  const f = useSave.getState().sgBest + 1;
                  const b = scoreBounds(f);
                  cleared(f, Math.min(b.max, b.min + 400 + f * 13));
                }
              : undefined
          }
        />
      )}
      {promo ? <PromotionMoment promo={promo} onClose={() => setPromo(null)} /> : null}
    </div>
  );
}

function Home({
  best,
  sync,
  onClose,
  onPlay,
  onBoard,
  onTestClear,
}: {
  best: number;
  sync: Sync;
  onClose: () => void;
  onPlay: () => void;
  onBoard: () => void;
  onTestClear?: () => void;
}) {
  const paid = useSave((s) => s.sgRanksPaid);
  const total = useSave((s) => s.sgTotal);
  const rankIdx = rankIndexForFloor(best);
  const rank = RANKS[rankIdx]!;
  const next = floorsToNextRank(best);
  const inRank = best <= 0 ? 0 : best - rank.from + 1;
  const span = rank.to ? rank.to - rank.from + 1 : 10;
  const pct = next ? Math.round((Math.min(inRank, span) / span) * 100) : 100;
  return (
    <>
      <div className="ink-bar safe-top flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" className="ink-ghost flex min-h-11 items-center gap-1 rounded-full px-3 text-sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回
        </button>
        <p className="ink-title font-serif text-xl">深宮</p>
        <button type="button" className="ink-ghost flex min-h-11 items-center gap-1 rounded-full px-3 text-sm" onClick={onBoard} data-testid="sg-open-board">
          <ListOrdered className="h-4 w-4" aria-hidden />
          排行
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <section className="sg-rank-card mx-auto mt-2 max-w-sm rounded-2xl p-5 text-center" data-testid="sg-rank" data-rank={rank.name} data-best={best}>
          <p className="text-xs tracking-[0.35em] text-muted">當前位號</p>
          <p className="sg-rank-name mt-1 font-serif">{rank.name}</p>
          <p className="mt-1 text-sm text-muted tabular-nums">
            {best > 0 ? `已登第 ${best} 層` : "尚未登層"} · 累計 {total.toLocaleString("zh-TW")} 分
          </p>
          <div className="sg-progress mt-4 h-2 overflow-hidden rounded-full" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm">
            {next ? (
              <>
                再登 {next.floor - best} 層晉封 <span className="text-gold">{next.next.name}</span> · 賞 <MoYu label /> {next.next.reward}
              </>
            ) : (
              "已登后位，深宮無盡，層數續計。"
            )}
          </p>
          <button type="button" className="mt-4 min-h-12 w-full rounded-xl bg-gold font-serif text-lg tracking-[0.2em]" onClick={onPlay} data-testid="sg-play">
            登第 {best + 1} 層
          </button>
          {onTestClear ? (
            <button type="button" className="mt-2 min-h-11 w-full rounded-xl border border-dashed border-line text-sm text-muted" onClick={onTestClear} data-testid="sg-test-clear">
              測試用：直接過第 {best + 1} 層
            </button>
          ) : null}
          {sync ? (
            <p className={cn("mt-3 text-xs", sync.tone === "ok" ? "text-muted" : "sg-warn")} data-testid="sg-sync" aria-live="polite">
              {sync.text}
            </p>
          ) : null}
        </section>

        <section className="mx-auto mt-4 max-w-sm">
          <h3 className="mb-2 px-1 text-sm tracking-[0.25em] text-muted">九品位號 · 晉封賞賜（每個位號僅一次）</h3>
          <ol className="space-y-1.5" data-testid="sg-ranks">
            {RANKS.map((r, i) => {
              const reached = best > 0 && i <= rankIdx;
              const got = paid.includes(i);
              return (
                <li key={r.name} className={cn("sg-rank-row flex items-center gap-3 rounded-xl px-3 py-2", i === rankIdx && "sg-rank-row-now", !reached && i > 0 && "opacity-75")}>
                  <Crown className={cn("h-4 w-4 shrink-0", reached || i === 0 ? "text-gold" : "text-muted")} aria-hidden />
                  <span className="w-12 font-serif text-base">{r.name}</span>
                  <span className="flex-1 text-xs text-muted tabular-nums">{r.to ? `第 ${r.from}–${r.to} 層` : `第 ${r.from} 層起`}</span>
                  <span className="flex items-center gap-1 text-sm tabular-nums">
                    {r.reward ? (
                      <>
                        <MoYu /> {r.reward}
                        <span className={cn("ml-1 w-9 text-right text-xs", got ? "text-gold" : "text-muted")}>{got ? "已領" : reached ? "" : "未達"}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted">入宮</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 px-1 text-xs leading-relaxed text-muted">
            每層一關，越往上氣血越少、墨封越多、墨厄越強；打倒墨厄即過關。過不了可原層再戰。每十層晉封一次；登過的層與重玩都不另賜墨玉。
          </p>
        </section>
      </div>
    </>
  );
}

function PromotionMoment({ promo, onClose }: { promo: Promotion; onClose: () => void }) {
  const rank = RANKS[promo.rank]!;
  return (
    <div className="m3-modal fixed inset-0 z-[60] grid place-items-center p-5" data-testid="sg-promotion" data-rank={rank.name} data-ink={promo.ink}>
      <div className="m3-card m3-card-win sg-promo w-full max-w-sm rounded-2xl p-6 text-center">
        <p className="text-xs tracking-[0.5em] text-muted">聖旨到</p>
        <p className="mt-2 text-sm text-muted">晉封</p>
        <p className="sg-promo-name font-serif">{rank.name}</p>
        <p className="mt-1 text-sm text-muted">{rank.to ? `第 ${rank.from}–${rank.to} 層` : `第 ${rank.from} 層起 · 深宮之首`}</p>
        {promo.ink > 0 ? (
          <p className="m3-reward mt-4 flex items-center justify-center gap-1.5 text-2xl" data-reward={promo.ink}>
            <MoYu label className="h-8 w-8" /> +{promo.ink}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted">晉封賞賜，每個位號僅此一次</p>
        <button type="button" className="mt-5 min-h-11 w-full rounded-xl bg-gold font-serif tracking-[0.3em]" onClick={onClose} data-testid="sg-promo-ok">
          謝恩
        </button>
      </div>
    </div>
  );
}

function Board({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<BoardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const nick = useSave((s) => s.sgNick);
  const best = useSave((s) => s.sgBest);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await sgBoard({ data: { deviceId: deviceId() } }));
    } catch {
      setData({ ok: false, error: "unavailable" });
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const me = data?.ok ? data.me : null;
  const meInTop = data?.ok ? data.rows.some((r) => r.me) : false;
  const needsNick = !!me && me.floor > 0 && !me.nickname;
  return (
    <>
      <div className="ink-bar safe-top flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" className="ink-ghost flex min-h-11 items-center gap-1 rounded-full px-3 text-sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          深宮
        </button>
        <p className="ink-title font-serif text-xl">深宮排行</p>
        <span className="w-[4.5rem]" />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-6" data-testid="sg-board" data-state={loading ? "loading" : data?.ok ? "ok" : "error"}>
        <p className="mx-auto mt-1 max-w-sm px-1 text-xs text-muted">排名依最高層數；同層者比累計分數（每層過關總分相加）。前 50 名。</p>
        {data?.ok && !data.durable ? (
          <p className="sg-warn mx-auto mt-1 max-w-sm px-1 text-xs" data-testid="sg-ephemeral">測試版：排行榜暫存於伺服器記憶體，可能隨時重置。</p>
        ) : null}
        {needsNick || (best > 0 && !nick && !me) ? <NickForm onDone={() => void load()} /> : null}
        {loading && !data ? <p className="mt-8 text-center text-sm text-muted">讀取中…</p> : null}
        {data && !data.ok ? <p className="mt-8 text-center text-sm text-muted">排行榜暫時連不上，稍後再試。</p> : null}
        {data?.ok ? (
          <ol className="mx-auto mt-3 max-w-sm space-y-1">
            <li className="grid grid-cols-[2.5rem_1fr_3rem_3.5rem] gap-2 px-3 text-[0.7rem] text-muted">
              <span>名次</span>
              <span>名號</span>
              <span>位號</span>
              <span className="text-right">層數</span>
            </li>
            {data.rows.length === 0 ? <li className="py-6 text-center text-sm text-muted">尚無人上榜，登第一層、取個名號，就能名列榜首。</li> : null}
            {data.rows.map((r) => (
              <BoardLine key={`${r.position}-${r.nickname}-${r.total}`} row={r} />
            ))}
          </ol>
        ) : null}
        {data?.ok && me && me.floor > 0 && !meInTop ? (
          <div className="mx-auto mt-3 max-w-sm" data-testid="sg-me">
            <p className="mb-1 px-1 text-xs text-muted">你的名次</p>
            <BoardLine
              row={{
                position: me.position ?? 0,
                nickname: me.nickname ?? "（未取名號）",
                title: rankForFloor(me.floor).name,
                floor: me.floor,
                total: me.total,
                me: true,
              }}
              unranked={!me.nickname}
            />
          </div>
        ) : null}
        {testMode() ? (
          <button
            type="button"
            className="mx-auto mt-4 block min-h-11 w-full max-w-sm rounded-xl border border-dashed border-line text-sm text-muted"
            data-testid="sg-test-forget"
            onClick={async () => {
              await forgetMyEntry();
              void load();
            }}
          >
            測試用：刪除我的排行紀錄
          </button>
        ) : null}
      </div>
    </>
  );
}

function BoardLine({ row, unranked }: { row: BoardRow; unranked?: boolean }) {
  return (
    <li
      className={cn("sg-board-row grid grid-cols-[2.5rem_1fr_3rem_3.5rem] items-center gap-2 rounded-xl px-3 py-2", row.me && "sg-board-me", row.position <= 3 && !unranked && "sg-board-top")}
      data-me={row.me ? "1" : undefined}
    >
      <span className="font-serif text-base tabular-nums">{unranked ? "—" : `#${row.position}`}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm">{row.nickname}</span>
        <span className="block text-[0.65rem] text-muted tabular-nums">{row.total.toLocaleString("zh-TW")} 分</span>
      </span>
      <span className="font-serif text-sm">{row.title}</span>
      <span className="text-right text-sm tabular-nums">{row.floor} 層</span>
    </li>
  );
}

function NickForm({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState(useSave.getState().sgNick ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => cleanNickname(value), [value]);
  const save = async () => {
    const clean = cleanNickname(value);
    if (!clean) return setErr(`名號需 ${NICK_MIN}–${NICK_MAX} 字。`);
    setBusy(true);
    setErr(null);
    try {
      const res = await sgNickname({ data: { deviceId: deviceId(), nickname: clean } });
      if (res.ok) {
        useSave.getState().setSgNick(res.nickname);
        onDone();
      } else
        setErr(
          res.error === "nickname" ? `名號需 ${NICK_MIN}–${NICK_MAX} 字。` : res.error === "no_record" ? "排行榜上還沒有你的紀錄，先登一層再取名號。" : "暫時存不了，稍後再試。",
        );
    } catch {
      setErr("暫時存不了，稍後再試。");
    }
    setBusy(false);
  };
  return (
    <form
      className="sg-rank-card mx-auto mt-3 max-w-sm rounded-2xl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="sg-nick"
    >
      <label className="text-sm" htmlFor="sg-nick-input">
        取個名號登上排行榜
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="sg-nick-input"
          className="sg-input min-h-11 min-w-0 flex-1 rounded-xl px-3 text-base"
          value={value}
          maxLength={24}
          placeholder={`${NICK_MIN}–${NICK_MAX} 字`}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="min-h-11 rounded-xl bg-gold px-4 text-sm" disabled={busy || !preview}>
          {busy ? "…" : "上榜"}
        </button>
      </div>
      {preview && preview !== value.trim() ? <p className="mt-1 text-xs text-muted">將顯示為：{preview}</p> : null}
      {err ? <p className="sg-warn mt-1 text-xs">{err}</p> : null}
    </form>
  );
}

/** For cleanup scripts / tests: drop this device's entry from the leaderboard. */
export async function forgetMyEntry() {
  return sgForget({ data: { deviceId: deviceId() } });
}
