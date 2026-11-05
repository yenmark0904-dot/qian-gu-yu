/**
 * Line breaking for the brush-written love line (BrushLine).
 *
 * The text is never altered: phrases and lines are plain slices whose concatenation is the input, byte for byte.
 * - brushPhrases: a phrase ends after its trailing punctuation (，。！？、；：…… —— 」…); opening marks (「『（)
 *   start the next phrase.
 * - layoutBrushLines: picks break points (a balanced, Knuth-style DP) that prefer phrase boundaries, never start a
 *   line with punctuation or split …… / ——, never leave a line of only one or two characters, and keep the lines
 *   of a paragraph close to the same width.
 */
export const BRUSH_PUNCT = /[，。、！？；：…「」『』（）.,!?;:~～—\s]/;
const OPENING = /[「『（(]/;

const isPunct = (ch: string) => BRUSH_PUNCT.test(ch);
const isOpening = (ch: string) => OPENING.test(ch);

export function brushPhrases(text: string): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  let cur = "";
  let sawWord = false; // current phrase has a non-punctuation character
  let closed = false; // …and punctuation has followed it
  for (const ch of chars) {
    if (isOpening(ch)) {
      if (sawWord) {
        out.push(cur);
        cur = "";
        sawWord = false;
        closed = false;
      }
      cur += ch;
    } else if (isPunct(ch)) {
      cur += ch;
      if (sawWord) closed = true;
    } else {
      if (closed) {
        out.push(cur);
        cur = "";
        closed = false;
      }
      cur += ch;
      sawWord = true;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Advance of one character in em (QGY Xingshu: every glyph is 1em except the ASCII full stop). */
export function brushAdvanceEm(ch: string) {
  return ch === "." ? 0.422 : 1;
}
/** Letter-spacing a glyph carries: none on the dots of an ASCII ellipsis (styles.css .rv-ink-dot). */
const spaced = (ch: string) => ch !== ".";

export type BrushMetrics = {
  /** available line width in px */
  maxWidth: number;
  fontSize: number;
  letterSpacing: number;
};

const MIN_LINE_WORDS = 3; // a line never holds just one or two characters
const MID_PHRASE_BREAK = 70; // cost of breaking inside a phrase instead of after its punctuation
const SHORT_FRAGMENT = 220; // …that leaves 1–2 characters of the phrase on one side
const TWO_FRAGMENT = 70;
const SHORT_LINE = 2000;
const OVERFLOW = 1e6;
const EXTRA_LINE = 20; // per line beyond the fewest that fit (up to two more, so phrases can keep a line each)
const BALANCE = 2; // × (shortfall from the even line length, in characters)²
const IN_WORD = 60; // …that also splits a word (星|光), when Intl.Segmenter is available

// characters that lean on a neighbour: a break just before a suffix / particle / locative (盼|著, 看得到|的,
// 營帳|裡) or just after a determiner / adverb / preposition (一|個, 仍|替, 與|你) reads badly, so such
// mid-phrase breaks cost more
const LEANS_BACK = new Set(Array.from("著着了過們得的裡邊"));
const LEANS_ON = new Set(Array.from("一這那每把被將仍還也就都才便又再更最很太只與對給替為向和跟在"));
const LEAN = 50;
// …while a clause often turns just before a linking adverb (舟還橫著，我 | 卻在等…)
const TURNS = new Set(Array.from("卻便就才也還"));
const TURN = 20;

/** Code-point offsets where a zh-Hant word starts (null when the runtime has no Intl.Segmenter). */
function wordStarts(text: string): Set<number> | null {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: "word" }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (!Seg) return null;
  const starts = new Set<number>();
  let at = 0;
  for (const { segment } of new Seg("zh-Hant", { granularity: "word" }).segment(text)) {
    starts.add(at);
    at += Array.from(segment).length;
  }
  return starts;
}

export function layoutBrushLines(text: string, m: BrushMetrics): string[] {
  const chars = Array.from(text);
  const n = chars.length;
  if (!n || !(m.maxWidth > 0) || !(m.fontSize > 0)) return [text];
  const unit = m.fontSize + m.letterSpacing;
  const adv = chars.map((ch) => brushAdvanceEm(ch) * m.fontSize + (spaced(ch) ? m.letterSpacing : 0));
  const pre = [0];
  for (const a of adv) pre.push(pre[pre.length - 1] + a);
  const words = [0];
  for (const ch of chars) words.push(words[words.length - 1] + (isPunct(ch) ? 0 : 1));
  // a row's last glyph drops its letter-spacing (styles.css .rv-brush-row > .rv-ink:last-child)
  const width = (i: number, j: number) => pre[j] - pre[i] - (spaced(chars[j - 1]) ? m.letterSpacing : 0);
  const fits = (i: number, j: number) => width(i, j) <= m.maxWidth + 0.5;
  const phraseStart: number[] = [];
  const phraseEnd: number[] = [];
  {
    let at = 0;
    for (const ph of brushPhrases(text)) {
      const len = Array.from(ph).length;
      for (let k = 0; k < len; k++) {
        phraseStart.push(at);
        phraseEnd.push(at + len);
      }
      at += len;
    }
  }
  // break before index i (1..n-1)
  const breakCost: (number | null)[] = Array(n + 1).fill(null);
  breakCost[n] = 0;
  const starts = wordStarts(text);
  for (let i = 1; i < n; i++) {
    if (isPunct(chars[i]) && !isOpening(chars[i])) continue; // no line starts with ，。…」
    if (isOpening(chars[i - 1])) continue; // 「 stays with what it opens
    if (phraseStart[i] === i) {
      breakCost[i] = 0;
      continue;
    }
    const before = words[i] - words[phraseStart[i]];
    const after = words[phraseEnd[i]] - words[i];
    let c = MID_PHRASE_BREAK;
    const minSide = Math.min(before, after);
    if (minSide < 2) c += SHORT_FRAGMENT;
    else if (minSide < 3) c += TWO_FRAGMENT;
    if (starts && !starts.has(i)) c += IN_WORD;
    if (LEANS_BACK.has(chars[i]) || LEANS_ON.has(chars[i - 1])) c += LEAN;
    else if (TURNS.has(chars[i])) c -= TURN;
    breakCost[i] = c;
  }
  const totalWords = words[n];
  const lineCost = (i: number, j: number, target: number) => {
    let c = 0;
    if (!fits(i, j)) c += OVERFLOW;
    if (totalWords >= 2 * MIN_LINE_WORDS && words[j] - words[i] < MIN_LINE_WORDS) c += SHORT_LINE;
    const slack = (target - width(i, j)) / unit;
    return c + BALANCE * slack * slack;
  };
  const solve = (lines: number) => {
    const target = (pre[n] - m.letterSpacing * lines) / lines;
    const INF = Number.POSITIVE_INFINITY;
    const dp: number[][] = Array.from({ length: lines + 1 }, () => Array(n + 1).fill(INF));
    const from: number[][] = Array.from({ length: lines + 1 }, () => Array(n + 1).fill(-1));
    dp[0][0] = 0;
    for (let k = 1; k <= lines; k++)
      for (let j = 1; j <= n; j++) {
        if (breakCost[j] === null) continue;
        for (let i = 0; i < j; i++) {
          if (dp[k - 1][i] === INF) continue;
          const v = dp[k - 1][i] + lineCost(i, j, target) + (breakCost[j] as number);
          if (v < dp[k][j]) {
            dp[k][j] = v;
            from[k][j] = i;
          }
        }
      }
    if (dp[lines][n] === INF) return null;
    const cuts: number[] = [];
    for (let k = lines, j = n; k > 0; k--) {
      cuts.unshift(j);
      j = from[k][j];
    }
    return { cost: dp[lines][n], cuts };
  };
  // fewest lines that fit
  let minLines = 1;
  while (minLines < n && !fits(0, n)) {
    const s = solve(minLines);
    if (s && s.cost < OVERFLOW) break;
    minLines++;
  }
  let best: { cost: number; cuts: number[] } | null = null;
  for (let l = minLines; l <= Math.min(n, minLines + 2); l++) {
    const s = solve(l);
    if (!s) continue;
    const cost = s.cost + (l - minLines) * EXTRA_LINE;
    if (!best || cost < best.cost) best = { cost, cuts: s.cuts };
  }
  if (!best) return [text];
  const out: string[] = [];
  let at = 0;
  for (const c of best.cuts) {
    out.push(chars.slice(at, c).join(""));
    at = c;
  }
  return out;
}

/**
 * Reads the widest line a BrushLine paragraph may take. Its sheet shrink-wraps (fit-content), so probe with an
 * over-long but breakable line, and let already laid-out rows wrap while measuring (styles.css
 * .rv-brush-measuring) so their old width cannot hold the sheet open.
 */
export function measureBrushLine(p: HTMLElement): BrushMetrics {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "display:block;height:0;overflow:hidden;visibility:hidden";
  p.classList.add("rv-brush-measuring");
  probe.textContent = "永".repeat(120);
  p.appendChild(probe);
  const cs = getComputedStyle(p);
  const maxWidth = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  p.removeChild(probe);
  p.classList.remove("rv-brush-measuring");
  const fontSize = parseFloat(cs.fontSize);
  const ls = parseFloat(cs.letterSpacing);
  return { maxWidth, fontSize, letterSpacing: Number.isFinite(ls) ? ls : 0 };
}
