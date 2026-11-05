/**
 * Pure match-3 engine (no DOM). Used by the 三消 screen and the unit tests.
 *
 * Board: rows × cols of jades. kind 0–5 are the six jades; kind -1 is the
 * 龍珠 colour jade. A jade may carry a special:
 *   - "row"  線玉 (橫): made by a horizontal straight 4, clears its whole row.
 *   - "col"  線玉 (直): made by a vertical straight 4, clears its whole column.
 *   - "bomb" 金鑲玉: made by an L / T / + shape, blasts the 3×3 around it.
 *   - "color" 龍珠: made by a straight 5; swap it with a jade to clear every jade of that kind.
 * seal[r][c] > 0 marks a jade sealed in ink (1) or ink + ice (2). Sealed jades
 * cannot be swapped and do not fall; a match on or next to them, or a special's
 * blast, breaks one layer.
 */
export const KINDS = 6;
export const COLOR = -1;

export type Special = "row" | "col" | "bomb" | "color";
export type Piece = { id: number; kind: number; special?: Special };
export type Pos = { r: number; c: number };
export type Board = { rows: number; cols: number; cells: Piece[][]; seal: number[][] };
export type Rng = () => number;

export type Effect =
  | { type: "row"; r: number; c: number }
  | { type: "col"; r: number; c: number }
  | { type: "bomb"; r: number; c: number; radius: number }
  | { type: "color"; r: number; c: number; kind: number; targets: Pos[] }
  | { type: "board"; r: number; c: number };

export type MatchGroup = {
  kind: number;
  cells: Pos[];
  runs: { dir: "h" | "v"; cells: Pos[] }[];
  make: Special | null;
};

export type Wave = {
  /** Board as the wave starts (after the swap / previous refill). */
  before: Board;
  /** Board after removal + new specials, before gravity (null where removed). */
  removed: Pos[];
  removedIds: number[];
  created: { pos: Pos; piece: Piece }[];
  effects: Effect[];
  sealHits: Pos[];
  sealsBroken: number;
  after: Board;
  /** piece id → rows fallen (for animation). */
  drops: Map<number, number>;
  score: number;
  collected: number[];
};

export type SwapResult =
  | { ok: false; reason: "far" | "sealed" | "nomatch" }
  | {
      ok: true;
      swapped: Board;
      waves: Wave[];
      board: Board;
      score: number;
      collected: number[];
      sealsBroken: number;
      reshuffled: boolean;
    };

export const SCORE_PER_JADE = 10;
export const SCORE_SEAL = 30;
export const SCORE_MAKE: Record<Special, number> = { row: 40, col: 40, bomb: 60, color: 100 };

let serial = 0;
export function piece(kind: number, special?: Special): Piece {
  serial += 1;
  return special ? { id: serial, kind: special === "color" ? COLOR : kind, special } : { id: serial, kind };
}

