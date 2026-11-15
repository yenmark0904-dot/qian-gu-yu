/** Owner-provided 宮門牽緣: pure canvas paint only, no game state. */
function inkNoise(a: number, seed: number) {
  return (
    Math.sin(a * 3 + seed) * 0.38 +
    Math.sin(a * 7 - seed * 1.7) * 0.18 +
    Math.sin(a * 13 + seed * 0.4) * 0.09 +
    Math.sin(a * 23 + seed) * 0.035
  );
}
export function renderInkFrame(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5,
    cy = h * 0.72,
    impact = 0.72,
    age = time - impact;
  const intro = Math.min(1, time / 0.22),
    fade = time > 2.05 ? Math.max(0, (2.5 - time) / 0.45) : 1;
  ctx.save();
  ctx.globalAlpha = intro * fade;
  // Soft pool of reflected lantern light establishes the water surface without a bright disc.
  const water = ctx.createRadialGradient(cx, cy, 2, cx, cy, w * 0.8);
  water.addColorStop(0, "rgba(169,184,189,.23)");
  water.addColorStop(0.44, "rgba(92,115,136,.09)");
  water.addColorStop(1, "rgba(35,53,70,0)");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.46);
  ctx.fillStyle = water;
  ctx.translate(-cx, -cy);
  ctx.fillRect(cx - w, cy - w, w * 2, w * 2);
  ctx.restore();
  // Only short, near-transparent reflection strokes; no glowing concentric target.
  for (let j = 0; j < 15; j++) {
    const yy = cy - 32 + j * 5.8;
    ctx.strokeStyle = `rgba(199,198,182,${0.012 + (j % 3) * 0.005})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.38 + Math.sin(j * 2) * 20, yy);
    ctx.bezierCurveTo(cx - 40, yy + 1, cx + 35, yy - 2, cx + w * 0.35 - Math.cos(j) * 20, yy);
    ctx.stroke();
  }
  if (time > 0.15 && age < 0) {
    const f = Math.min(1, (time - 0.15) / (impact - 0.15)),
      yy = h * 0.27 + (cy - h * 0.27) * f * f;
    const radius = w * 0.009,
      stretch = 1 + f * 0.55;
    ctx.save();
    ctx.translate(cx, yy);
    ctx.scale(1, stretch);
    // Tight opaque body, edge light only. No diamond rotation or teardrop icon.
    const drop = ctx.createRadialGradient(-radius * 0.35, -radius * 0.4, 0.1, 0, 0, radius * 1.1);
    drop.addColorStop(0, "#53606b");
    drop.addColorStop(0.22, "#1b2530");
    drop.addColorStop(0.65, "#05090f");
    drop.addColorStop(1, "#02050b");
    ctx.fillStyle = drop;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(222,216,192,.38)";
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.ellipse(
      -radius * 0.1,
      -radius * 0.1,
      radius * 0.75,
      radius * 0.85,
      0,
      Math.PI,
      Math.PI * 1.42,
    );
    ctx.stroke();
    ctx.restore();
    // Very short translucent motion trace at the end of the fall.
    if (f > 0.6) {
      ctx.strokeStyle = "rgba(16,25,37,.18)";
      ctx.lineWidth = radius * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, yy - radius * stretch * 2);
      ctx.lineTo(cx, yy - radius * stretch * 4);
      ctx.stroke();
    }
  }
  if (age >= 0) {
    const q = Math.min(1, age / 1.7),
      growth = 1 - Math.exp(-age * 2.3),
      base = w * (0.012 + 0.19 * growth);
    // Underwater, soft branching plumes drift at different speeds instead of scaling one blob.
    for (let j = 0; j < 13; j++) {
      const a = j * 2.399,
        reach = base * (0.35 + (j % 5) * 0.17),
        px = cx + Math.cos(a) * reach,
        py = cy + Math.sin(a) * reach * 0.29 + q * q * (j % 3) * 9;
      const mist = ctx.createRadialGradient(px, py, 0, px, py, base * (0.28 + (j % 3) * 0.12));
      mist.addColorStop(0, `rgba(7,15,25,${0.14 * (1 - q * 0.3)})`);
      mist.addColorStop(0.55, "rgba(12,24,38,.07)");
      mist.addColorStop(1, "rgba(10,22,37,0)");
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, 0.5);
      ctx.translate(-px, -py);
      ctx.fillStyle = mist;
      ctx.fillRect(px - base, py - base, base * 2, base * 2);
      ctx.restore();
    }
    // Nested irregular contours create a dense core with translucent, feathered outskirts.
    for (let layer = 17; layer >= 0; layer--) {
      const factor = 0.32 + layer * 0.052,
        r = base * factor;
      ctx.beginPath();
      for (let k = 0; k <= 160; k++) {
        const a = (k / 160) * Math.PI * 2,
          noise = inkNoise(a, 1.7 + q * 0.35) + inkNoise(a + 0.6, layer * 0.09) * 0.24;
        const edge = r * (1 + noise * (0.24 + q * 0.19));
        const x = cx + Math.cos(a) * edge + Math.sin(a * 4 + q) * q * 2.3;
        const y = cy + Math.sin(a) * edge * (0.34 + q * 0.06) + Math.sin(a * 3 + 2) * q * 2;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle =
        layer > 11 ? "rgba(6,13,23,.025)" : layer > 5 ? "rgba(3,9,17,.055)" : "rgba(2,6,13,.16)";
      ctx.fill();
    }
    // Fine ink filaments fade out near their tips.
    for (let j = 0; j < 11; j++) {
      const a = j * 2.399 + 0.2,
        reach = base * (0.9 + (j % 4) * 0.12),
        x = cx + Math.cos(a) * reach,
        y = cy + Math.sin(a) * reach * 0.42;
      ctx.strokeStyle = `rgba(9,18,30,${0.12 * (1 - q * 0.6)})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * base * 0.5, cy + Math.sin(a) * base * 0.17);
      ctx.bezierCurveTo(
        cx + Math.cos(a + 0.23) * base,
        cy + Math.sin(a + 0.23) * base * 0.35,
        x + Math.sin(a) * 9,
        y + 5,
        x,
        y,
      );
      ctx.stroke();
    }
    // Three low-contrast pressure waves with broken highlights, perspective-correct ellipses.
    for (let j = 0; j < 3; j++) {
      const t = age - j * 0.14;
      if (t < 0 || t > 1.5) continue;
      const r = w * (0.018 + 0.43 * (1 - Math.exp(-t * 1.65))),
        opacity = 0.22 * Math.exp(-t * 2.4) * (1 - j * 0.18);
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = `rgba(205,217,224,${opacity})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.26, 0, 0.12, Math.PI * 0.82);
      ctx.stroke();
      ctx.strokeStyle = `rgba(175,187,199,${opacity * 0.65})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 1, r, r * 0.26, 0, Math.PI * 1.12, Math.PI * 1.9);
      ctx.stroke();
    }
    // Tiny secondary drops fall back almost immediately; no firework-like spray.
    if (age < 0.25) {
      for (let j = 0; j < 4; j++) {
        const t = age / 0.25,
          x = cx + (j - 1.5) * 12 * t,
          y = cy - 9 * Math.sin(t * Math.PI);
        ctx.globalAlpha = intro * fade * (1 - t) * 0.55;
        ctx.fillStyle = "#0d1722";
        ctx.beginPath();
        ctx.ellipse(x, y, 1.2, 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
