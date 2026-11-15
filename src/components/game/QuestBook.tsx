import "./quest.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "./use-now";
import {
  ArrowLeft,
  Check,
  Gift,
  Lock,
  ScrollText,
  X,
  Flame,
  BookOpen,
  Gem,
  Swords,
  Sparkles,
  Sun,
} from "lucide-react";
import { cn } from "./bits";
import { artifactUnlocks } from "@/game/artifacts";
import { useSave } from "@/game/store";
import {
  CHEST_STEPS,
  DAILY_MAX,
  MILESTONES,
  chestReward,
  chestState,
  countdownText,
  dailyMoyuan,
  dailyView,
  milestoneState,
  nextDailyReset,
  nextWeeklyReset,
  rewardText,
  rollQuestBook,
  weeklyView,
  type GoTarget,
  type QuestCtx,
  type Reward,
  type DailyView,
} from "@/game/quests";

import { sortedQuests, claimableQuests } from "./quest-book-model";

type Tab = "daily" | "weekly";
type QuestRow = Pick<
  DailyView,
  "id" | "name" | "desc" | "have" | "need" | "completed" | "claimed" | "go"
> & { rewardLabel: string };
const stateLabel = { locked: "未達標", ready: "可領取", claimed: "已領取" };
const questIcons = {
  login: Sun,
  match1: Gem,
  match3: Gem,
  story: BookOpen,
  equip: Flame,
  raid: Swords,
  mainstory: ScrollText,
  free: Sparkles,
  diligent: Sun,
  raid3: Swords,
};