/** Deterministic PRNG (mulberry32) for tests and simulations. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (p: Pos) => `${p.r},${p.c}`;
const inside = (b: Board, p: Pos) => p.r >= 0 && p.c >= 0 && p.r < b.rows && p.c < b.cols;
const randKind = (rng: Rng) => Math.floor(rng() * KINDS);

export function cloneBoard(b: Board): Board {
  return { rows: b.rows, cols: b.cols, cells: b.cells.map((row) => row.slice()), seal: b.seal.map((row) => row.slice()) };
}

export function near(a: Pos, b: Pos) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function swapCells(b: Board, a: Pos, c: Pos): Board {
  const next = cloneBoard(b);
  const hold = next.cells[a.r]![a.c]!;
  next.cells[a.r]![a.c] = next.cells[c.r]![c.c]!;
  next.cells[c.r]![c.c] = hold;
  return next;
}

/** All straight runs of ≥3 same-kind jades, merged into groups where they cross (L / T / +). */
export function findMatches(cells: Piece[][]): MatchGroup[] {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const runs: { dir: "h" | "v"; kind: number; cells: Pos[] }[] = [];
  for (let r = 0; r < rows; r++) {
    let start = 0;
    for (let c = 1; c <= cols; c++) {
      const k = cells[r]![start]!.kind;
      if (c < cols && k >= 0 && cells[r]![c]!.kind === k) continue;
      if (k >= 0 && c - start >= 3) runs.push({ dir: "h", kind: k, cells: Array.from({ length: c - start }, (_, i) => ({ r, c: start + i })) });
      start = c;
    }
  }
  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 1; r <= rows; r++) {
      const k = cells[start]![c]!.kind;
      if (r < rows && k >= 0 && cells[r]![c]!.kind === k) continue;
      if (k >= 0 && r - start >= 3) runs.push({ dir: "v", kind: k, cells: Array.from({ length: r - start }, (_, i) => ({ r: start + i, c })) });
      start = r;
    }
  }
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const owner = new Map<string, number>();
  runs.forEach((run, i) => {
    for (const p of run.cells) {
      const k = key(p);
      const other = owner.get(k);
      if (other === undefined) owner.set(k, i);
      else parent[find(i)] = find(other);
    }
  });
  const groups = new Map<number, MatchGroup>();
  runs.forEach((run, i) => {
    const root = find(i);
    let g = groups.get(root);
    if (!g) {
      g = { kind: run.kind, cells: [], runs: [], make: null };
      groups.set(root, g);
    }
    g.runs.push({ dir: run.dir, cells: run.cells });
    for (const p of run.cells) if (!g.cells.some((q) => q.r === p.r && q.c === p.c)) g.cells.push(p);
  });
  for (const g of groups.values()) g.make = shapeOf(g);
  return [...groups.values()];
}

/** Straight 5+ → 龍珠; crossing runs (L/T/+) → bomb; straight 4 → line in the match's own direction. */
export function shapeOf(g: Pick<MatchGroup, "runs">): Special | null {
  const longest = Math.max(...g.runs.map((r) => r.cells.length));
  if (longest >= 5) return "color";
  const dirs = new Set(g.runs.map((r) => r.dir));
  if (dirs.size > 1) return "bomb";
  if (longest === 4) return g.runs[0]!.dir === "h" ? "row" : "col";
  return null;
}

function spawnCell(g: MatchGroup, b: Board, prefer: Pos[]): Pos | null {
  const free = (p: Pos) => b.seal[p.r]![p.c]! === 0 && !b.cells[p.r]![p.c]!.special;
  const inGroup = (p: Pos) => g.cells.some((q) => q.r === p.r && q.c === p.c);
  for (const p of prefer) if (inGroup(p) && free(p)) return p;
  if (g.make === "bomb") {
    const h = g.runs.filter((r) => r.dir === "h").flatMap((r) => r.cells);
    const cross = g.runs
      .filter((r) => r.dir === "v")
      .flatMap((r) => r.cells)
      .find((p) => h.some((q) => q.r === p.r && q.c === p.c));
    if (cross && free(cross)) return cross;
  }
  const longest = g.runs.reduce((a, r) => (r.cells.length > a.cells.length ? r : a), g.runs[0]!);
  const mid = longest.cells[Math.floor(longest.cells.length / 2)]!;
  if (free(mid)) return mid;
  return g.cells.find(free) ?? null;
}

function area(b: Board, center: Pos, radius: number): Pos[] {
  const out: Pos[] = [];
  for (let r = center.r - radius; r <= center.r + radius; r++)
    for (let c = center.c - radius; c <= center.c + radius; c++) if (inside(b, { r, c })) out.push({ r, c });
  return out;
}

function lineCells(b: Board, dir: "row" | "col", at: Pos): Pos[] {
  return dir === "row"
    ? Array.from({ length: b.cols }, (_, c) => ({ r: at.r, c }))
    : Array.from({ length: b.rows }, (_, r) => ({ r, c: at.c }));
}

function kindCells(b: Board, kind: number): Pos[] {
  const out: Pos[] = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (b.cells[r]![c]!.kind === kind) out.push({ r, c });
  return out;
}

