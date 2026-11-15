# V2 戰鬥大改（墨厄・三人編隊・天命連攜・動畫教學）

Working copy: /workspace/qgy-combat (built from qgy-stage-d-backup-20261107, i.e. WITHOUT 命器召喚).

## What is implemented
- One engine (src/game/combat.ts) for all 50 main levels, 深宮 floors, and story match-3 events.
- Visible 墨厄 (HP bar, shield, phase 2 at 40%, attack countdown, skills: ink seal / ice / drain charge / shield / dim lamp).
  Chapter-end bosses: 青川墨蛟, 墨池硯魔, 赤霄墨狻, 紫闕墨蜃, 玉京墨君. 深宮 boss 宮闈墨魘 every 10th floor.
- Up to 3 assists (reuses raid.team). All members charge from normal matches (max 22 per move for a team). Skills cost no move, and skill clears never recharge.
  An empty team falls back to the V1 single-assist dock.
- 天命連攜: two different assists cast within a 1-move window trigger 墨痕共鳴; three trigger 天命共鳴. Both deal bonus damage and shred the shield.
- 破厄 is a bonus only: seals melt, the team gets +50% charge, and a result line is shown. Stars, 墨玉, unlocks and the 深宮 score are unchanged, so anti-cheat stays valid.
- Story event 《一盞留燈》·長明之約 (Qin chapter, vol. 4 finish screen): 燈火守護 plus 噬燈墨影 with 墨厄抗性.
  Ordinary jades deal 0.7× damage, 墨玉 0.5×, and 蜜蠟黃玉 1.6× (yellow jade also feeds the lamp).
  Win = 墨厄 defeated, or the move count runs out while the lamp is still lit. It is skippable and gives no stars or 墨玉. The reward scene text is a PLACEHOLDER.
- Animated coach (CombatCoach.tsx, COACH_VERSION=1). Steps: swap → damage → team → skill → 連攜 → countdown/shield. Only steps whose UI is on screen are shown.
  It shows once for new players and once for old saves; it can be skipped and is not shown on replays. Level 2/3/5 presets are kept.

## Save fields (additive only)
- `storyEvents: Record<id, {cleared, tries, skipped}>` (sticky merge)
- `coachSeen: number` (max-only)
Both are included in the cloud snapshot sanitize. Persist version stays at 4, and stars/progress are never reset.

## Balance (scripts/combat-balance.mjs, greedy bot)
- Main 50 levels: clearPlain 0.833 → clearWithEnemy 0.845; purge rate 0.691.
- Story event without skills: win 0.83, purge 0.60.

## Tests
- src/game/combat.test.ts (9). `npm run test:combat` runs the tests plus balance.
- scripts/combat-ui-test.mjs (Playwright, COMBAT_TEST_URL): A old save + 3 team + coach, B single assist L2, C story lamp, D 深宮 at 375px.
- Pre-existing failures (also in qgy-new): 2× stories-extra byte-match, 1× 行書 font glyph.

## Merge into qgy-new
- New files: combat.ts, combat.test.ts, story-events.ts, CombatHud.tsx, combat.css, CombatCoach.tsx, coach.css, StoryEventPlayer.tsx, scripts/combat-*.mjs.
- Changed files: Match3.tsx, MainStory.tsx, Raid.tsx, store.ts, cloud-save.ts, package.json. store/cloud-save/package.json overlap with the stage-D 命器召喚 edits, so merge them by hand.