/** 修行簿: 今日修行 / 七日修行 + 旅途饋贈. Claims are manual; nothing completes just by opening this page. */
export function QuestBook({
  onClose,
  onGo,
}: {
  onClose: () => void;
  onGo: (target: GoTarget) => void;
}) {
  const now = useNow(1000);
  const rawBook = useSave((s) => s.questBook);
  const m3 = useSave((s) => s.m3);
  const prologue = useSave((s) => s.mainStoryPrologueRead);
  const charTickets = useSave((s) => s.charTickets);
  const artifactTickets = useSave((s) => s.artifactTickets);
  const [tab, setTab] = useState<Tab>("daily");
  const [selectedChest, setSelectedChest] = useState<number | null>(null);
  const [openedChest, setOpenedChest] = useState<{ step: number; reward: Reward } | null>(null);
  const [claimFx, setClaimFx] = useState<{ key: number; text: string } | null>(null);
  const claiming = useRef(false);
  const previousCompleted = useRef<{ period: string; ids: Set<string> } | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const ctx: QuestCtx = useMemo(() => {
    const u = artifactUnlocks(m3);
    return { vault: u.vault, raid: u.raid };
  }, [m3]);
  // Display the book as of `now` (an expired day/week shows fresh, unclaimed rows; nothing is back-paid).
  const book = useMemo(() => rollQuestBook(rawBook, now), [rawBook, now]);
  const daily = dailyView(book, ctx);
  const moyuan = dailyMoyuan(book);
  const weekly = weeklyView(book, ctx);
  const progress = { m3, mainStoryPrologueRead: prologue };

  useEffect(() => {
    // Entering the book is an entry too (LOGIN is the only auto-complete).
    useSave.getState().questEvent("LOGIN_COMPLETED");
  }, [book.day]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selectedChest !== null) setSelectedChest(null);
      else onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, selectedChest]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const say = (text: string) => setToast({ key: Date.now(), text });

  const readyDaily = claimableQuests(daily);
  const readyWeekly = claimableQuests(weekly);
  const pendingMoyuan = readyDaily.reduce((sum, q) => sum + q.moyuan, 0);
  const completedDaily = daily.filter((q) => q.completed).length;
  const nextChest = CHEST_STEPS.find((step) => step > moyuan);
  const chestReady = CHEST_STEPS.filter((step) => chestState(book, step) === "ready").length;
  const rows = sortedQuests<QuestRow>(
    tab === "daily"
      ? daily.map((q) => ({ ...q, rewardLabel: `墨緣 +${q.moyuan}` }))
      : weekly.map((q) => ({ ...q, rewardLabel: q.rewardText })),
  );

  // Observe real transitions only. Sorting is a copy and cannot change ids or store progress.
  const completedKey = [
    ...daily.map((q) => ({ ...q, id: `daily:${q.id}` })),
    ...weekly.map((q) => ({ ...q, id: `weekly:${q.id}` })),
  ]
    .filter((q) => q.completed)
    .map((q) => q.id)
    .join(",");
  useEffect(() => {
    const ids = new Set(completedKey.split(",").filter(Boolean));
    const period = `${book.day}/${book.week}`;
    const prev = previousCompleted.current;
    const newlyDone = prev?.period === period ? [...ids].filter((id) => !prev.ids.has(id)) : [];
    previousCompleted.current = { period, ids };
    if (newlyDone.length)
      setToast({ key: Date.now(), text: `修行已成 · ${newlyDone.length} 項獎勵待領取` });
  }, [completedKey, book.day, book.week]);
  useEffect(() => {
    setSelectedChest(null);
    setOpenedChest(null);
  }, [book.day]);
  useEffect(() => {
    if (!claimFx) return;
    const id = window.setTimeout(() => setClaimFx(null), 1600);
    return () => window.clearTimeout(id);
  }, [claimFx]);

  const claimRows = (ids: string[]) => {
    if (claiming.current) return;
    claiming.current = true;
    try {
      let gained = 0;
      const rewards: string[] = [];
      // Each existing synchronous action re-reads the latest store and validates eligibility.
      for (const id of ids) {
        if (tab === "daily") gained += useSave.getState().claimQuest(id);
        else {
          const r = useSave.getState().claimWeeklyQuest(id);
          if (r) rewards.push(rewardText(r));
        }
      }
      const text = gained ? `墨緣值 +${gained}` : rewards.join("、");
      if (text) {
        setClaimFx({ key: Date.now(), text });
        say(`已領取 · ${text}`);
      }
    } finally {
      claiming.current = false;
    }
  };
  const openChest = (step: number) => {
    if (claiming.current) return;
    claiming.current = true;
    try {
      const r = useSave.getState().claimQuestChest(step);
      if (r) {
        setOpenedChest({ step, reward: r });
        say(`開箱獲得 ${rewardText(r)}`);
      }
    } finally {
      claiming.current = false;
    }
  };

  const dailyLeft = countdownText(nextDailyReset(now) - now);
  const weeklyLeft = countdownText(nextWeeklyReset(now) - now);
  const milestoneReady = MILESTONES.filter(
    (m) => milestoneState(book, m, progress) === "ready",
  ).length;
  const dailyDot =
    daily.some((q) => q.completed && !q.claimed) ||
    CHEST_STEPS.some((st) => chestState(book, st) === "ready");
  const weeklyDot = weekly.some((w) => w.completed && !w.claimed);

  return (
    <section
      className="ink-overlay m3-screen qb-screen fixed inset-0 z-40 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="修行簿"
      data-testid="quest-book"
    >
      <header className="journey-header safe-top">
        <button className="ui-icon" aria-label="返回" onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="ui-eyebrow">每日四時重開・七日週一四時重開</p>
          <h1>修行簿</h1>
        </div>
        <button className="ui-icon" aria-label="關閉修行簿" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <nav className="journey-page-tabs qb-tabs" role="tablist" aria-label="修行簿分頁">
        <button
          role="tab"
          aria-selected={tab === "daily"}
          onClick={() => setTab("daily")}
          data-testid="qb-tab-daily"
        >
          今日修行{dailyDot ? <i className="qb-dot" aria-label="可領取" /> : null}
        </button>
        <button
          role="tab"
          aria-selected={tab === "weekly"}
          onClick={() => setTab("weekly")}
          data-testid="qb-tab-weekly"
        >
          七日修行{weeklyDot ? <i className="qb-dot" aria-label="可領取" /> : null}
        </button>
      </nav>
      <div className="journey-scroll qb-scroll">
        <section className="qb-card qb-meter" aria-label="今日墨緣值">
          <div className="qb-summary">
            <div>
              <p className="qb-section-label">今日已領墨緣</p>
              <p className="qb-total">
                <strong data-testid="qb-moyuan">{moyuan}</strong>
                <span> / {DAILY_MAX}</span>
              </p>
            </div>
            <div className="qb-summary-side">
              <p>
                已完成{" "}
                <strong>
                  {completedDaily}/{daily.length}
                </strong>{" "}
                項
              </p>
              <p>
                {nextChest ? (
                  <>
                    下階寶箱 <strong>{nextChest}</strong> · 還差 {nextChest - moyuan}
                  </>
                ) : (
                  "今日寶箱門檻全達成"
                )}
              </p>
            </div>
          </div>
          <div
            className="qb-bar"
            role="progressbar"
            aria-label="已領墨緣值"
            aria-valuemin={0}
            aria-valuemax={DAILY_MAX}
            aria-valuenow={moyuan}
          >
            <span style={{ width: `${Math.min(100, moyuan)}%` }} />
            {CHEST_STEPS.map((step) => (
              <i key={step} style={{ left: `${step}%` }} />
            ))}
          </div>
          <div className="qb-progress-note">
            <span data-testid="qb-pending">
              待領墨緣 +{pendingMoyuan}
              <small>（尚未計入）</small>
            </span>
            <span>{chestReady ? `${chestReady} 箱可領` : "寶箱需手動領取"}</span>
          </div>
          {tab === "daily" ? (
            <>
              <div className="qb-chests" aria-label="階段寶箱">
                {CHEST_STEPS.map((step) => {
                  const state = chestState(book, step);
                  return (
                    <button
                      key={step}
                      className={cn(
                        "qb-chest",
                        `is-${state}`,
                        selectedChest === step && "is-selected",
                      )}
                      data-testid={`qb-chest-${step}`}
                      aria-expanded={selectedChest === step}
                      aria-controls="qb-chest-detail"
                      aria-label={`${step} 墨緣寶箱，${stateLabel[state]}：${rewardText(chestReward(step, ctx))}`}
                      onClick={() => {
                        setSelectedChest(step);
                        setOpenedChest(null);
                      }}
                    >
                      <span className="qb-chest-icon">
                        {state === "claimed" ? (
                          <Check size={20} />
                        ) : state === "locked" ? (
                          <Lock size={19} />
                        ) : (
                          <Gift size={22} />
                        )}
                      </span>
                      <strong>{step}</strong>
                      <small>{stateLabel[state]}</small>
                    </button>
                  );
                })}
              </div>
              {selectedChest !== null ? (
                <div
                  id="qb-chest-detail"
                  className={cn(
                    "qb-chest-detail",
                    openedChest?.step === selectedChest && "is-opened",
                  )}
                  data-testid="qb-chest-detail"
                >
                  <Gift size={24} className="qb-open-icon" aria-hidden />
                  <div>
                    <strong>
                      {selectedChest} 墨緣寶箱 ·{" "}
                      {openedChest?.step === selectedChest
                        ? "開箱成功"
                        : stateLabel[chestState(book, selectedChest)]}
                    </strong>
                    <p>
                      {openedChest?.step === selectedChest ? "獲得 " : "內含 "}
                      {rewardText(
                        openedChest?.step === selectedChest
                          ? openedChest.reward
                          : chestReward(selectedChest, ctx),
                      )}
                    </p>
                    {chestState(book, selectedChest) === "locked" ? (
                      <small>還差 {selectedChest - moyuan} 已領墨緣</small>
                    ) : null}
                  </div>
                  <button
                    className="ui-primary qb-btn"
                    data-testid="qb-chest-claim"
                    disabled={chestState(book, selectedChest) !== "ready"}
                    onClick={() => openChest(selectedChest)}
                  >
                    {chestState(book, selectedChest) === "ready"
                      ? "開箱"
                      : stateLabel[chestState(book, selectedChest)]}
                  </button>
                </div>
              ) : (
                <p className="qb-fine">點選寶箱查看獎勵 · 未領獎勵於重置後失效</p>
              )}
              <p className="qb-reset">距離每日重置 {dailyLeft} · 台北時間 04:00</p>
            </>
          ) : null}
          {claimFx ? (
            <p key={claimFx.key} className="qb-gain" aria-hidden>
              {claimFx.text}
            </p>
          ) : null}
        </section>
        {tab === "weekly" ? (
          <section className="qb-card qb-week-meter" aria-label="七日修行進度">
            <div className="qb-meter-head">
              <p>
                本週墨緣滿百{" "}
                <strong data-testid="qb-weekdays">{Math.min(book.weekDays.length, 5)}</strong> / 5
                日
              </p>
              <span>
                完成 {weekly.filter((q) => q.completed).length}/{weekly.length} 項
              </span>
            </div>
            <div className="qb-days" aria-label={`已累積 ${Math.min(book.weekDays.length, 5)} 日`}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={cn(i < book.weekDays.length && "on")} />
              ))}
            </div>
            <p className="qb-reset">距離週重置 {weeklyLeft}</p>
            <p className="qb-fine">同一天只計一次 · 週一台北時間 04:00 重置，未領週獎勵失效</p>
          </section>
        ) : null}
        <div className="qb-list-heading">
          <div>
            <h2>{tab === "daily" ? "今日修行" : "七日修行"}</h2>
            <p>{(tab === "daily" ? readyDaily : readyWeekly).length} 項可領 · 待領優先</p>
          </div>
          <button
            className="ui-primary qb-btn"
            data-testid="qb-claim-all"
            disabled={!(tab === "daily" ? readyDaily : readyWeekly).length}
            onClick={() => claimRows((tab === "daily" ? readyDaily : readyWeekly).map((q) => q.id))}
          >
            全部領取
          </button>
        </div>
        <ul className="qb-list" aria-label={tab === "daily" ? "今日修行" : "七日修行"}>
          {rows.map((q) => {
            const Icon = questIcons[q.id as keyof typeof questIcons] ?? ScrollText;
            return (
              <li
                key={`${tab}:${q.id}`}
                className={cn("qb-row", q.claimed ? "is-claimed" : q.completed && "is-ready")}
                data-testid={`qb-${tab}-${q.id}`}
              >
                <span className="qb-task-icon" aria-hidden>
                  <Icon size={20} />
                </span>
                <div className="qb-row-main">
                  <p className="qb-row-name">{q.name}</p>
                  <p className="qb-row-desc">{q.desc}</p>
                  <div className="qb-row-meta">
                    <span className={cn("qb-moyuan", tab === "weekly" && "qb-ticket")}>
                      {q.rewardLabel}
                    </span>
                    <span className="qb-count">
                      {q.have}/{q.need}
                      {q.completed && !q.claimed ? " · 待領取" : ""}
                    </span>
                  </div>
                  <div
                    className="qb-mini"
                    role="progressbar"
                    aria-label={`${q.name}進度`}
                    aria-valuenow={q.have}
                    aria-valuemin={0}
                    aria-valuemax={q.need}
                  >
                    <span style={{ width: `${Math.min(100, (q.have / q.need) * 100)}%` }} />
                  </div>
                </div>
                <div className="qb-row-side">
                  {q.claimed ? (
                    <button className="ui-quiet qb-btn qb-done" disabled>
                      已領取
                    </button>
                  ) : q.completed ? (
                    <button
                      className="ui-primary qb-btn"
                      data-testid={`qb-${tab === "weekly" ? "wclaim" : "claim"}-${q.id}`}
                      onClick={() => claimRows([q.id])}
                    >
                      領取
                    </button>
                  ) : q.go !== "none" ? (
                    <button className="ui-quiet qb-btn" onClick={() => onGo(q.go)}>
                      前往
                    </button>
                  ) : tab === "weekly" && q.id === "diligent" ? (
                    <button
                      className="ui-quiet qb-btn"
                      aria-label="前往今日修行"
                      onClick={() => setTab("daily")}
                    >
                      前往
                    </button>
                  ) : (
                    <span className="qb-done">進行中</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="qb-tickets" aria-label="召喚券">
          <span>
            千古召喚券 <strong>{charTickets}</strong>
          </span>
          <span>
            命器召喚券 <strong>{artifactTickets}</strong>
          </span>
        </div>
        <section className="qb-card qb-journey" aria-label="旅途饋贈" data-testid="qb-milestones">
          <div className="qb-meter-head">
            <p>
              <ScrollText size={16} aria-hidden /> 旅途饋贈
              {milestoneReady ? <i className="qb-dot" aria-label="可領取" /> : null}
            </p>
            <small>主線里程碑・每項限領一次</small>
          </div>
          <ul>
            {MILESTONES.map((m) => {
              const state = milestoneState(book, m, progress);
              return (
                <li key={m.id} className={cn("qb-ms", `is-${state}`)} data-testid={`qb-ms-${m.id}`}>
                  <span className="qb-ms-name">{m.name}</span>
                  <span className="qb-ms-reward">
                    {rewardText({ charTickets: m.charTickets, artifactTickets: m.artifactTickets })}
                  </span>
                  {state === "claimed" ? (
                    <span className="qb-done">已領取</span>
                  ) : state === "ready" ? (
                    <button
                      className="ui-primary qb-btn"
                      data-testid={`qb-msclaim-${m.id}`}
                      onClick={() => {
                        const r = useSave.getState().claimMilestone(m.id);
                        if (r) say(`獲得 ${rewardText(r)}`);
                      }}
                    >
                      領取
                    </button>
                  ) : (
                    <span className="qb-done qb-lock">
                      <Lock size={12} aria-hidden /> 未達成
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {toast ? (
        <p key={toast.key} className="qb-toast" role="status">
          {toast.text}
        </p>
      ) : null}
    </section>
  );
}