function commonKind(b: Board, skip: Set<string>, rng: Rng): number {
  const counts = new Array<number>(KINDS).fill(0);
  for (let r = 0; r < b.rows; r++)
    for (let c = 0; c < b.cols; c++) {
      const k = b.cells[r]![c]!.kind;
      if (k >= 0 && !skip.has(`${r},${c}`)) counts[k] += 1;
    }
  const best = Math.max(...counts);
  const ties = counts.map((n, k) => (n === best ? k : -1)).filter((k) => k >= 0);
  return ties[Math.floor(rng() * ties.length)] ?? 0;
}

type Seed = { cells: Pos[]; effects: Effect[]; consumed: Pos[] };

/**
 * One cascade wave: clear the groups (and any seed cells from a special swap),
 * set off specials in a chain, break seals, place new specials, then refill.
 */
export function resolveWave(
  start: Board,
  groups: MatchGroup[],
  seed: Seed | null,
  prefer: Pos[],
  rng: Rng,
  wave: number,
): Wave {
  const b = cloneBoard(start);
  const created: { pos: Pos; piece: Piece }[] = [];
  const protect = new Set<string>();
  for (const g of groups) {
    if (!g.make) continue;
    const at = spawnCell(g, b, prefer);
    if (!at || protect.has(key(at))) continue;
    const old = b.cells[at.r]![at.c]!;
    const made: Piece = g.make === "color" ? { id: old.id, kind: COLOR, special: "color" } : { id: old.id, kind: old.kind, special: g.make };
    created.push({ pos: at, piece: made });
    protect.add(key(at));
  }
  const effects: Effect[] = [...(seed?.effects ?? [])];
  const cleared = new Set<string>();
  const sealHit = new Set<string>();
  const fired = new Set<string>((seed?.consumed ?? []).map(key));
  const queue: Pos[] = [...(seed?.cells ?? [])];
  for (const g of groups) for (const p of g.cells) if (!protect.has(key(p))) queue.push(p);
  // Matches also crack seals on the four neighbours.
  for (const g of groups)
    for (const p of g.cells)
      for (const n of [
        { r: p.r - 1, c: p.c },
        { r: p.r + 1, c: p.c },
        { r: p.r, c: p.c - 1 },
        { r: p.r, c: p.c + 1 },
      ])
        if (inside(b, n) && b.seal[n.r]![n.c]! > 0) sealHit.add(key(n));
  while (queue.length > 0) {
    const p = queue.shift()!;
    const k = key(p);
    if (protect.has(k)) continue;
    if (b.seal[p.r]![p.c]! > 0) {
      sealHit.add(k);
      continue;
    }
    if (cleared.has(k)) continue;
    cleared.add(k);
    const pc = b.cells[p.r]![p.c]!;
    if (!pc.special || fired.has(k)) continue;
    fired.add(k);
    if (pc.special === "row" || pc.special === "col") {
      effects.push({ type: pc.special, r: p.r, c: p.c });
      queue.push(...lineCells(b, pc.special, p));
    } else if (pc.special === "bomb") {
      effects.push({ type: "bomb", r: p.r, c: p.c, radius: 1 });
      queue.push(...area(b, p, 1));
    } else {
      const kind = commonKind(b, cleared, rng);
      const targets = kindCells(b, kind);
      effects.push({ type: "color", r: p.r, c: p.c, kind, targets });
      queue.push(...targets);
    }
  }
  let sealsBroken = 0;
  const sealHits: Pos[] = [];
  for (const k of sealHit) {
    const [r, c] = k.split(",").map(Number) as [number, number];
    sealHits.push({ r, c });
    b.seal[r]![c] = Math.max(0, b.seal[r]![c]! - 1);
    if (b.seal[r]![c] === 0) sealsBroken += 1;
  }
  const collected = new Array<number>(KINDS).fill(0);
  const removed: Pos[] = [];
  const removedIds: number[] = [];
  const holes: (Piece | null)[][] = b.cells.map((row) => row.slice());
  for (const k of cleared) {
    const [r, c] = k.split(",").map(Number) as [number, number];
    const pc = b.cells[r]![c]!;
    removed.push({ r, c });
    removedIds.push(pc.id);
    if (pc.kind >= 0) collected[pc.kind] += 1;
    holes[r]![c] = null;
  }
  for (const { pos, piece: made } of created) holes[pos.r]![pos.c] = made;
  const { cells, drops } = gravity(holes, b.seal, rng);
  const after: Board = { rows: b.rows, cols: b.cols, cells, seal: b.seal };
  const mult = 1 + wave * 0.5;
  const score =
    Math.round(removed.length * SCORE_PER_JADE * mult) +
    created.reduce((n, x) => n + SCORE_MAKE[x.piece.special!], 0) +
    sealHits.length * SCORE_SEAL;
  return {
    before: start,
    removed,
    removedIds,
    created,
    effects,
    sealHits,
    sealsBroken,
    after,
    drops,
    score,
    collected,
  };
}

