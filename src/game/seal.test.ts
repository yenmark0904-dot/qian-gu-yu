import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("千古遇 seal artwork ships with its glyph-source license", () => {
  const svg = readFileSync("public/seal/qgy-seal.svg", "utf8");
  assert.match(svg, /^<svg /);
  assert.match(svg, /千古遇/);
  assert.ok(svg.length < 60_000);
  const lic = readFileSync("public/seal/sealie-OFL.txt", "utf8");
  assert.match(lic, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(lic, /U\+3D680/);
  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\/seal\/qgy-seal\.svg/);
});
