#!/usr/bin/env node
// @ts-nocheck — plain Node script; type-checked only via its tests
/**
 * Import the owner-written SS / S 緣分 chapters into src/game/stories-extra.ts, verbatim.
 *
 *   node --experimental-strip-types scripts/import-ss-s-chapters.mjs [--dir <folder>] [--check]
 *
 * Sources (default dir ../stories/extra, i.e. /workspace/stories/extra):
 *   SS_bond_ch12.txt — header 「SS 角色緣分後續故事」, then for each of the 10 SS a name
 *     line, 「緣分二階｜<title>」 + body and 「緣分四階｜<title>」 + body
 *     → STORIES_EXTRA[id].chapters[1] (緣分二階) and [2] (緣分四階).
 *   S_bond_ch1.txt — header 「S 角色緣分三階故事」, then 20 sections 「<name>｜<title>」 + body
 *     → STORIES_EXTRA[id].chapters[1] (緣分三階).
 *   R_bond_ch1.txt — no header line; 30 sections 「<name>｜<title>」 + body
 *     → STORIES_EXTRA[id].chapters[1] (R 初遇故事, unlocks at 緣分三階).
 *   R_love2.txt — 30 lines 「<name>：<line>」 (no blank lines); the text after the first ：
 *     → STORIES_EXTRA[id].love (R 情話・其二, unlocks at 緣分二階).
 *   SSR_SS_S_love2.txt — 35 lines 「<name>：<line>」 for the 5 SSR, 10 SS and 20 S
 *     → STORIES_EXTRA[id].love (情話・其二, unlocks at 緣分三階).
 *
 * Paragraph rule: in the source every element (header, name line, heading, paragraph) is
 * separated by exactly one blank line. Stored text keeps the game's convention of one
 * paragraph per line, i.e. the body paragraphs joined with "\n". Nothing else changes;
 * only ` \ and ${ are escaped for the template literal.
 * Headings are recognised only by the exact 「緣分二階｜」/「緣分四階｜」 prefixes and the
 * exact name lines (SS), or by 「<exact S name>｜」 (S). eroticStory and SSR entries are
 * never touched. After writing, the data is re-imported in a fresh process and the source
 * files are rebuilt from it and compared byte for byte. --check verifies without writing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DIR = resolve(args.includes("--dir") ? args[args.indexOf("--dir") + 1] : join(ROOT, "..", "stories", "extra"));
const CHECK = args.includes("--check");
const DATA = join(ROOT, "src/game/data.ts");
const EXTRA = join(ROOT, "src/game/stories-extra.ts");

const SS_HEADER = "SS 角色緣分後續故事";
const S_HEADER = "S 角色緣分三階故事";
const SS_TIERS = ["緣分二階｜", "緣分四階｜"];

const lit = (s) => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

/** Split into elements separated by exactly one blank line; returns [elements, trailingNewline]. */
function elements(file) {
  if (file.includes("\r")) throw new Error("CR line endings: save the file with LF");
  const nl = file.endsWith("\n");
  const body = nl ? file.slice(0, -1) : file;
  const els = body.split("\n\n");
  for (const e of els) if (!e || e.includes("\n")) throw new Error(`paragraphs must be separated by exactly one blank line (near: ${JSON.stringify(e.slice(0, 20))})`);
  return [els, nl];
}
const join2 = (els, nl) => els.join("\n\n") + (nl ? "\n" : "");

export function parseSS(file, roster) {
  const [els, nl] = elements(file);
  if (els[0] !== SS_HEADER) throw new Error("SS header line mismatch");
  const byName = new Map(roster.map((c) => [c.name, c.id]));
  const out = {};
  let cur = null, ch = null;
  for (const e of els.slice(1)) {
    if (byName.has(e)) {
      cur = byName.get(e);
      if (out[cur]) throw new Error(`duplicate SS section ${e}`);
      out[cur] = { name: e, chapters: [] };
      ch = null;
    } else if (SS_TIERS.some((p) => e.startsWith(p))) {
      if (!cur) throw new Error("chapter heading before a name line");
      const tier = SS_TIERS.findIndex((p) => e.startsWith(p));
      if (tier !== out[cur].chapters.length) throw new Error(`${out[cur].name}: chapters out of order`);
      ch = { tier, heading: e, title: e.slice(SS_TIERS[tier].length), paras: [] };
      out[cur].chapters.push(ch);
    } else if (ch) ch.paras.push(e);
    else throw new Error(`text outside a chapter: ${e.slice(0, 20)}`);
  }
  const ids = roster.map((c) => c.id);
  for (const id of ids) {
    const s = out[id];
    if (!s || s.chapters.length !== 2 || s.chapters.some((c) => !c.paras.length || !c.title)) throw new Error(`SS ${id}: needs 2 non-empty chapters`);
  }
  const res = Object.fromEntries(ids.map((id) => [id, out[id].chapters.map((c) => ({ title: c.title, text: c.paras.join("\n") }))]));
  if (rebuildSS(res, roster, nl) !== file) throw new Error("SS parse does not round-trip");
  return res;
}
export function rebuildSS(res, roster, nl = false) {
  const els = [SS_HEADER];
  for (const c of roster) {
    els.push(c.name);
    res[c.id].forEach((ch, i) => els.push(SS_TIERS[i] + ch.title, ...ch.text.split("\n")));
  }
  return join2(els, nl);
}

