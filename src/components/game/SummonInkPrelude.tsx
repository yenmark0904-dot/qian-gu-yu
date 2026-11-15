/** Canvas ink prelude ported from the owner-provided 宮門牽緣 HTML.
 * Presentation only: never draws a result, charges ink, or awards an item.
 */
import { useEffect, useRef } from "react";
import { renderInkFrame } from "@/game/summon-ink";

export function SummonInkPrelude({ onDone, lite = false }: { onDone: () => void; lite?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const node = canvas.current;
    const ctx = node?.getContext("2d");
    if (!node || !ctx || lite) {
      const t = window.setTimeout(() => done.current(), 100);
      return () => window.clearTimeout(t);
    }
    const bounds = node.getBoundingClientRect(),
      w = bounds.width,
      h = bounds.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    node.width = Math.round(w * dpr);
    node.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let frame = 0,
      start: number | null = null,
      last = 0;
    const tick = (now: number) => {
      start ??= now;
      const t = (now - start) / 1000;
      if (now - last >= 1000 / 30) {
        renderInkFrame(ctx, w, h, t);
        last = now;
      }
      if (t >= 2.5) {
        ctx.clearRect(0, 0, w, h);
        done.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, w, h);
    };
  }, [lite]);
  return (
    <div className="pg-ink-prelude" aria-hidden>
      <canvas ref={canvas} />
      <span>一墨落，千年逢</span>
    </div>
  );
}
