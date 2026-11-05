#!/usr/bin/env node
/**
 * Import an owner-written four-chapter 緣分 story into the game data, verbatim.
 *
 *   node --experimental-strip-types scripts/import-bond-chapters.mjs <id> [--dir <folder>] [--backup-dir <folder>] [--check]
 *
 * Reads <dir>/<id>_bond_4ch.txt (default dir: ../stories/extra next to the repo,
 * i.e. /workspace/stories/extra). The file is four blocks, each a heading line
 * 「第N章・…」 followed by its body lines, ending in one newline:
 *
 *   - Chapter 1 replaces the character's first-meeting story in src/game/data.ts
 *     (`eroticStory`, tier 0) and its full heading becomes `eroticTitle`.
 *     The old story is backed up first to <backup-dir>/<id>_tianmingshu.txt
 *     (default ../stories) unless a backup already exists.
 *   - Chapters 2/3/4 go to STORIES_EXTRA[<id>].chapters[1/2/3] in
 *     src/game/stories-extra.ts (緣分 tiers 2/4/6 for SSR), heading as `title`.
 *
 * Bodies are copied byte for byte (only ` \ and ${ are escaped for the template
 * literal). After writing, the script re-imports both modules in a fresh process
 * and checks that `heading\nbody` × 4 + "\n" equals the file exactly, then prints
 * FNV-1a fingerprints for src/game/destiny-book.test.ts (BOND_IMPORTS).
 * --check only verifies the current data against the file and writes nothing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--d") && !args[args.indexOf(a) - 1]?.startsWith("--b"));
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const DIR = resolve(opt("--dir", join(ROOT, "..", "stories", "extra")));
const BACKUP_DIR = resolve(opt("--backup-dir", join(ROOT, "..", "stories")));
const CHECK = args.includes("--check");
if (!id || !/^[a-z0-9]+$/.test(id)) {
  console.error("usage: import-bond-chapters.mjs <id> [--dir folder] [--backup-dir folder] [--check]");
  process.exit(2);
}

const DATA = join(ROOT, "src/game/data.ts");
const EXTRA = join(ROOT, "src/game/stories-extra.ts");
const SOURCE = join(DIR, `${id}_bond_4ch.txt`);

export function parseChapters(file) {
  if (file.includes("\r")) throw new Error("CR line endings: save the file with LF");
  if (!file.endsWith("\n")) throw new Error("file must end with a newline");
  const HEAD = /^第[一二三四五六七八九十]+章[・·].*$/;
  const lines = file.slice(0, -1).split("\n");
  const chapters = [];
  for (const line of lines) {
    if (HEAD.test(line)) chapters.push({ title: line, body: [] });
    else if (!chapters.length) throw new Error(`text before the first heading: ${line.slice(0, 20)}`);
    else chapters.at(-1).body.push(line);
  }
  if (chapters.length !== 4) throw new Error(`expected 4 chapter headings, found ${chapters.length}`);
  const out = chapters.map((c) => ({ title: c.title, text: c.body.join("\n") }));
  if (out.some((c) => !c.text.trim())) throw new Error("empty chapter body");
  if (rebuild(out) !== file) throw new Error("parse does not round-trip");
  return out;
}
export const rebuild = (chs) => chs.map((c) => `${c.title}\n${c.text}`).join("\n") + "\n";
export function fnv(text) {
  let n = 2166136261;
  for (const ch of text) n = Math.imul(n ^ ch.codePointAt(0), 16777619);
  return n >>> 0;
}
const lit = (s) => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

/** End index (exclusive) of the template literal starting at `start` (a backtick). */
function literalEnd(src, start) {
  for (let i = start + 1; i < src.length; i++) {
    if (src[i] === "\\") i++;
    else if (src[i] === "`") return i + 1;
  }
  throw new Error("unterminated template literal");
}