/** 「<name>｜<title>」 + body sections, one chapter each; `header` is the first line, or null for none. */
function parseNamed(file, roster, header, tier) {
  const [els, nl] = elements(file);
  if (header !== null && els[0] !== header) throw new Error(`${tier} header line mismatch`);
  const out = {};
  let ch = null;
  for (const e of els.slice(header === null ? 0 : 1)) {
    const c = roster.find((r) => e.startsWith(r.name + "｜"));
    if (c) {
      if (out[c.id]) throw new Error(`duplicate ${tier} section ${c.name}`);
      ch = out[c.id] = { title: e.slice(c.name.length + 1), paras: [] };
    } else if (ch) ch.paras.push(e);
    else throw new Error(`text before the first heading: ${e.slice(0, 20)}`);
  }
  for (const c of roster) if (!out[c.id] || !out[c.id].title || !out[c.id].paras.length) throw new Error(`${tier} ${c.id}: missing or empty`);
  const res = Object.fromEntries(roster.map((c) => [c.id, { title: out[c.id].title, text: out[c.id].paras.join("\n") }]));
  if (rebuildNamed(res, roster, header, nl) !== file) throw new Error(`${tier} parse does not round-trip`);
  return res;
}
function rebuildNamed(res, roster, header, nl) {
  const els = header === null ? [] : [header];
  for (const c of roster) els.push(`${c.name}｜${res[c.id].title}`, ...res[c.id].text.split("\n"));
  return join2(els, nl);
}
export const parseS = (file, roster) => parseNamed(file, roster, S_HEADER, "S");
export const rebuildS = (res, roster, nl = false) => rebuildNamed(res, roster, S_HEADER, nl);
export const parseR = (file, roster) => parseNamed(file, roster, null, "R");
export const rebuildR = (res, roster, nl = false) => rebuildNamed(res, roster, null, nl);

/** 情話・其二: one 「<name>：<line>」 per line, every roster member exactly once; round-trips byte for byte. */
export function parseLove(file, roster) {
  if (file.includes("\r")) throw new Error("CR line endings: save the file with LF");
  const nl = file.endsWith("\n");
  const lines = (nl ? file.slice(0, -1) : file).split("\n");
  const byName = new Map(roster.map((c) => [c.name, c.id]));
  const out = {};
  for (const l of lines) {
    const k = l.indexOf("：");
    if (k < 0) throw new Error(`love line without ：: ${l.slice(0, 20)}`);
    const name = l.slice(0, k), id = byName.get(name);
    if (!id) throw new Error(`love: unknown name ${name}`);
    if (out[id] !== undefined) throw new Error(`love: duplicate ${name}`);
    const text = l.slice(k + 1);
    if (!text) throw new Error(`love: empty line for ${name}`);
    out[id] = text;
  }
  for (const c of roster) if (out[c.id] === undefined) throw new Error(`love: missing ${c.name}`);
  if (rebuildLove(out, roster, nl, lines.map((l) => l.slice(0, l.indexOf("：")))) !== file) throw new Error("love parse does not round-trip");
  return out;
}
/** Rebuild in the file's own order (`order` = names) or roster order. */
export function rebuildLove(love, roster, nl = false, order = roster.map((c) => c.name)) {
  const byName = new Map(roster.map((c) => [c.name, c.id]));
  return order.map((n) => `${n}：${love[byName.get(n)]}`).join("\n") + (nl ? "\n" : "");
}

