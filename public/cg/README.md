# 專屬 CG (SSR 緣分六階)

Put each SSR's exclusive CG here as `<id>.jpg` (e.g. `qin.jpg`), then set
`cg: "/cg/<id>.jpg"` for that character in `src/game/stories-extra.ts`.

Any aspect ratio works — portrait (e.g. `libai.jpg` 1291×1920, `qin.jpg` 1280×1920, `lanling.jpg` 1292×1920, `liuche.jpg` 1291×1920, `zhouyu.jpg` 1291×1920) or landscape 16:9.
The 圖鑑 card and the fullscreen viewer always show the whole image (contain, never
cropped) on a dark letterbox. Keep files around ≤ 1920 px on the long side, JPEG q≈85.

An empty `cg` shows「CG 準備中」once the player reaches 緣分六階; before that the slot is locked.
