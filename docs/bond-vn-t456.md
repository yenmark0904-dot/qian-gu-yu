# t455u / t456u — Character stories as main-story VN

## Implemented
- All 65 characters / 120 authored scenes: SSR 20, SS 30, S 40, R 30.
- Runtime scripts: `src/game/stories-vn.ts`. Readable complete export: `docs/bond-vn-scenes-120.md`.
- Each scene has two distinct player-choice branches and a common ending. SSR explicit plot beats are adapted into non-graphic intimate scenes. Physical intimacy is optional, in selected branches only. No official relationship or forever promises.
- Chapter titles and original unlock cadence are unchanged. Raw original prose remains for archival/export compatibility, but is no longer shown by Codex or the cinematic reading CTA.
- `BondStoryVN` directly reuses `QinStoryVN`: same full-screen background, shade, header, sprite, cloud-sheet dialogue, A/B buttons, voice, tap/Enter/Space and Esc behavior. There is no duplicate presentation implementation or new stylesheet.
- Optional bond adapter adds stage/resume handling; existing Qin/Wu/Qi/Tang callers retain their original parsers/stages. Han sheet reader is untouched.
- Codex and summon/replay reading CTA open this shared player. 情話 and reveal art remain unchanged.
- Original adult gate runs before rendering the VN. Final read completion respects tier-six CG ownership, existing SSR assets, and SS's preparation notice. No new CG assets.
- Resume state is additive `bondStoryPlay["id:index"] = {beat, done, choice}` in `qiangu-yu` version 5. Other save state is untouched; quests fire on opening/finishing.
- Four supplied standing sprites are reused; other characters use `/portraits/id.jpg`. All 65 have art. Witch uses `witch.png`, 李白 remains `/sprites/libai.png`. No standing sprite uses a 定情 CG.

## Preserved
Backups: `/workspace/bak/stories-pre-vn-t456/`. `data.ts` and `stories-extra.ts` remain byte-identical to the backup, including love lines/titles/CG metadata. No ArtifactRefine, Raid, quest definitions, smoke art, or 長明之約 code was changed. No production deployment or CloudAgent was used.

## Verification
- Typecheck passed; Vite build passed (no DB migration/deployment).
- Complete package game-test list: **478 passed, 0 failed**, including 125 new VN tests.
- Edited-file ESLint: 0 errors; four existing Cinematic warnings (three export/Fast Refresh warnings and its existing voice-effect dependency warning).
- Two old byte-comparison tests now account narrowly for the already-reviewed 曹操「孤」pronoun, without changing love text or relaxing other source comparisons.
- Top-level `npm test` stops in its pre-existing non-game OG/script prelude: 17 failures, including absent `.grok/skills/og/SKILL.md`/references and OG metadata expectation failures. Its full game list was run separately and is green.
- 390 × 844 Playwright screenshots + JSON in `screenshots/`; mobile checks cover adult gate decline/confirmation, choices, Esc/reload resume, final SSR CG, SS preparation, locked CG protection, unrelated save preservation, main Qin/Wu/Qi/Tang replays, and summon/replay reading.

## Deployment / source context
`/home/box/.vercel-new/auth.json` is absent, so deployment was skipped as instructed. No preview URL exists for these changes. The supplied attachment path was not available in this executor; the actual game source plots in `data.ts` and `stories-extra.ts` were used.