function load() {
  const code = `
    const { CHARACTERS } = await import(${JSON.stringify(DATA)});
    const { STORIES_EXTRA } = await import(${JSON.stringify(EXTRA)});
    const pick = (r) => CHARACTERS.filter((c) => c.rarity === r).map((c) => ({ id: c.id, name: c.name }));
    const ch = (id, i) => STORIES_EXTRA[id]?.chapters?.[i] ?? null;
    const love = Object.fromEntries(CHARACTERS.map((c) => [c.id, STORIES_EXTRA[id(c)]?.love ?? null]));
    function id(c) { return c.id; }
    process.stdout.write(JSON.stringify({ SS: pick("SS"), S: pick("S"), R: pick("R"), SSR: pick("SSR"), love, rarity: Object.fromEntries(CHARACTERS.map((c) => [c.id, c.rarity])), ch: Object.fromEntries(CHARACTERS.map((c) => [c.id, [ch(c.id, 1), ch(c.id, 2)]])) }));`;
  return JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", code], { encoding: "utf8" }));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const ssFile = readFileSync(join(DIR, "SS_bond_ch12.txt"), "utf8");
  const sFile = readFileSync(join(DIR, "S_bond_ch1.txt"), "utf8");
  const rFile = readFileSync(join(DIR, "R_bond_ch1.txt"), "utf8");
  const before = load();
  const ss = parseSS(ssFile, before.SS);
  const s = parseS(sFile, before.S);
  const r = parseR(rFile, before.R);
  const rLoveFile = readFileSync(join(DIR, "R_love2.txt"), "utf8");
  const loveFile = readFileSync(join(DIR, "SSR_SS_S_love2.txt"), "utf8");
  const others = [...before.SSR, ...before.SS, ...before.S];
  const rLove = { ...parseLove(rLoveFile, before.R), ...parseLove(loveFile, others) };

  if (!CHECK) {
    let extra = readFileSync(EXTRA, "utf8");
    const put = (id, block) => {
      const e = extra.indexOf(`\n  ${id}: {\n`);
      if (e < 0) throw new Error(`STORIES_EXTRA entry ${id} not found`);
      const cs = extra.indexOf("    chapters: {\n", e);
      const ce = extra.indexOf("\n    },\n    love:", cs);
      const next = extra.indexOf("\n  },\n", e);
      if (cs < 0 || ce < 0 || ce > next) throw new Error(`chapters block for ${id} not found`);
      extra = extra.slice(0, cs) + `    chapters: {\n${block}` + extra.slice(ce);
    };
    const entry = (i, tier, c) => `      ${i}: {\n        // ${tier}\n        title: ${JSON.stringify(c.title)},\n        text: ${lit(c.text)},\n      },`;
    for (const c of before.SS) put(c.id, [entry(1, "緣分二階", ss[c.id][0]), entry(2, "緣分四階", ss[c.id][1])].join("\n"));
    for (const c of before.S) put(c.id, entry(1, "緣分三階", s[c.id]));
    for (const c of before.R) put(c.id, entry(1, "緣分三階", r[c.id]));
    for (const c of [...before.R, ...others]) {
      const e = extra.indexOf(`\n  ${c.id}: {\n`);
      const next = extra.indexOf("\n  },\n", e);
      const re = /\n    love: `(?:[^`\\]|\\.)*`,/g;
      re.lastIndex = e;
      const m = re.exec(extra);
      if (e < 0 || !m || m.index > next) throw new Error(`love field for ${c.id} not found`);
      extra = extra.slice(0, m.index) + `\n    love: ${lit(rLove[c.id])},` + extra.slice(m.index + m[0].length);
    }
    writeFileSync(EXTRA, extra);
  }

  const after = load();
  const ssData = Object.fromEntries(after.SS.map((c) => [c.id, after.ch[c.id].map((x) => ({ title: x?.title ?? "", text: x?.text ?? "" }))]));
  const sData = Object.fromEntries(after.S.map((c) => [c.id, { title: after.ch[c.id][0]?.title ?? "", text: after.ch[c.id][0]?.text ?? "" }]));
  const okSS = rebuildSS(ssData, after.SS, ssFile.endsWith("\n")) === ssFile;
  const okS = rebuildS(sData, after.S, sFile.endsWith("\n")) === sFile;
  const rData = Object.fromEntries(after.R.map((c) => [c.id, { title: after.ch[c.id][0]?.title ?? "", text: after.ch[c.id][0]?.text ?? "" }]));
  const okR = rebuildR(rData, after.R, rFile.endsWith("\n")) === rFile;
  const order = rLoveFile.replace(/\n$/, "").split("\n").map((l) => l.slice(0, l.indexOf("：")));
  const okRL = rebuildLove(after.love, after.R, rLoveFile.endsWith("\n"), order) === rLoveFile;
  const order2 = loveFile.replace(/\n$/, "").split("\n").map((l) => l.slice(0, l.indexOf("：")));
  const okOther = rebuildLove(after.love, [...after.SSR, ...after.SS, ...after.S], loveFile.endsWith("\n"), order2) === loveFile;
  const filled = Object.values(after.love).filter((v) => v && v.trim()).length;
  console.log(`SS_bond_ch12.txt: ${okSS ? "OK" : "MISMATCH"} — ${after.SS.length} characters × 2 chapters (${Buffer.byteLength(ssFile)} bytes)`);
  console.log(`S_bond_ch1.txt:   ${okS ? "OK" : "MISMATCH"} — ${after.S.length} characters × 1 chapter (${Buffer.byteLength(sFile)} bytes)`);
  console.log(`R_bond_ch1.txt:   ${okR ? "OK" : "MISMATCH"} — ${after.R.length} characters × 1 chapter (${Buffer.byteLength(rFile)} bytes)`);
  console.log(`R_love2.txt:      ${okRL ? "OK" : "MISMATCH"} — ${after.R.length} R 情話・其二 (${Buffer.byteLength(rLoveFile)} bytes)`);
  console.log(`SSR_SS_S_love2.txt: ${okOther ? "OK" : "MISMATCH"} — ${after.SSR.length} SSR + ${after.SS.length} SS + ${after.S.length} S 情話・其二 (${Buffer.byteLength(loveFile)} bytes)`);
  console.log(`love filled: ${filled}/${Object.keys(after.love).length}`);
  if (!okSS || !okS || !okR || !okRL || !okOther || filled !== Object.keys(after.love).length) process.exit(1);
}
