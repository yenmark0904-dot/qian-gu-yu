# 三人戰隊 + 戰鬥直式版面 (2026-11-08)

User asks (pt434u): 沒有單人助戰、統一三人戰隊；可自動配對戰隊；三消改橫的（加寬）；破關條件移到下面並縮小；
墨厄區要大（之後放圖片）；我的戰隊放在墨厄下面。

## Combat layout (主線 / 深宮 / 劇情三消, portrait)
top bar → **large 墨厄 stage** (`cb-enemy`, flex-fills the leftover height, min 7.5rem, max 24rem; name + HP bar +
倒數 in one slim row at its foot; status note floats over the art) → **我的戰隊** row (`cb-team`, 3 compact cards:
ring + name + skill, tap a full ring to 發動) → **full-width board** (`m3-board`, `calc(100% - .75rem)`, only narrows on
short phones so the stage keeps its minimum; COLS/ROWS and rules unchanged) → **compact 破關條件** (`m3-hud`, one
~29px row: goal chips + score + star bar).

Measured (headless, reduced motion): 390×844 → board 378px wide, 墨厄 art 201px tall, 破關條件 29px.
360×640 → board 294px, art 93px. 375×667 (深宮) → board 318px.

## 墨厄 picture slot
`ENEMY_IMAGES` in `src/game/combat.ts`: put a file in `public/enemies/` and map it by enemy id (`lv-10`), name
(`墨魅`, `青川墨蛟`) or art kind (`shade`…). Or set `image` on an `EnemyDef`. Shown with `object-fit: contain`;
the code-drawn ink body stays as fallback.

## 三人戰隊 / 自動配對 (`src/game/team.ts`)
- No single-assist dock / picker any more. Every fight uses `fightTeam(saved 編隊, owned, roster, pin)`:
  the saved 編隊 (order kept) topped up to three by 自動配對. Fewer than three only if fewer are owned.
- 自動配對: 固定助陣 pin first (next to a hand-picked 編隊 it takes the first free seat), then rarity → 緣分 step →
  copies; within the same rarity a skill adding a new effect kind (strike / +步 / 化封 / 得分 / 送特殊玉) wins.
- Empty / short 編隊 at fight start → the auto team is saved as the 編隊 (主線, 深宮, 劇情, 討伐).
- Buttons: intro card 「自動配對」 (`cb-team-auto`), 編隊 picker 「自動配對」 (`cb-team-auto-pick`), 討伐 lobby (`raid-auto`).
- Codex 「固定助陣」 now means "auto-pair puts him first".

## Tests
- `src/game/team.test.ts` (in `npm test`): clean, pin first, rarity first, diversity, top-up, empty auto-fill, image slot.
- `scripts/combat-ui-test.mjs`: A–F incl. layout order/size asserts at 390×844, 375×667, 360×640; auto-filled team; 自動配對.
- `scripts/raid-ui-test.mjs`: 2-person 編隊 is topped up to 3; 自動配對 button.
