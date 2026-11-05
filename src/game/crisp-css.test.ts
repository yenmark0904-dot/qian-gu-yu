import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// iOS WebKit regressions (t142u): smeared 宣紙 ink and ragged 天命書 prose.
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`);
  assert.ok(i >= 0, sel);
  return css.slice(i, css.indexOf("}", i));
};

test("宣紙: no filter, mask or blurred shadow on anything that contains the ink", () => {
  for (const sel of [".xuan", ".xuan-sheet", ".xuan .rv-brush-line"]) {
    const r = rule(sel);
    assert.doesNotMatch(r, /(^|\s|-)(filter|mask-image|transform)\s*:/, sel);
    assert.doesNotMatch(r, /text-shadow:(?!\s*none)/, sel);
  }
  // deckled edge is a vector clip on the paper layer; the drop shadow lives on its own empty layer
  assert.match(rule(".xuan-paper"), /clip-path: var\(--xuan-deckle\)/);
  assert.match(rule(".xuan-shadow"), /filter: drop-shadow/);
  // finished ink animations end with no filter/transform left behind
  for (const k of ["@keyframes rv-ink {", "@keyframes rv-ink-paper {"]) {
    const i = css.indexOf(k);
    const end = css.indexOf("\n}", i);
    assert.match(css.slice(i, end), /to \{[^}]*filter: none;[^}]*transform: none;/, k);
  }
});

test("天命書 / 專屬物語 prose wraps normally (no balance/pretty), justified", () => {
  const r = rule(".tale-screen .tale-text");
  assert.match(r, /text-wrap: wrap;/);
  assert.match(r, /text-wrap-style: auto;/);
  assert.match(rule(".tale-screen .tale-text:not(.text-center)"), /text-align: justify;/);
});
