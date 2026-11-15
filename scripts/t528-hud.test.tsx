import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { EnemyPanel } from "../src/components/game/CombatHud";
import { enemyForLevel, startEnemy } from "../src/game/combat";
import { LEVELS } from "../src/game/levels";

test("enemy HUD hides outgoing attack telegraph but keeps countdown, shield, and player hit numbers", () => {
  const def = enemyForLevel(LEVELS[0]!);
  const html = renderToStaticMarkup(<EnemyPanel def={def} state={{ ...startEnemy(def), shield: 40 }} attack={{ key: 1 }} hit={{ key: 2, amount: 123, kind: "hit" }} />);
  assert.doesNotMatch(html, /cb-attack-label|cb-stage-attack|傷害 140/);
  assert.match(html, /cb-attacking/);
  assert.match(html, /回後出手/);
  assert.match(html, /盾 40/);
  assert.match(html, /−123/);
});

test("shared fight UI never drains energy or shows attack labels; casts still spend energy", () => {
  const src = readFileSync("src/components/game/Match3.tsx", "utf8");
  assert.doesNotMatch(src, /t\.drain|setNote\(t\.label\)|label: t\.label|jade-6-chun/);
  assert.match(src, /energy: 0/);
  assert.match(src, /jade-0-qing/);
  assert.match(src, /jadeHeal\(w\.collected\)/);
});