/** Unsealed jades fall into the empty slots below them (sliding past sealed ones); new jades drop in from the top. */
export function gravity(holes: (Piece | null)[][], seal: number[][], rng: Rng) {
  const rows = holes.length;
  const cols = holes[0]?.length ?? 0;
  const cells: Piece[][] = Array.from({ length: rows }, () => new Array<Piece>(cols));
  const drops = new Map<number, number>();
  for (let c = 0; c < cols; c++) {
    const slots: number[] = [];
    const kept: { p: Piece; from: number }[] = [];
    for (let r = 0; r < rows; r++) {
      if (seal[r]![c]! > 0) {
        cells[r]![c] = holes[r]![c]!;
        continue;
      }
      slots.push(r);
      const p = holes[r]![c];
      if (p) kept.push({ p, from: r });
    }
    const missing = slots.length - kept.length;
    slots.forEach((r, i) => {
      if (i < missing) {
        const p = piece(randKind(rng));
        cells[r]![c] = p;
        drops.set(p.id, r - (i - missing));
      } else {
        const { p, from } = kept[i - missing]!;
        cells[r]![c] = p;
        if (r > from) drops.set(p.id, r - from);
      }
    });
  }
  return { cells, drops };
}

const isSpecial = (p: Piece) => !!p.special;

/** Setup for swapping two specials or a 龍珠 with anything. */
function comboSeed(b: Board, a: Pos, at: Pos, rng: Rng): Seed | null {
  const pa = b.cells[a.r]![a.c]!;
  const pb = b.cells[at.r]![at.c]!;
  if (!isSpecial(pa) && !isSpecial(pb)) return null;
  const color = pa.special === "color" ? a : pb.special === "color" ? at : null;
  if (color) {
    const other = color === a ? at : a;
    const po = b.cells[other.r]![other.c]!;
    if (po.special === "color") {
      const all: Pos[] = [];
      for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) all.push({ r, c });
      return { cells: all, effects: [{ type: "board", r: at.r, c: at.c }], consumed: [a, at] };
    }
    const targets = kindCells(b, po.kind);
    if (po.special) {
      // Every jade of that kind becomes the same special and fires.
      for (const p of targets) {
        const cur = b.cells[p.r]![p.c]!;
        if (cur.special || b.seal[p.r]![p.c]! > 0) continue;
        const special: Special = po.special === "bomb" ? "bomb" : rng() < 0.5 ? "row" : "col";
        b.cells[p.r]![p.c] = { ...cur, special };
      }
    }
    return { cells: [color, other, ...targets], effects: [{ type: "color", r: color.r, c: color.c, kind: po.kind, targets }], consumed: [color] };
  }
  if (!isSpecial(pa) || !isSpecial(pb)) return null;
  const kinds = [pa.special, pb.special];
  const lines = kinds.filter((s) => s === "row" || s === "col").length;
  if (lines === 2) {
    return {
      cells: [...lineCells(b, "row", at), ...lineCells(b, "col", at)],
      effects: [
        { type: "row", r: at.r, c: at.c },
        { type: "col", r: at.r, c: at.c },
      ],
      consumed: [a, at],
    };
  }
  if (lines === 1) {
    const cells: Pos[] = [];
    const effects: Effect[] = [];
    for (let d = -1; d <= 1; d++) {
      const rowAt = { r: at.r + d, c: at.c };
      const colAt = { r: at.r, c: at.c + d };
      if (inside(b, rowAt)) {
        cells.push(...lineCells(b, "row", rowAt));
        effects.push({ type: "row", r: rowAt.r, c: rowAt.c });
      }
      if (inside(b, colAt)) {
        cells.push(...lineCells(b, "col", colAt));
        effects.push({ type: "col", r: colAt.r, c: colAt.c });
      }
    }
    return { cells, effects, consumed: [a, at] };
  }
  return { cells: area(b, at, 2), effects: [{ type: "bomb", r: at.r, c: at.c, radius: 2 }], consumed: [a, at] };
}

