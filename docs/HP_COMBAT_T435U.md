# 氣血取代步數（t435u）

Shared combat (主線關卡、深宮、劇情事件) now runs on player 氣血 instead of 步.

| Item | Rule |
|---|---|
| Max 氣血 | `round(def.moves × 40 / 50) × 50` (第 1 關 25 → 1000) |
| 墨厄出手 | 140 傷害；首領 ×1.25 (175)；第二形態 ×1.2 (168 / 210)。標籤「傷害 N」 |
| 破厄後 | 殘墨每回 −40 血（讓戰鬥有終點；不影響分數） |
| 敗北 | 氣血 ≤ 0 且尚未達成條件 →「氣血耗盡」 |
| 回春玉 | kind 6 (`HEAL_KIND`)，`KINDS` 仍為 6；新落下玉石約 8% (`HEAL_CHANCE`)；開局盤不會有現成三連；每顆 +45 血（不超過上限） |
| 圖片 | `public/jade/jade-6-chun@2x.webp`（192², 生成圖，非官方美術） |
| 技能補血 | 舊 `moves: n` → `heal: n × 70`（李白 210/210/280）；輔助：R 筆 70/90/110、王維 +70/70/90（另加原步數折算）、溫庭筠 70/90/110、納蘭 70/90/110 |
| 餘血加分 | `equivMoves = floor(hpLeft / maxHp × def.moves)`，上限 def.moves，套用原 moveBonus；最高 def.moves × moveBonusPer |
| 劇情燈火 | 燈火 > 0 且（破厄 或 撐過 def.moves 回）→ 勝；燈火 0 或氣血 0 → 敗。「還需堅守 N 回」 |
| 討伐 (raid) | 仍用 步；技能 heal 折算為 +⌊heal/70⌋ 步 |

Tests: `src/game/hp.test.ts` (new), match3/bond/assist/combat tests updated, `scripts/combat-ui-test.mjs` case G.

## t436u / t437u — 過關 = 打倒墨厄；下方條 = 我的氣血

- Win (主線 / 深宮 / 劇情三消) only on 破厄 (`fightOutcome` in combat.ts). Score / collect / seal goals stay in
  levels.ts as data (artifacts, enemy balance hints) but never end or gate a fight. 氣血 0 with the 墨厄 alive = loss.
- The post-破厄 −40/turn drain is gone; the fight ends the moment the 墨厄 falls.
- Stars / 墨玉 / 深宮 score: `finalScore(score, hpEquivMoves(...))` → `starsFor` (always ≥ 1★ on a win).
- Story 燈火: win = lamp > 0 AND 破厄; lamp 0 or 氣血 0 = loss. The 「還需堅守 N 回」 survival path is removed.
- Bottom bar (`m3-hud`, `m3-hp-bar`, data-hp/data-maxhp): 「氣血 [bar hp/max]」 + a small running 分; no goal
  chips, no score total, no star markers. ≤25% turns red and pulses. The top-right pill mirrors the same number.

## t438u — 墨紋延伸

- `EnemyDef.spread`: 主線 1–10 → 0, 11–20 → 1, 21–35 → 2, 36–50 → 3; 首領 +1 (第 50 關 = 4).
  深宮 1–10 → 0, 11–20 → 1, 21–35 → 2, 36+ → 3; 試煉首領 +1. From 第 11 關 every board spreads (破封 boards too —
  the veins grow out of the stage's own 墨封).
- `spreadVeins`: each attack, one cell at a time, onto an orthogonal unsealed neighbour of any sealed cell (so it
  forms a vein); seeds one random cell if nothing is sealed. Never seals the last legal move; ≤ `COMBAT.veinCap` (6)
  墨厄 cells. Runs after the existing isolated 墨封 ink. Label 「墨紋延伸 ×N」.
- Unlock = the 墨封 rule (line on it or beside it). Locked jades can't be swapped.
- UI: 墨厄 cells on spreading stages draw as dark branching veins with a 「紋」 tag (`data-vein="1"`, `.m3-seal-vein`);
  intro line `m3-intro-vein` and an enemy trait explain it.

## t439u — corrections

- Top-right HP pill removed (`m3-hp` gone; a `m3-head-spacer` keeps the title centred). 氣血 lives only on the
  bottom `m3-hud` bar, which now also carries the hurt/heal flash.
- 墨紋延伸 now starts at 第 40 關 (`SPREAD_FROM = 40`; 深宮 40 層+): 1 cell per trigger, 首領 (40, 50) +1.
  Triggers: every player move that leaves a 墨厄 墨紋 standing (`creepAfterMove`) and every 墨厄 attack. Veins grow only
  from the 墨厄's own cells (stage 墨封 never creep); an attack with no vein left seeds one. 1–39: isolated locks only.
  The t438u 11/21/36 ramp is gone.
- 墨紋 look: the user's ink-wash painting (`/workspace/ref/mo-wen-ink.jpg`) → `public/effects/mo-wen.webp`
  (480×1200): paper knocked out to alpha by darkness (ink stays the painting's own black, alpha capped at 0.8 so the
  jade shows through), corner calligraphy signature blanked, dense middle cropped (x 20–90 %, y 10–92 %). Every
  墨厄-placed lock draws it with `background-size: 200% 500%` and a per-cell `--vx/--vy` from (col % 2, row % 5) so
  neighbouring locks stitch into one vein, over a soft round ink wash; a slow opacity breathe. No 「紋」 stamp.
  Stage 墨封 keep the simpler 封 lock; 冰封 unchanged.
