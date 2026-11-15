/**
 * 玩家心聲 ♡ — player feedback survey. Pure, dependency-free (shared by the client UI, the
 * server function and node tests). Copy below is the designer's text, verbatim.
 */

export const SURVEY_TITLE = "玩家心聲 ♡";

export const SURVEY_INTRO: readonly string[] = [
  "致每一位踏入《千古遇》的有緣人：",
  "這是我第一次嘗試製作遊戲，還有許多不成熟的地方，但我希望能慢慢把《千古遇》變成一款真正讓大家喜歡的乙女遊戲。",
  "你的每一份建議，都是讓這場跨越千年的相遇變得更美好的力量。",
  "問卷約需 2～3 分鐘，謝謝你願意陪我一起完善這個世界。♡",
];

export const SURVEY_THANKS: readonly string[] = [
  "「千年一遇，幸得有你。」",
  "感謝你留下珍貴的心聲。",
  "《千古遇》還在慢慢成長，而你的每一份建議，都將成為這段故事繼續前進的力量。",
  "願下一次相逢，能帶給你更多心動。♡",
];

export type ChoiceQuestion = {
  id: `q${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
  /** Short column title for the Google Sheet header. */
  short: string;
  text: string;
  multi: boolean;
  options: readonly string[];
};

export const QUESTIONS: readonly ChoiceQuestion[] = [
  {
    id: "q1",
    short: "Q1 整體滿意度",
    text: "1. 你對《千古遇》的整體遊戲體驗滿意嗎？",
    multi: false,
    options: ["非常滿意", "滿意", "普通", "不太滿意", "非常不滿意"],
  },
  {
    id: "q2",
    short: "Q2 最吸引的部分",
    text: "2. 遊戲中最吸引你的是哪個部分？（可複選）",
    multi: true,
    options: ["歷史男神角色與立繪", "抽卡召喚系統", "角色劇情與戀愛互動", "三消闖關玩法", "古風美術與遊戲氛圍", "角色收集與養成"],
  },
  {
    id: "q3",
    short: "Q3 立繪與美術",
    text: "3. 你覺得目前的角色立繪與美術風格如何？",
    multi: false,
    options: ["非常精緻，很有吸引力", "整體不錯，但可以更精緻", "普通，沒有特別驚艷", "角色辨識度或畫風需要改善"],
  },
  {
    id: "q4",
    short: "Q4 抽卡系統",
    text: "4. 你對目前的抽卡系統感受如何？",
    multi: false,
    options: ["很有趣，會想持續抽卡", "還不錯，但希望獎勵更多", "抽卡資源取得太困難", "角色稀有度或機率需要調整", "目前還沒有體驗抽卡"],
  },
  {
    id: "q5",
    short: "Q5 希望增加的劇情",
    text: "5. 你希望未來的角色劇情增加哪些內容？（可複選）",
    multi: true,
    options: ["更多浪漫曖昧互動", "能影響結局的對話選項", "角色專屬約會與支線故事", "更有張力的成人向戀愛氛圍", "歷史背景與人物故事", "多結局與隱藏劇情"],
  },
  {
    id: "q6",
    short: "Q6 三消體驗",
    text: "6. 你覺得三消闖關的遊戲體驗如何？",
    multi: false,
    options: ["很有趣，會想一直挑戰", "不錯，但希望關卡更多變", "難度太高", "難度太低", "對三消玩法沒有興趣", "尚未體驗"],
  },
  {
    id: "q7",
    short: "Q7 操作與介面",
    text: "7. 你覺得遊戲的操作與介面是否容易理解？",
    multi: false,
    options: ["非常直覺，操作順暢", "大致容易理解", "有些功能不容易找到", "操作流程不夠清楚", "曾遇到卡頓、錯誤或無法操作"],
  },
  {
    id: "q8",
    short: "Q8 優先新增功能",
    text: "8. 你最希望《千古遇》優先新增什麼功能？（可複選）",
    multi: true,
    options: ["角色好感度與養成系統", "更多戀愛劇情與互動選項", "角色語音與背景音樂", "更多抽卡角色與限定卡面", "新玩法與挑戰關卡", "每日任務、成就與獎勵"],
  },
  {
    id: "q9",
    short: "Q9 回流意願",
    text: "9. 如果未來持續更新，你願意再次回來玩嗎？",
    multi: false,
    options: ["非常願意，會期待更新", "願意，有新內容就會回來", "不確定，要看更新內容", "可能不會再玩"],
  },
  {
    id: "q10",
    short: "Q10 推薦意願",
    text: "10. 你願意把《千古遇》推薦給朋友嗎？",
    multi: false,
    options: ["非常願意", "願意", "普通，還需要改善", "暫時不會推薦", "完全不會推薦"],
  },
];

export const FREE_TEXT_TITLE = "11. 其他建議（自由填寫）";
export const FREE_TEXT_HINT = "你希望《千古遇》改善什麼？有沒有遇到 BUG、想增加的角色、劇情或功能？歡迎告訴我！";
export const FREE_TEXT_MAX = 1000;
export const DEVICE_ID_MAX = 64;
export const UA_MAX = 160;
/** One submission per device per window. */
export const RATE_WINDOW_MS = 10 * 60 * 1000;
/** Looser per-IP cap within the same window (stops a script minting fresh device ids). */
export const RATE_IP_MAX = 5;

export type Answers = Record<ChoiceQuestion["id"], string | string[]>;
export type FeedbackInput = { answers: Answers; other: string; deviceId: string };

export type FeedbackError = "invalid" | "missing" | "too_long" | "rate_limited";

/** Strip control chars (keep newlines/tabs), normalise line endings, trim, cap. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "").trim();
  return Array.from(s).slice(0, max).join("");
}

/** True while every Q1–Q10 has an answer (multi-select ≥ 1). Client-side gate for 送出. */
export function isComplete(answers: Partial<Record<string, string | string[]>>): boolean {
  return QUESTIONS.every((q) => {
    const a = answers[q.id];
    return q.multi ? Array.isArray(a) && a.length > 0 : typeof a === "string" && a.length > 0;
  });
}

/**
 * Validate an untrusted payload. Options must be exact strings from QUESTIONS; multi-selects are
 * de-duplicated and kept in option order; free text is capped (over-long is an error, not a silent cut,
 * so a scripted megabyte body is rejected outright).
 */
export function validateFeedback(raw: unknown): { ok: true; value: FeedbackInput } | { ok: false; error: FeedbackError } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid" };
  const r = raw as Record<string, unknown>;
  const ans = r.answers;
  if (!ans || typeof ans !== "object" || Array.isArray(ans)) return { ok: false, error: "invalid" };
  const a = ans as Record<string, unknown>;
  for (const k of Object.keys(a)) if (!QUESTIONS.some((q) => q.id === k)) return { ok: false, error: "invalid" };
  const out = {} as Answers;
  for (const q of QUESTIONS) {
    const v = a[q.id];
    if (q.multi) {
      if (v === undefined || (Array.isArray(v) && v.length === 0)) return { ok: false, error: "missing" };
      if (!Array.isArray(v) || v.length > q.options.length * 2) return { ok: false, error: "invalid" };
      if (!v.every((x) => typeof x === "string" && q.options.includes(x))) return { ok: false, error: "invalid" };
      out[q.id] = q.options.filter((o) => v.includes(o));
    } else {
      if (v === undefined || v === "") return { ok: false, error: "missing" };
      if (typeof v !== "string" || !q.options.includes(v)) return { ok: false, error: "invalid" };
      out[q.id] = v;
    }
  }
  if (r.other !== undefined && typeof r.other !== "string") return { ok: false, error: "invalid" };
  if (typeof r.other === "string" && r.other.length > FREE_TEXT_MAX * 2) return { ok: false, error: "too_long" };
  const other = cleanText(r.other, FREE_TEXT_MAX + 1);
  if (Array.from(other).length > FREE_TEXT_MAX) return { ok: false, error: "too_long" };
  const deviceId = typeof r.deviceId === "string" ? r.deviceId.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) return { ok: false, error: "invalid" };
  return { ok: true, value: { answers: out, other, deviceId } };
}

/** Sliding per-key limiter (in-memory; per server instance). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private windowMs: number;
  private max: number;
  constructor(windowMs: number, max: number) {
    this.windowMs = windowMs;
    this.max = max;
  }
  /** Would `key` be allowed at `now`? Does not record. */
  allowed(key: string, now: number): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, list);
    return list.length < this.max;
  }
  record(key: string, now: number): void {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
  }
}

/** "2026-11-05 21:40:12" in Asia/Taipei (UTC+8, no DST). */
export function taipeiTimestamp(date: Date): string {
  const t = new Date(date.getTime() + 8 * 3600_000).toISOString();
  return `${t.slice(0, 10)} ${t.slice(11, 19)}`;
}

/** Short, readable user agent: device/OS/browser hints, capped. */
export function shortUserAgent(ua: string | null | undefined): string {
  const s = cleanText(ua ?? "", 400);
  if (!s) return "";
  const parts: string[] = [];
  const ios = s.match(/(iPhone|iPad|iPod).*?OS (\d+[_.]\d+)/);
  const android = s.match(/Android (\d+(?:\.\d+)?)/);
  if (ios) parts.push(`${ios[1]} iOS ${ios[2].replace("_", ".")}`);
  else if (android) parts.push(`Android ${android[1]}`);
  else if (/Windows NT/.test(s)) parts.push("Windows");
  else if (/Mac OS X/.test(s)) parts.push("macOS");
  else if (/Linux/.test(s)) parts.push("Linux");
  const browsers: [RegExp, string][] = [
    [/\bLine\/(\d+)/, "LINE"],
    [/FBAN|FBAV/, "Facebook"],
    [/Instagram/, "Instagram"],
    [/CriOS\/(\d+)/, "Chrome"],
    [/FxiOS\/(\d+)/, "Firefox"],
    [/EdgiOS\/(\d+)|Edg\/(\d+)/, "Edge"],
    [/SamsungBrowser\/(\d+)/, "Samsung"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+)[\d.]* .*Safari/, "Safari"],
  ];
  for (const [re, name] of browsers) {
    const m = s.match(re);
    if (m) {
      const v = m.slice(1).find((x) => x);
      parts.push(v ? `${name} ${v}` : name);
      break;
    }
  }
  const out = parts.length ? parts.join(" · ") : s;
  return out.slice(0, UA_MAX);
}

/** The JSON the server POSTs to the Apps Script web app (token added by the server only). */
export function sheetPayload(input: FeedbackInput, meta: { submittedAt: string; device: string; version: string }) {
  return {
    submittedAt: meta.submittedAt,
    answers: input.answers,
    other: input.other,
    device: meta.device,
    version: meta.version,
  };
}

// ── client-side local state (localStorage) ─────────────────────────────────────

export const SURVEY_STORE_KEY = "qgy-survey-v1";
export const DEVICE_KEY = "qgy-device-id";
export type SurveyLocal = { invited?: boolean; dismissed?: boolean; submittedAt?: number };

/** Show the gentle invite only once, and never after a submit or dismiss. */
export function shouldInvite(local: SurveyLocal, playedOnce: boolean): boolean {
  return playedOnce && !local.invited && !local.dismissed && !local.submittedAt;
}
