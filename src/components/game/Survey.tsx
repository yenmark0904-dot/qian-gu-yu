import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/components/game/bits";
import {
  DEVICE_KEY,
  FREE_TEXT_HINT,
  FREE_TEXT_MAX,
  FREE_TEXT_TITLE,
  QUESTIONS,
  RATE_WINDOW_MS,
  SURVEY_INTRO,
  SURVEY_STORE_KEY,
  SURVEY_THANKS,
  SURVEY_TITLE,
  isComplete,
  type Answers,
  type SurveyLocal,
} from "@/game/feedback";
import { submitFeedback } from "@/game/feedback-submit";

export function readSurveyLocal(): SurveyLocal {
  try {
    return JSON.parse(localStorage.getItem(SURVEY_STORE_KEY) ?? "{}") as SurveyLocal;
  } catch {
    return {};
  }
}
export function writeSurveyLocal(patch: SurveyLocal) {
  try {
    localStorage.setItem(SURVEY_STORE_KEY, JSON.stringify({ ...readSurveyLocal(), ...patch }));
  } catch {
    /* private mode: the invite may show again, harmless */
  }
}
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

const TOTAL = QUESTIONS.length + 1; // Q1–Q10 + Q11

/** 玩家心聲 ♡ — full-screen survey: intro → Q1…Q11 → thanks. Opaque panel, no blur (crisp on iOS). */
export function Survey({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0); // 0 intro, 1..10 choice, 11 free text, 12 thanks
  const [answers, setAnswers] = useState<Partial<Answers>>({});
  const [other, setOther] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    setError(null);
  }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1] : null;
  const answered = q ? (q.multi ? ((answers[q.id] as string[] | undefined)?.length ?? 0) > 0 : !!answers[q.id]) : true;
  const otherLen = Array.from(other).length;

  const pick = (opt: string) => {
    if (!q) return;
    setAnswers((prev) => {
      if (!q.multi) return { ...prev, [q.id]: opt };
      const cur = (prev[q.id] as string[] | undefined) ?? [];
      const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
      return { ...prev, [q.id]: q.options.filter((o) => next.includes(o)) };
    });
  };

  const submit = async () => {
    if (!isComplete(answers) || sending) return;
    const last = readSurveyLocal().submittedAt;
    if (last && Date.now() - last < RATE_WINDOW_MS) {
      setError("你剛剛已經送出過心聲囉，請 10 分鐘後再試。");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await submitFeedback({ data: { answers, other, deviceId: deviceId() } });
      if (res.ok) {
        writeSurveyLocal({ submittedAt: Date.now(), invited: true });
        setStep(TOTAL + 1);
      } else if (res.error === "rate_limited") {
        setError("你剛剛已經送出過心聲囉，請 10 分鐘後再試。");
      } else if (res.error === "too_long") {
        setError(`其他建議最多 ${FREE_TEXT_MAX} 字。`);
      } else {
        setError("有題目尚未完成，請檢查後再送出。");
      }
    } catch {
      setError("送出失敗，請確認網路後再試一次。");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="survey-screen fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-labelledby="survey-title" data-testid="survey" data-step={step}>
      <header className="safe-top shrink-0 px-4">
        <div className="flex h-14 items-center justify-between gap-3">
          <h2 id="survey-title" className="font-serif text-lg tracking-[0.2em] text-[#f6ecd9]">
            {SURVEY_TITLE}
          </h2>
          <button type="button" className="survey-icon grid h-11 w-11 place-items-center rounded-full" aria-label="關閉問卷" onClick={onClose} data-testid="survey-close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {step >= 1 && step <= TOTAL ? (
          <div className="pb-3" data-testid="survey-progress">
            <div className="flex items-center justify-between text-xs text-[#cfc3b1]">
              <span>
                第 <span className="tabular-nums text-[#f2cf7e]">{step}</span> / {TOTAL} 題
              </span>
              <span>{q?.multi ? "可複選" : step === TOTAL ? "選填" : "單選"}</span>
            </div>
            <div className="survey-track mt-1.5 h-1.5 overflow-hidden rounded-full" aria-hidden>
              <div className="survey-fill h-full rounded-full" style={{ width: `${(step / TOTAL) * 100}%` }} />
            </div>
          </div>
        ) : null}
      </header>

      <div ref={body} className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="mx-auto w-full max-w-md">
          {step === 0 ? (
            <div className="survey-letter mt-2 rounded-2xl px-5 py-6" data-testid="survey-intro">
              {SURVEY_INTRO.map((line, i) => (
                <p key={i} className={cn("survey-prose text-[0.95rem] leading-8", i === 0 ? "font-serif text-[1.05rem] text-[#f6e7c1]" : "mt-3")}>
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          {q ? (
            <fieldset className="mt-1">
              <legend className="survey-prose font-serif text-[1.1rem] leading-8 text-[#f6ecd9]">{q.text}</legend>
              <div className="mt-4 grid gap-2.5" role={q.multi ? "group" : "radiogroup"} aria-label={q.text}>
                {q.options.map((opt) => {
                  const on = q.multi ? ((answers[q.id] as string[] | undefined) ?? []).includes(opt) : answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role={q.multi ? "checkbox" : "radio"}
                      aria-checked={on}
                      className={cn("survey-option flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[0.95rem] leading-6", on && "on")}
                      onClick={() => pick(opt)}
                      data-testid="survey-option"
                    >
                      <span className={cn("survey-mark grid h-5 w-5 shrink-0 place-items-center", q.multi ? "rounded-md" : "rounded-full")} aria-hidden>
                        {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
              {q.multi ? <p className="mt-3 text-xs text-[#b8ad9d]">可複選，至少選一項</p> : null}
            </fieldset>
          ) : null}

          {step === TOTAL ? (
            <div className="mt-1">
              <label htmlFor="survey-other" className="survey-prose block font-serif text-[1.1rem] leading-8 text-[#f6ecd9]">
                {FREE_TEXT_TITLE}
              </label>
              <p className="survey-prose mt-2 text-sm leading-7 text-[#cfc3b1]">{FREE_TEXT_HINT}</p>
              <textarea
                id="survey-other"
                className="survey-text mt-3 block min-h-44 w-full resize-y rounded-xl px-4 py-3 text-base leading-7"
                value={other}
                maxLength={FREE_TEXT_MAX}
                onChange={(e) => setOther(Array.from(e.target.value).slice(0, FREE_TEXT_MAX).join(""))}
                data-testid="survey-other"
              />
              <p className={cn("mt-1.5 text-right text-xs tabular-nums", otherLen >= FREE_TEXT_MAX ? "text-[#f0b2a3]" : "text-[#b8ad9d]")}>
                {otherLen} / {FREE_TEXT_MAX}（選填）
              </p>
            </div>
          ) : null}

          {step === TOTAL + 1 ? (
            <div className="survey-letter mt-6 rounded-2xl px-5 py-8 text-center" data-testid="survey-thanks">
              {SURVEY_THANKS.map((line, i) => (
                <p key={i} className={cn("survey-prose leading-8", i === 0 ? "font-serif text-xl tracking-[0.12em] text-[#f6e7c1]" : "mt-3 text-[0.95rem]")}>
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          {error ? (
            <p className="survey-error mt-4 rounded-xl px-4 py-3 text-sm" role="alert" data-testid="survey-error">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <footer className="safe-bottom shrink-0 px-4 pb-4 pt-3">
        <div className="mx-auto grid w-full max-w-md grid-cols-[1fr_2fr] gap-2">
          {step === 0 ? (
            <>
              <button type="button" className="survey-ghost min-h-12 rounded-xl text-sm" onClick={onClose}>
                下次再說
              </button>
              <button type="button" className="survey-primary min-h-12 rounded-xl" onClick={() => setStep(1)} data-testid="survey-start">
                開始填寫
              </button>
            </>
          ) : step <= TOTAL ? (
            <>
              <button type="button" className="survey-ghost min-h-12 rounded-xl text-sm" onClick={() => setStep((s) => s - 1)} data-testid="survey-prev">
                上一題
              </button>
              {step < TOTAL ? (
                <button type="button" className="survey-primary min-h-12 rounded-xl" disabled={!answered} onClick={() => setStep((s) => s + 1)} data-testid="survey-next">
                  {answered ? "下一題" : "請先作答"}
                </button>
              ) : (
                <button type="button" className="survey-primary min-h-12 rounded-xl" disabled={!isComplete(answers) || sending} onClick={submit} data-testid="survey-submit">
                  {sending ? "送出中…" : "送出心聲 ♡"}
                </button>
              )}
            </>
          ) : (
            <button type="button" className="survey-primary col-span-2 min-h-12 rounded-xl" onClick={onClose} data-testid="survey-done">
              回到遊戲
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/** Gentle, once-only invite after the first 召喚 or first 三消 clear. */
export function SurveyInvite({ onOpen, onLater }: { onOpen: () => void; onLater: () => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onLater();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLater]);
  return (
    <div className="survey-invite-scrim fixed inset-0 z-40 grid place-items-center p-6" data-testid="survey-invite" onClick={onLater}>
      <div className="survey-letter w-full max-w-[20rem] rounded-2xl px-6 pb-6 pt-7 text-center" role="dialog" aria-modal="true" aria-labelledby="survey-invite-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="survey-invite-title" className="font-serif text-xl tracking-[0.2em] text-[#f6e7c1]">
          {SURVEY_TITLE}
        </h2>
        <p className="survey-prose mt-4 text-sm leading-7">初次相遇的感覺如何？花 2～3 分鐘，告訴我你的心聲吧。</p>
        <p className="mt-2 text-xs text-[#b8ad9d]">隨時可從下方「心聲」再打開</p>
        <div className="mt-6 grid grid-cols-[1fr_2fr] gap-2">
          <button type="button" className="survey-ghost min-h-11 rounded-xl text-sm" onClick={onLater} data-testid="survey-invite-later">
            不用了
          </button>
          <button ref={primary} type="button" className="survey-primary min-h-11 rounded-xl" onClick={onOpen} data-testid="survey-invite-open">
            前往填寫
          </button>
        </div>
      </div>
    </div>
  );
}