export function canSwap(b: Board, a: Pos, at: Pos): boolean {
  if (!inside(b, a) || !inside(b, at) || !near(a, at)) return false;
  if (b.seal[a.r]![a.c]! > 0 || b.seal[at.r]![at.c]! > 0) return false;
  const pa = b.cells[a.r]![a.c]!;
  const pb = b.cells[at.r]![at.c]!;
  if (pa.special === "color" || pb.special === "color") return true;
  if (pa.special && pb.special) return true;
  return findMatches(swapCells(b, a, at).cells).length > 0;
}

export function hasMove(b: Board): boolean {
  for (let r = 0; r < b.rows; r++)
    for (let c = 0; c < b.cols; c++) {
      if (c + 1 < b.cols && canSwap(b, { r, c }, { r, c: c + 1 })) return true;
      if (r + 1 < b.rows && canSwap(b, { r, c }, { r: r + 1, c })) return true;
    }
  return false;
}

/** Every valid swap on the board (used for hints and the simulator). */
export function allMoves(b: Board): [Pos, Pos][] {
  const out: [Pos, Pos][] = [];
  for (let r = 0; r < b.rows; r++)
    for (let c = 0; c < b.cols; c++) {
      if (c + 1 < b.cols && canSwap(b, { r, c }, { r, c: c + 1 })) out.push([{ r, c }, { r, c: c + 1 }]);
      if (r + 1 < b.rows && canSwap(b, { r, c }, { r: r + 1, c })) out.push([{ r, c }, { r: r + 1, c }]);
    }
  return out;
}

const MAX_WAVES = 40;

/** Play one swap from a to b: specials combo or a normal match, then every cascade. */
export function trySwap(board: Board, a: Pos, at: Pos, rng: Rng = Math.random): SwapResult {
  if (!near(a, at)) return { ok: false, reason: "far" };
  if (board.seal[a.r]![a.c]! > 0 || board.seal[at.r]![at.c]! > 0) return { ok: false, reason: "sealed" };
  if (!canSwap(board, a, at)) return { ok: false, reason: "nomatch" };
  const swapped = swapCells(board, a, at);
  const work = cloneBoard(swapped);
  const seed = comboSeed(work, a, at, rng);
  const waves: Wave[] = [];
  let current = work;
  let groups = seed ? [] : findMatches(current.cells);
  let first = true;
  for (let i = 0; i < MAX_WAVES; i++) {
    if (!first && groups.length === 0) break;
    const w = resolveWave(current, groups, first ? seed : null, first ? [at, a] : [], rng, i);
    waves.push(w);
    current = w.after;
    first = false;
    groups = findMatches(current.cells);
  }
  let reshuffled = false;
  if (!hasMove(current)) {
    current = reshuffle(current, rng);
    reshuffled = true;
  }
  const collected = new Array<number>(KINDS).fill(0);
  for (const w of waves) w.collected.forEach((n, k) => (collected[k] += n));
  return {
    ok: true,
    swapped,
    waves,
    board: current,
    score: waves.reduce((n, w) => n + w.score, 0),
    collected,
    sealsBroken: waves.reduce((n, w) => n + w.sealsBroken, 0),
    reshuffled,
  };
}

