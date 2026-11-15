/**
 * The 行書 love-line font. The version is the first 10 hex chars of the woff2's md5, so a rebuilt font always gets
 * a new URL (in-app WebViews such as 小紅書's cache font URLs aggressively). src/game/brush-font.test.ts keeps this,
 * the @font-face src in src/styles.css and the file in sync.
 */
export const BRUSH_FAMILY = "QGY Xingshu";
export const BRUSH_FONT_VERSION = "2cd24a1451";
export const BRUSH_FONT_URL = `/fonts/qgy-xingshu.woff2?v=${BRUSH_FONT_VERSION}`;