function current() {
  const code = `
    const { CHARACTERS } = await import(${JSON.stringify(DATA)});
    const { STORIES_EXTRA } = await import(${JSON.stringify(EXTRA)});
    const c = CHARACTERS.find((x) => x.id === ${JSON.stringify(id)});
    const e = STORIES_EXTRA[${JSON.stringify(id)}];
    process.stdout.write(JSON.stringify(c ? { rarity: c.rarity, title: c.eroticTitle ?? "", story: c.eroticStory ?? "", extra: e ? [1, 2, 3].map((i) => e.chapters[i] ?? null) : null } : null));`;
  const out = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", code], { encoding: "utf8" });
  return JSON.parse(out);
}

const file = readFileSync(SOURCE, "utf8");
const chapters = parseChapters(file);
const before = current();
if (!before) throw new Error(`no character "${id}" in data.ts`);
if (!before.extra) throw new Error(`no STORIES_EXTRA entry for "${id}"`);

if (!CHECK) {
  const backup = join(BACKUP_DIR, `${id}_tianmingshu.txt`);
  if (!existsSync(backup)) {
    writeFileSync(backup, before.story + "\n");
    console.log(`backed up old tier-0 story → ${backup}`);
  } else console.log(`backup exists: ${backup}`);

  // data.ts: eroticTitle + eroticStory inside this character's object.
  let data = readFileSync(DATA, "utf8");
  const at = data.indexOf(`    id: ${JSON.stringify(id)},\n`);
  if (at < 0) throw new Error("character block not found");
  const storyKey = data.indexOf("    eroticStory: `", at);
  const nextId = data.indexOf("\n    id: ", at + 10);
  if (storyKey < 0 || (nextId > 0 && storyKey > nextId)) throw new Error("eroticStory not found in block");
  const litStart = storyKey + "    eroticStory: ".length;
  const litEnd = literalEnd(data, litStart);
  data = data.slice(0, litStart) + lit(chapters[0].text) + data.slice(litEnd);
  const block = data.slice(at, storyKey);
  const titleLine = `    eroticTitle: ${JSON.stringify(chapters[0].title)},\n`;
  const t = block.indexOf("    eroticTitle: ");
  if (t >= 0) {
    const s = at + t;
    data = data.slice(0, s) + titleLine + data.slice(data.indexOf("\n", s) + 1);
  } else data = data.slice(0, storyKey) + titleLine + data.slice(storyKey);
  writeFileSync(DATA, data);

  // stories-extra.ts: replace this entry's chapters block.
  let extra = readFileSync(EXTRA, "utf8");
  const e = extra.indexOf(`\n  ${id}: {\n`);
  if (e < 0) throw new Error("STORIES_EXTRA entry not found");
  const cs = extra.indexOf("    chapters: {\n", e);
  const ce = extra.indexOf("\n    },\n    love:", cs);
  if (cs < 0 || ce < 0) throw new Error("chapters block not found");
  const tiers = before.rarity === "SSR" ? ["緣分二階", "緣分四階", "緣分六階"] : ["", "", ""];
  const body = chapters
    .slice(1)
    .map((c, i) => `      ${i + 1}: {\n        // ${tiers[i] || `chapter ${i + 2}`}\n        title: ${JSON.stringify(c.title)},\n        text: ${lit(c.text)},\n      },`)
    .join("\n");
  extra = extra.slice(0, cs) + `    chapters: {\n${body}` + extra.slice(ce);
  writeFileSync(EXTRA, extra);
}

// Verify from a fresh import.
const after = current();
const data4 = [{ title: after.title, text: after.story }, ...after.extra.map((c) => ({ title: c?.title ?? "", text: c?.text ?? "" }))];
const ok = rebuild(data4) === file;
console.log(`${id}: ${ok ? "OK — data rebuilds the file byte for byte" : "MISMATCH"}`);
console.log(`  headings: ${JSON.stringify(data4.map((c) => c.title))}`);
console.log(`  fingerprints: [${data4.map((c) => fnv(c.text)).join(", ")}]`);
if (!ok) process.exit(1);
