/**
 * 動畫教學指引: a first-time, skippable coach for the upgraded combat. Each step spotlights a REAL element
 * on screen (looked up by data-testid) with an animated finger; steps whose element is absent are skipped.
 */
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/components/game/bits";
import type { Pos } from "@/game/match3";
import "./coach.css";

export const COACH_VERSION = 1;

type Gesture = "swipe" | "tap" | "pulse";
type Step = { id: string; target: string; title: string; text: string; gesture: Gesture };

const STEPS: Step[] = [
  { id: "swap", target: '[data-testid="m3-board"]', title: "交換玉石", text: "滑動相鄰兩顆玉，連成三顆以上就會消除。", gesture: "swipe" },
  { id: "damage", target: '[data-testid="cb-enemy"]', title: "打擊墨厄", text: "每次消除都會傷到墨厄，扣減上方生命條。打倒墨厄即過關；連消與特殊玉傷害更高。", gesture: "pulse" },
  { id: "team", target: '[data-testid="cb-team"], [data-testid="m3-dock"]', title: "三人助陣", text: "開局前可「編隊」最多三位助陣。一般消除會同時為每一位蓄勢。", gesture: "pulse" },
  { id: "skill", target: '[data-testid="cb-team"] [data-testid="m3-skill"], [data-testid="m3-dock"] [data-testid="m3-skill"], [data-testid="m3-dock"]', title: "發動技能", text: "光環蓄滿後點頭像發動。技能不耗回合，輔助技能還能補血；技能造成的消除不會再回充。", gesture: "tap" },
  { id: "combo", target: '[data-testid="cb-team"], [data-testid="m3-dock"]', title: "天命連攜", text: "接連發動不同助陣：兩人「墨痕共鳴」、三人「天命共鳴」，追加重擊並削盾。", gesture: "pulse" },
  { id: "enemy-turn", target: '[data-testid="cb-countdown"]', title: "出手倒數與護盾", text: "每換一次玉算一回，倒數歸零墨厄就會出手傷你。藍色斜紋是護盾，消除可以削去。", gesture: "pulse" },
  { id: "hp", target: '[data-testid="m3-hud"]', title: "你的氣血", text: "下方長條是你的氣血，歸零就失敗。消粉色愛心的補血石每顆 +45 血；打倒墨厄過關時餘血折算加分。", gesture: "pulse" },
];

type Rect = { x: number; y: number; w: number; h: number };

function rectOf(sel: string): Rect | null {
  for (const one of sel.split(",")) {
    const el = document.querySelector(one.trim());
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  return null;
}

export function CombatCoach({
  hint,
  rows,
  cols,
  onDone,
}: {
  /** A real legal swap on the current board, for the finger to demonstrate. */
  hint: [Pos, Pos] | null;
  rows: number;
  cols: number;
  onDone: (skipped: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);
  const steps = useMemo(() => STEPS.filter((s) => typeof document === "undefined" || rectOf(s.target)), []);
  const step = steps[index];

  useLayoutEffect(() => {
    if (!step) return;
    setRect(rectOf(step.target));
  }, [step, tick]);
  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    const t = window.setInterval(onResize, 600);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!steps.length) onDone(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!step) return null;

  const pad = 6;
  const hole = rect ? { left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 } : null;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardBelow = rect ? rect.y + rect.h / 2 < vh * 0.5 : true;
  // finger geometry
  let finger: CSSProperties = {};
  if (rect) {
    if (step.gesture === "swipe" && hint) {
      const cw = rect.w / cols;
      const ch = rect.h / rows;
      const [a, b] = hint;
      finger = {
        left: rect.x + (a.c + 0.5) * cw,
        top: rect.y + (a.r + 0.5) * ch,
        "--dx": `${(b.c - a.c) * cw}px`,
        "--dy": `${(b.r - a.r) * ch}px`,
      } as CSSProperties;
    } else {
      finger = { left: rect.x + rect.w / 2, top: rect.y + rect.h / 2 } as CSSProperties;
    }
  }
  const last = index >= steps.length - 1;
  return (
    <div className="coach fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="戰鬥教學" data-testid="coach" data-step={step.id}>
      {hole ? <div className="coach-hole" style={hole} aria-hidden /> : <div className="coach-veil" aria-hidden />}
      {rect ? (
        <span key={`${step.id}-${index}`} className={cn("coach-finger", `coach-${step.gesture}`)} style={finger} aria-hidden>
          <i className="coach-ripple" />
          <svg viewBox="0 0 32 40" className="coach-hand">
            <path d="M13 3c2 0 3 1.5 3 3.5V18l1-.5V12c0-2 3-2 3 0v6l1-.3V14c0-2 3-2 3 0v5l1 .2V17c0-2 3-2 3 0v8c0 7-4 12-11 12-5 0-8-3-10-7l-4-8c-1-2 1-4 3-2.5L10 23V6.5C10 4.5 11 3 13 3z" fill="#f6e3b4" stroke="#7a5a1e" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
      <div className={cn("coach-card", cardBelow ? "coach-card-low" : "coach-card-high")} key={step.id}>
        <div className="coach-dots" aria-hidden>
          {steps.map((s, i) => (
            <i key={s.id} className={cn(i === index && "on", i < index && "done")} />
          ))}
        </div>
        <p className="coach-title font-serif">{step.title}</p>
        <p className="coach-text">{step.text}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" className="coach-skip" onClick={() => onDone(true)} data-testid="coach-skip">
            略過教學
          </button>
          <button
            type="button"
            className="coach-next"
            onClick={() => (last ? onDone(false) : setIndex((i) => i + 1))}
            data-testid="coach-next"
          >
            {last ? "開始戰鬥" : `下一步 ${index + 1}/${steps.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
