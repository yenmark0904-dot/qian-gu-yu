import test from "node:test";
import assert from "node:assert/strict";
import { renderInkFrame } from "./summon-ink.ts";
test("owner canvas prelude paints every drop / bloom / fade phase with finite coordinates", () => {
  let calls = 0;
  const check = (...args: unknown[]) => {
    calls++;
    for (const n of args)
      if (typeof n === "number") assert.ok(Number.isFinite(n), `non-finite paint coordinate ${n}`);
  };
  const ctx = new Proxy(
    {},
    {
      get: (_, name) =>
        name === "createRadialGradient"
          ? (...args: unknown[]) => {
              check(...args);
              return { addColorStop: check };
            }
          : check,
      set: () => true,
    },
  ) as CanvasRenderingContext2D;
  for (const [w, h] of [
    [390, 844],
    [1280, 800],
  ])
    for (const t of [0, 0.1, 0.2, 0.6, 0.72, 1, 1.8, 2.5]) renderInkFrame(ctx, w!, h!, t);
  assert.ok(calls > 2000);
});
