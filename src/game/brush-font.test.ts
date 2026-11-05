import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BRUSH_FONT_URL, BRUSH_FONT_VERSION } from "./brush-font.ts";

const root = (p: string) => new URL(`../../${p}`, import.meta.url);

test("行書 font URL is content-hashed: a rebuilt woff2 can never be served from a stale cache", () => {
  const md5 = createHash("md5")
    .update(readFileSync(root("public/fonts/qgy-xingshu.woff2")))
    .digest("hex");
  assert.equal(
    BRUSH_FONT_VERSION,
    md5.slice(0, 10),
    "bump BRUSH_FONT_VERSION (and styles.css) to the new md5",
  );
  const css = readFileSync(root("src/styles.css"), "utf8");
  const srcs = [...css.matchAll(/url\("(\/fonts\/qgy-xingshu\.woff2[^"]*)"\)/g)].map((m) => m[1]);
  assert.deepEqual(srcs, [BRUSH_FONT_URL], "@font-face src must be exactly BRUSH_FONT_URL");
  // the root route preloads the same URL (an exact match, or the browser downloads it twice)
  assert.match(
    readFileSync(root("src/routes/__root.tsx"), "utf8"),
    /rel: "preload", as: "font", type: "font\/woff2", href: BRUSH_FONT_URL, crossOrigin: "anonymous"/,
  );
});
