import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { CHARACTERS } from "./data.ts";
import * as extra from "./stories-extra.ts";

// scripts/xingshu-font-cmap.txt is dumped from public/fonts/qgy-xingshu.woff2's cmap (fontTools) when the subset is rebuilt.
test("行書 font: every love-line character (data.ts line + stories-extra love) has a glyph in the bundled QGY Xingshu subset", () => {
  const cmap = new Set(readFileSync(new URL("../../scripts/xingshu-font-cmap.txt", import.meta.url), "utf8").trim());
  const lines: string[] = CHARACTERS.map((c) => c.line);
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const love = (o as { love?: unknown }).love;
    if (typeof love === "string") lines.push(love);
    for (const v of Object.values(o)) walk(v);
  };
  walk(extra);
  assert.ok(lines.length > CHARACTERS.length, "stories-extra love lines found");
  const missing = new Set<string>();
  for (const line of lines) for (const ch of `「${line}」`) if (ch.trim() && !cmap.has(ch)) missing.add(ch);
  assert.deepEqual([...missing], []);
  const size = statSync(new URL("../../public/fonts/qgy-xingshu.woff2", import.meta.url)).size;
  assert.ok(size > 50_000 && size < 400_000, `font size ${size}`);
  const license = readFileSync(new URL("../../public/fonts/qgy-xingshu-OFL.txt", import.meta.url), "utf8");
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(license, /Copyright 2021 The Yuji Project Authors/);
  assert.match(license, /QGY Xingshu/);
  assert.doesNotMatch(license, /MasaFont|Kouzan/);
  assert.doesNotMatch(readFileSync(new URL("../styles.css", import.meta.url), "utf8"), /MasaFont/);
});
