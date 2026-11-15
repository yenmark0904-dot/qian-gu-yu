import { test } from "node:test";
import assert from "node:assert/strict";
import { BRUSH_PUNCT, brushPhrases, layoutBrushLines } from "./brush-break.ts";
import { CHARACTERS } from "./data.ts";
import * as extra from "./stories-extra.ts";

// every string BrushLine writes: the gacha reveal (line), and the 「」-wrapped card / 助陣 cut-in (line + stories-extra love)
function brushTexts() {
  const raw: string[] = CHARACTERS.map((c) => c.line);
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const love = (o as { love?: unknown }).love;
    if (typeof love === "string") raw.push(love);
    for (const v of Object.values(o)) walk(v);
  };
  walk(extra);
  return raw.flatMap((t) => [t, `「${t}」`]);
}

// metrics of .rv-love / .rv-love-card at 390 and 360px wide phones, plus a narrow and a wide sheet
const METRICS = [
  { maxWidth: 292.8, fontSize: 28.86, letterSpacing: 1.44 },
  { maxWidth: 284.8, fontSize: 26.64, letterSpacing: 1.33 },
  { maxWidth: 318, fontSize: 20.8, letterSpacing: 0.73 },
  { maxWidth: 288, fontSize: 20.8, letterSpacing: 0.73 },
  { maxWidth: 200, fontSize: 20.8, letterSpacing: 0.83 },
  { maxWidth: 600, fontSize: 30, letterSpacing: 1.8 },
];
const words = (s: string) => Array.from(s).filter((ch) => !BRUSH_PUNCT.test(ch)).length;

test("brush line: phrase splitting and line layout keep the text byte for byte", () => {
  const texts = brushTexts();
  assert.ok(texts.length >= 130, `${texts.length} love-line strings`);
  for (const t of texts) {
    const phrases = brushPhrases(t);
    assert.equal(phrases.join(""), t);
    assert.ok(phrases.every((p) => p.length > 0));
    for (const m of METRICS) assert.equal(layoutBrushLines(t, m).join(""), t);
  }
  assert.deepEqual(brushPhrases("「天下皆在朕掌中，唯獨你......讓朕想留在你身邊」"), ["「天下皆在朕掌中，", "唯獨你......", "讓朕想留在你身邊」"]);
});

test("brush line: no punctuation-led lines, no split ……, no one- or two-character lines, all lines fit", () => {
  for (const t of brushTexts()) {
    for (const m of METRICS) {
      const lines = layoutBrushLines(t, m);
      const at = `${JSON.stringify(lines)} @${m.maxWidth}`;
      for (const [i, line] of lines.entries()) {
        if (i > 0) assert.doesNotMatch(line, /^[，。、！？；：…」』）.,!?;:—]/, at);
        assert.doesNotMatch(line, /[「『（]$/, at);
        if (words(t) >= 6) assert.ok(words(line) >= 3, at);
        const w = Array.from(line).reduce((s, ch) => s + (ch === "." ? 0.422 * m.fontSize : m.fontSize + m.letterSpacing), 0);
        assert.ok(w - m.letterSpacing <= m.maxWidth + 0.5, `overflow ${at}`);
      }
      for (let i = 1; i < lines.length; i++) {
        const seam = lines[i - 1].slice(-1) + lines[i][0];
        assert.ok(!/^(\.\.|……|——)$/.test(seam), `split ellipsis ${at}`);
      }
    }
  }
});