/** Shuffle the free jades (specials included) until there is no ready-made line and at least one move. */
export function reshuffle(b: Board, rng: Rng): Board {
  const free: Pos[] = [];
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) if (b.seal[r]![c]! === 0) free.push({ r, c });
  for (let attempt = 0; attempt < 400; attempt++) {
    const next = cloneBoard(b);
    const pieces = free.map((p) => b.cells[p.r]![p.c]!);
    if (attempt >= 200) for (let i = 0; i < pieces.length; i++) if (!pieces[i]!.special) pieces[i] = piece(randKind(rng));
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j]!, pieces[i]!];
    }
    free.forEach((p, i) => (next.cells[p.r]![p.c] = pieces[i]!));
    if (findMatches(next.cells).length === 0 && hasMove(next)) return next;
  }
  return freshBoard(b.rows, b.cols, b.seal, rng);
}

export function emptySeal(rows: number, cols: number) {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

/** A random board with no ready-made lines and at least one valid swap. */
export function freshBoard(rows: number, cols: number, seal: number[][] = emptySeal(rows, cols), rng: Rng = Math.random): Board {
  for (let attempt = 0; ; attempt++) {
    const cells: Piece[][] = [];
    for (let r = 0; r < rows; r++) {
      const line: Piece[] = [];
      for (let c = 0; c < cols; c++) {
        const banned = new Set<number>();
        if (c >= 2 && line[c - 1]!.kind === line[c - 2]!.kind) banned.add(line[c - 1]!.kind);
        if (r >= 2 && cells[r - 1]![c]!.kind === cells[r - 2]![c]!.kind) banned.add(cells[r - 1]![c]!.kind);
        const options = Array.from({ length: KINDS }, (_, k) => k).filter((k) => !banned.has(k));
        line.push(piece(options[Math.floor(rng() * options.length)]!));
      }
      cells.push(line);
    }
    const b: Board = { rows, cols, cells, seal: seal.map((row) => row.slice()) };
    if (hasMove(b) || attempt > 500) return b;
  }
}

/** Build a board from digit rows ("012345…") plus optional specials, for tests and tutorial levels. */
export function boardFrom(rows: string[], specials: [number, number, Special][] = [], seal?: number[][]): Board {
  const cells = rows.map((line) => [...line].map((ch) => piece(Number(ch))));
  for (const [r, c, s] of specials) {
    const cur = cells[r]![c]!;
    cells[r]![c] = s === "color" ? { id: cur.id, kind: COLOR, special: "color" } : { ...cur, special: s };
  }
  const h = rows.length;
  const w = rows[0]!.length;
  return { rows: h, cols: w, cells, seal: seal ? seal.map((r) => r.slice()) : emptySeal(h, w) };
}

export function sealsLeft(b: Board) {
  let n = 0;
  for (const row of b.seal) for (const v of row) if (v > 0) n += 1;
  return n;
}

/**
 * Turn some plain, unsealed jades into specials (三消 助陣 opening gift).
 * Kinds are kept, so no new match appears. Returns a new board.
 */
export function seedSpecials(b: Board, gifts: { line?: number; row?: number; bomb?: number; color?: number }, rng: Rng = Math.random): Board {
  const out = cloneBoard(b);
  const spots: Pos[] = [];
  for (let r = 0; r < out.rows; r++)
    for (let c = 0; c < out.cols; c++) if (!out.seal[r]![c] && !out.cells[r]![c]!.special) spots.push({ r, c });
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j]!, spots[i]!];
  }
  const wants: Special[] = [];
  for (let i = 0; i < (gifts.color ?? 0); i++) wants.push("color");
  for (let i = 0; i < (gifts.bomb ?? 0); i++) wants.push("bomb");
  for (let i = 0; i < (gifts.row ?? 0); i++) wants.push("row");
  for (let i = 0; i < (gifts.line ?? 0); i++) wants.push(rng() < 0.5 ? "row" : "col");
  wants.forEach((s, i) => {
    const at = spots[i];
    if (!at) return;
    const cur = out.cells[at.r]![at.c]!;
    out.cells[at.r]![at.c] = s === "color" ? { id: cur.id, kind: COLOR, special: "color" } : { ...cur, special: s };
  });
  return out;
}

export type Strike = { kind: "sweep" } | { kind: "burn"; rows: number };

/**
 * A 助陣 skill going off mid-level (no move spent):
 *  - sweep: clear every jade of the most common colour (seals on them crack);
 *  - burn: set fire to whole rows, the ones holding the most seals first.
 * Cascades resolve like a normal move. Returns null if nothing would happen.
 */
export function skillStrike(board: Board, strike: Strike, rng: Rng = Math.random): Extract<SwapResult, { ok: true }> | null {
  const work = cloneBoard(board);
  let seed: Seed;
  if (strike.kind === "sweep") {
    const kind = commonKind(work, new Set(), rng);
    const targets = kindCells(work, kind);
    if (!targets.length) return null;
    const mid = targets[Math.floor(targets.length / 2)]!;
    seed = { cells: targets, effects: [{ type: "color", r: mid.r, c: mid.c, kind, targets }], consumed: [] };
  } else {
    const order = Array.from({ length: work.rows }, (_, r) => ({ r, seals: work.seal[r]!.filter((n) => n > 0).length, tie: rng() }));
    order.sort((x, y) => y.seals - x.seals || x.tie - y.tie);
    const rows = order.slice(0, Math.max(0, Math.min(strike.rows, work.rows))).map((x) => x.r);
    if (!rows.length) return null;
    const mid = Math.floor(work.cols / 2);
    seed = {
      cells: rows.flatMap((r) => lineCells(work, "row", { r, c: 0 })),
      effects: rows.map((r) => ({ type: "row" as const, r, c: mid })),
      consumed: [],
    };
  }
  const waves: Wave[] = [];
  let current = work;
  let groups: MatchGroup[] = [];
  for (let i = 0; i < MAX_WAVES; i++) {
    if (i > 0 && groups.length === 0) break;
    const w = resolveWave(current, groups, i === 0 ? seed : null, [], rng, i);
    waves.push(w);
    current = w.after;
    groups = findMatches(current.cells);
  }
  let reshuffled = false;
  if (!hasMove(current)) {
    current = reshuffle(current, rng);
    reshuffled = true;
  }
  const collected = new Array<number>(KINDS).fill(0);
  for (const w of waves) w.collected.forEach((n, k) => (collected[k] += n));
  return {
    ok: true,
    swapped: work,
    waves,
    board: current,
    score: waves.reduce((n, w) => n + w.score, 0),
    collected,
    sealsBroken: waves.reduce((n, w) => n + w.sealsBroken, 0),
    reshuffled,
  };
}

/** Crack `n` seal layers at the start (the thickest seals first). */
export function crackSeals(b: Board, n: number, rng: Rng = Math.random): { board: Board; broken: number; hits: Pos[] } {
  const out = cloneBoard(b);
  const hits: Pos[] = [];
  let broken = 0;
  for (let i = 0; i < n; i++) {
    const spots: { r: number; c: number; v: number; t: number }[] = [];
    for (let r = 0; r < out.rows; r++)
      for (let c = 0; c < out.cols; c++) if (out.seal[r]![c]! > 0) spots.push({ r, c, v: out.seal[r]![c]!, t: rng() });
    if (!spots.length) break;
    spots.sort((x, y) => y.v - x.v || x.t - y.t);
    const s = spots[0]!;
    out.seal[s.r]![s.c] = s.v - 1;
    if (s.v - 1 === 0) broken += 1;
    hits.push({ r: s.r, c: s.c });
  }
  return { board: out, broken, hits };
}
