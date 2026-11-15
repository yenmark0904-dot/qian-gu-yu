import assert from "node:assert/strict";
import { test } from "node:test";
import { CHARACTERS } from "./data.ts";
import { skillOf } from "./skills.ts";
import { boardFrom, makeRng, trySwap } from "./match3.ts";
import {
  ARMED_WINDOW_MOVES,
  ARTIFACTS,
  ARTIFACT_BY_ID,
  exclusivePct,
  LEVEL_CURVE,
  NON_OWNER_HINT,
  VAULT_GIFT_ID,
  addInstance,
  artifactUnlocks,
  claimVaultGift,
  cleanArtifacts,
  emptyArtifacts,
  equipArtifact,
  equippedOn,
  exclusiveActive,
  scaled,
  unequipArtifact,
  type ArtifactSave,
} from "./artifacts.ts";
import {
  ARTIFACT_LIMITS,
  type MoveFacts,
  artifactCast,
  artifactMove,
  slotsFor,
  startArtifactRun,
  waveInfo,
  type WaveInfo,
} from "./artifact-engine.ts";

const ownAll: Record<string, number> = Object.fromEntries(CHARACTERS.map((c) => [c.id, 1]));
const W = (p: Partial<WaveInfo>): WaveInfo => ({ index: 0, removed: 3, lines: 0, rowLines: 0, bombs: 0, colors: 0, sealHits: 0, sealsBroken: 0, score: 100, ...p });
const stage = { mode: "main", hasSeal: true, hasMilestone: true, hasGoal: true };
const R_ID = "machao";

function withItems(...eids: string[]): ArtifactSave {
  let s = emptyArtifacts();
  for (const e of eids) s = addInstance(s, e).save;
  return s;
}
function wear(s: ArtifactSave, uid: string, who: string) {
  const r = equipArtifact(s, uid, who, ownAll, true);
  assert.ok(r.ok);
  return r.save;
}
test("catalog: 27 kinds = 5 SSR + 10 SS + 6 S + 6 R, unique ids, each with own image slot", () => {
  assert.equal(ARTIFACTS.length, 27);
  const by = (r: string) => ARTIFACTS.filter((a) => a.rarity === r).length;
  assert.deepEqual([by("SSR"), by("SS"), by("S"), by("R")], [5, 10, 6, 6]);
  assert.equal(new Set(ARTIFACTS.map((a) => a.id)).size, 27);
  assert.equal(new Set(ARTIFACTS.map((a) => a.name)).size, 27);
  for (const a of ARTIFACTS) {
    assert.ok("image" in a && "awaken" in a);
    if (a.image) assert.ok(!/portraits|\/cg\/|companion/.test(a.image), "never a character asset");
  }
});

test("catalog: 12 generics carry the locked names and no owner layer", () => {
  const names = ARTIFACTS.filter((a) => a.rarity === "S" || a.rarity === "R").map((a) => `${a.name}｜${a.general.name}`);
  assert.deepEqual(names, [
    "青鸞玉佩｜青鸞引玉", "星羅盤｜星軌相連", "赤霞刃｜霞光破陣", "鎏金蓮簪｜金蓮照影", "霜華玉符｜霜解千結", "望月銀鈴｜月音凝神",
    "素心玉墜｜玉心", "青竹書籤｜竹影", "朱砂墨筆｜點墨", "流雲香囊｜雲息", "玄鐵護符｜鎮墨", "銅雀小鈴｜清音",
  ]);
  assert.equal(ARTIFACT_BY_ID["liujin-lianzan"]!.name.codePointAt(0), 0x938f); // 鎏 (gilt), not 鏤
  for (const a of ARTIFACTS.filter((x) => x.rarity === "S" || x.rarity === "R")) {
    assert.equal(a.exclusive, null);
    assert.equal(a.exclusiveCharacterId, null);
  }
});

test("catalog: 15 exclusives are the official names / owners / skill names (t360u)", () => {
  const ex = ARTIFACTS.filter((a) => a.exclusive);
  assert.deepEqual(
    ex.map((a) => [a.exclusiveCharacterId, a.name, a.general.name, a.exclusive!.name, a.awaken.title]),
    [
      ["qin", "六合玄璽", "帝威", "萬象歸秦", "六合同歸"],
      ["zhouyu", "赤壁古琴", "弦音餘韻", "赤壁焚音", "焚江一曲"],
      ["lanling", "戰鬼金面", "破陣", "入陣無雙", "金面傾心"],
      ["libai", "太白醉月壺", "邀月", "斗酒邀月", "醉月成詩"],
      ["liuche", "金屋鳳釵", "金闕", "金屋藏嬌", "鳳歸金闕"],
      ["sima", "綠綺", "鳳鳴", "鳳求凰", "雙鳳和鳴"],
      ["zhuge", "臥龍羽扇", "觀星", "借東風", "星落八陣"],
      ["huo", "封狼銀槍", "疾鋒", "封狼居胥", "少年封侯"],
      ["caocao", "魏武虎符", "號令", "魏武軍令", "魏武雄圖"],
      ["lishimin", "貞觀龍璽", "盛世", "貞觀長安", "萬邦來朝"],
      ["nalan", "憶雪端硯", "憶雪", "人生初見", "一生一代"],
      ["panan", "洛陽香囊", "流芳", "擲果留香", "滿城春色"],
      ["songyu", "巫山雲佩", "雲夢", "高唐雲雨", "雲夢相思"],
      ["luyou", "鐵馬寒鋒", "破冰", "山河入夢", "冰河長夢"],
      ["zhaoyun", "龍膽銀槍", "龍膽", "常山龍吟", "銀龍破陣"],
    ],
  );
  assert.deepEqual([ex.filter((a) => a.rarity === "SSR").length, ex.filter((a) => a.rarity === "SS").length], [5, 10]);
  for (const a of ex) {
    const sk = skillOf(a.exclusiveCharacterId!);
    assert.ok(sk, a.id);
    assert.equal(a.exclusive!.skillId, sk!.id, `${a.id} keyed to the owner's real skill id`);
    assert.ok(a.exclusive!.awakenPct > a.exclusive!.pct);
  }
  const guqin = ARTIFACT_BY_ID["chibi-guqin"]!;
  assert.ok(!/扇/.test(guqin.name + guqin.lore), "赤壁古琴 is a guqin, never a fan");
});

test("SSR exclusive artifacts use official art files", () => {
  for (const id of ["liuhe-xuanxi", "chibi-guqin", "zhangui-jinmian", "taibai-zuiyuehu", "jinwu-fengchai"] as const) {
    assert.equal(ARTIFACT_BY_ID[id]!.image, `/artifacts/${id}.png`);
  }
});

test("SS exclusive artifacts use official art files when provided", () => {
  for (const id of ["lvqi", "wolong-yushan", "fenglang-yinqiang", "weiwu-hufu", "zhenguan-longxi", "yixue-duanyan", "luoyang-xiangnang", "wushan-yunpei", "longdan-yinqiang", "tiema-hanfeng"] as const) {
    assert.equal(ARTIFACT_BY_ID[id]!.image, `/artifacts/${id}.png`);
  }
});

test("S and R generic artifacts use official art files when provided", () => {
  for (const id of ["qingluan-yupei", "xingluo-pan", "chixia-ren", "liujin-lianzan", "shuanghua-yufu", "wangyue-yinling", "suxin-yuzhui", "qingzhu-shuqian", "zhusha-mobi", "liuyun-xiangnang", "xuantie-hufu", "tongque-xiaoling"] as const) {
    assert.equal(ARTIFACT_BY_ID[id]!.image, `/artifacts/${id}.png`);
  }
});


test("level curve: monotone; Lv.10 never weaker than Lv.9; 覺醒 only at Lv.10", () => {
  assert.equal(scaled([0.12, 0.2], 1), 0.12);
  assert.equal(scaled([0.12, 0.2], 10), 0.2);
  assert.equal(scaled([2, 4], 10, true), 4);
  for (let i = 1; i < LEVEL_CURVE.length; i++) assert.ok(LEVEL_CURVE[i]! >= LEVEL_CURVE[i - 1]!);
  for (const a of ARTIFACTS) {
    const r = a.general.rule;
    const v = r.kind === "charge" ? r.energy : r.pct;
    for (let lv = 2; lv <= 10; lv++) assert.ok(scaled(v, lv) >= scaled(v, lv - 1), a.id);
  }
  const ex = ARTIFACT_BY_ID["chibi-guqin"]!.exclusive!;
  assert.deepEqual([1, 5, 9, 10].map((lv) => exclusivePct(ex, lv)), [0.3, 0.3, 0.3, 0.4]);
});

function probe(eid: string, wearer: string, waves: WaveInfo[], level = 1, cast = true) {
  const s = wear(withItems(eid), "a1", wearer);
  s.instances[0]!.level = level;
  let run = startArtifactRun(slotsFor(s, [wearer]), stage);
  if (cast) run = artifactCast(run, wearer, skillOf(wearer)!.id).run;
  return artifactMove(run, waves);
}

test("裝備 1: 周瑜 + 赤壁古琴 → 弦音餘韻 AND 赤壁焚音", () => {
  assert.equal(exclusiveActive(ARTIFACT_BY_ID["chibi-guqin"]!, "zhouyu"), true);
  const out = probe("chibi-guqin", "zhouyu", [W({ lines: 1, rowLines: 1 })]);
  assert.equal(out.perWave[0], 38); // 8% + 30%
  assert.deepEqual(out.notes.sort(), ["弦音餘韻", "赤壁焚音"].sort());
  assert.equal(probe("chibi-guqin", "zhouyu", [W({ lines: 1, rowLines: 1 })], 10).perWave[0], 52); // 12% + 40% 覺醒
});

test("裝備 2/3: 李白 or an R character + 赤壁古琴 → 通用 only", () => {
  for (const who of ["libai", R_ID]) {
    assert.equal(exclusiveActive(ARTIFACT_BY_ID["chibi-guqin"]!, who), false);
    const out = probe("chibi-guqin", who, [W({ lines: 1, rowLines: 1 })]);
    assert.equal(out.perWave[0], 8);
    assert.deepEqual(out.notes, ["弦音餘韻"]);
  }
  assert.equal(NON_OWNER_HINT, "唯與命定之人相契，方能喚醒此器真意。");
});

test("裝備 4: 周瑜 + 太白醉月壺 → 通用 only (owner compared by id)", () => {
  const s = wear(withItems("taibai-zuiyuehu"), "a1", "zhouyu");
  let run = startArtifactRun(slotsFor(s, ["zhouyu"]), stage);
  assert.equal(run.slots[0]!.exclusive, false);
  run = artifactCast(run, "zhouyu", "zhouyu").run;
  run = artifactCast(run, "zhouyu", "libai").run; // even 李白's skill id cannot wake it on 周瑜
  assert.equal(run.slots[0]!.armed, null);
  // 邀月: first move with ≥3 waves → +15% on the whole chain
  const out = artifactMove(run, [W({ index: 0 }), W({ index: 1 }), W({ index: 2 })]);
  assert.deepEqual(out.perWave, [15, 15, 15]);
  assert.deepEqual(artifactMove(out.run, [W({ index: 0 }), W({ index: 1 }), W({ index: 2 })]).perWave, [0, 0, 0]);
});

test("專屬: one trigger per cast, re-cast refreshes (no stacking), expires if unused", () => {
  const s = wear(withItems("chibi-guqin"), "a1", "zhouyu");
  let run = startArtifactRun(slotsFor(s, ["zhouyu"]), { ...stage, hasSeal: false });
  for (let i = 0; i < 5; i++) run = artifactCast(run, "zhouyu", "zhouyu").run;
  const a = artifactMove(run, [W({ rowLines: 1, lines: 1 }), W({ index: 1, rowLines: 1, lines: 1 })]);
  assert.deepEqual(a.perWave, [38, 8], "only one 赤壁焚音 even after five casts");
  // expiry window: armed, then ARMED_WINDOW_MOVES moves with no 橫刻玉 → gone
  let r = artifactCast(a.run, "zhouyu", "zhouyu").run;
  for (let i = 0; i < ARMED_WINDOW_MOVES; i++) r = artifactMove(r, [W({})]).run;
  assert.equal(r.slots[0]!.armed, null);
  assert.equal(artifactMove(r, [W({ rowLines: 1, lines: 1 })]).perWave[0], 8);
});

test("裝備 5/6: one instance never on two characters; two instances of one kind can be", () => {
  let s = withItems("chibi-guqin", "chibi-guqin");
  s = wear(s, "a1", "zhouyu");
  const again = equipArtifact(s, "a1", "libai", ownAll);
  assert.deepEqual(again, { ok: false, reason: "needs-confirm", from: "zhouyu" });
  s = wear(s, "a2", "libai");
  assert.equal(equippedOn(s, "zhouyu")!.uid, "a1");
  assert.equal(equippedOn(s, "libai")!.uid, "a2");
  assert.equal(s.instances.filter((i) => i.equippedBy).length, 2);
  assert.equal(equipArtifact(s, "a1", "zhouyu", { libai: 1 }).ok, false, "unowned character");
  for (const c of CHARACTERS) assert.ok(equipArtifact(withItems("liuhe-xuanxi"), "a1", c.id, ownAll).ok, c.id);
});

test("裝備 7: transfer moves the effect; nothing is lost on swap", () => {
  let s = withItems("chibi-guqin", "qingluan-yupei");
  s = wear(s, "a1", "zhouyu");
  s = wear(s, "a2", "libai");
  const r = equipArtifact(s, "a1", "libai", ownAll, true);
  assert.ok(r.ok);
  assert.equal(r.from, "zhouyu");
  assert.equal(r.replaced, "a2");
  s = r.save;
  assert.equal(s.instances.length, 2);
  assert.equal(equippedOn(s, "zhouyu"), null);
  assert.equal(equippedOn(s, "libai")!.uid, "a1");
  assert.equal(slotsFor(s, ["zhouyu"]).length, 0, "周瑜 lost every 命器 effect");
  assert.equal(startArtifactRun(slotsFor(s, ["libai"]), stage).slots[0]!.exclusive, false);
  s = wear(s, "a1", "zhouyu");
  assert.equal(startArtifactRun(slotsFor(s, ["zhouyu"]), stage).slots[0]!.exclusive, true);
  s = unequipArtifact(s, "a1");
  assert.equal(s.instances.length, 2);
});

test("exclusive generals: 疾鋒 / 龍膽 / 流芳 / 金闕 / 盛世 move rules", () => {
  const run1 = (eid: string, moves: [WaveInfo[], MoveFacts?][], st = stage) => {
    let run = startArtifactRun(slotsFor(wear(withItems(eid), "a1", R_ID), [R_ID]), st);
    return moves.map(([w, f]) => {
      const o = artifactMove(run, w, f);
      run = o.run;
      return o.perWave;
    });
  };
  assert.deepEqual(run1("fenglang-yinqiang", [[[W({ lines: 1 }), W({ index: 1, bombs: 1 })]], [[W({ lines: 2 })]]]), [[15, 15], [0]]);
  assert.deepEqual(run1("longdan-yinqiang", [[[W({ bombs: 1 })]], [[W({ bombs: 1 }), W({ index: 1, bombs: 1 })]]]), [[0], [15, 15]]);
  assert.deepEqual(run1("luoyang-xiangnang", [[[W({})]], [[W({})]], [[W({})]]]), [[0], [12], [0]]);
  const ms = { milestones: [1000, 2000] };
  assert.deepEqual(run1("jinwu-fengchai", [[[W({})], { score: { before: 0, after: 500, ...ms } }], [[W({})], { score: { before: 900, after: 1100, ...ms } }], [[W({})], { score: { before: 1900, after: 2100, ...ms } }]]), [[0], [10], [0]]);
  assert.deepEqual(run1("zhenguan-longxi", [[[W({})], { goals: { before: 0, after: 0 } }], [[W({})], { goals: { before: 0, after: 1 } }]]), [[0], [12]]);
  // no milestone / goal in this mode → weaker fallback, never dead
  const bare = { mode: "story", hasSeal: false, hasMilestone: false, hasGoal: false };
  assert.deepEqual(run1("jinwu-fengchai", [[[W({}), W({ index: 1 })]]], bare), [[5, 5]]);
  assert.deepEqual(run1("zhenguan-longxi", [[[W({}), W({ index: 1 })]]], bare), [[6, 6]]);
});

test("generic S/R effects follow the locked trigger counts", () => {
  const one = (eid: string, waves: WaveInfo[], st = stage, level = 1) => {
    const s = wear(withItems(eid), "a1", R_ID);
    s.instances[0]!.level = level;
    return artifactMove(startArtifactRun(slotsFor(s, [R_ID]), st), waves);
  };
  const big = Array.from({ length: 5 }, () => W({ removed: 4 }));
  assert.deepEqual(one("qingluan-yupei", big).perWave, [12, 12, 12, 0, 0]);
  assert.deepEqual(one("qingluan-yupei", big, stage, 10).perWave, [20, 20, 20, 0, 0]);
  assert.deepEqual(one("qingzhu-shuqian", big).perWave, [8, 0, 0, 0, 0]);
  assert.deepEqual(one("qingzhu-shuqian", big, stage, 10).perWave, [15, 0, 0, 0, 0]);
  const casc = [W({ index: 0 }), W({ index: 1 }), W({ index: 2 }), W({ index: 3 }), W({ index: 4 })];
  assert.deepEqual(one("xingluo-pan", casc).perWave, [0, 12, 12, 12, 0]);
  const lines = Array.from({ length: 4 }, () => W({ lines: 1 }));
  assert.deepEqual(one("chixia-ren", lines).perWave, [12, 12, 12, 0]);
  assert.deepEqual(one("zhusha-mobi", lines).perWave, [6, 6, 0, 0]);
  const bombs = Array.from({ length: 4 }, () => W({ bombs: 1 }));
  assert.deepEqual(one("liujin-lianzan", bombs).perWave, [12, 12, 12, 0]);
  assert.deepEqual(one("liuyun-xiangnang", bombs).perWave, [8, 0, 0, 0]);
  const normals = Array.from({ length: 3 }, () => W({ index: 0 }));
  assert.deepEqual(one("suxin-yuzhui", normals).perWave, [5, 5, 0]);
});

test("seal 命器 have a weaker fallback on stages with no 墨封 / 冰封", () => {
  const run = (eid: string, st: typeof stage, waves: WaveInfo[]) => {
    const s = wear(withItems(eid), "a1", R_ID);
    return artifactMove(startArtifactRun(slotsFor(s, [R_ID]), st), waves).perWave;
  };
  const seals = Array.from({ length: 4 }, () => W({ sealHits: 1, sealsBroken: 1 }));
  assert.deepEqual(run("shuanghua-yufu", stage, seals), [12, 12, 12, 0]);
  assert.deepEqual(run("xuantie-hufu", stage, seals), [6, 6, 0, 0]);
  assert.deepEqual(run("weiwu-hufu", stage, seals), [10, 10, 10, 0]);
  assert.deepEqual(run("tiema-hanfeng", stage, seals), [10, 10, 10, 0]);
  // 號令 counts only real ink-seal removals; 破冰 also counts ice layers
  assert.deepEqual(run("weiwu-hufu", stage, [W({ sealHits: 1, sealsBroken: 0 })]), [0]);
  assert.deepEqual(run("tiema-hanfeng", stage, [W({ sealHits: 1, sealsBroken: 0 })]), [10]);
  const open = { ...stage, hasSeal: false };
  assert.deepEqual(run("shuanghua-yufu", open, [W({ index: 0 }), W({ index: 1 }), W({ index: 2 }), W({ index: 3 }), W({ index: 4 })]), [0, 6, 6, 6, 0]);
  assert.deepEqual(run("xuantie-hufu", open, [W({}), W({}), W({})]), [3, 3, 0]);
  assert.deepEqual(run("weiwu-hufu", open, [W({}), W({}), W({})]), [4, 4, 0]);
  assert.deepEqual(run("tiema-hanfeng", open, [W({}), W({}), W({})]), [4, 4, 0]);
});

test("charge 命器: wearer only, direct player clear only, once per stage (3-assist raid shape)", () => {
  let s = withItems("wangyue-yinling", "tongque-xiaoling", "wolong-yushan");
  s = wear(s, "a1", "qin");
  s = wear(s, "a2", R_ID);
  s = wear(s, "a3", "libai");
  const raid = { mode: "raid", hasSeal: true, hasMilestone: false, hasGoal: false };
  let run = startArtifactRun(slotsFor(s, ["qin", R_ID, "libai"]), raid);
  const cascade = artifactMove(run, [W({ index: 0, removed: 3 }), W({ index: 1, removed: 6 })]);
  assert.deepEqual(cascade.energy, {}, "auto-cascades never charge");
  run = cascade.run;
  const hit = artifactMove(run, [W({ index: 0, removed: 5 })]);
  assert.deepEqual(hit.energy, { qin: 2, [R_ID]: 1, libai: 2 }, "each wearer charges only themself");
  assert.deepEqual(artifactMove(hit.run, [W({ index: 0, removed: 7 })]).energy, {}, "once per stage");
  for (const i of s.instances) i.level = 10;
  const lv10 = artifactMove(startArtifactRun(slotsFor(s, ["qin", R_ID, "libai"]), raid), [W({ removed: 5 })]);
  assert.deepEqual(lv10.energy, { qin: 4, [R_ID]: 2, libai: 3 });
});

test("caps: no infinite score multiply, no infinite charge, exclusive triggers bounded", () => {
  let s = withItems("chixia-ren", "chibi-guqin", "zhusha-mobi");
  s = wear(s, "a1", R_ID);
  s = wear(s, "a2", "zhouyu");
  s = wear(s, "a3", "nalan");
  for (const i of s.instances) i.level = 10;
  let run = startArtifactRun(slotsFor(s, [R_ID, "zhouyu", "nalan"]), stage);
  run = artifactCast(run, "zhouyu", "zhouyu").run;
  const one = artifactMove(run, [W({ lines: 3, rowLines: 3, score: 1000 })]);
  assert.ok(one.perWave[0]! <= 1000 * ARTIFACT_LIMITS.wavePct, "team-wide % cap");
  const huge = artifactMove(startArtifactRun(slotsFor(s, [R_ID, "zhouyu", "nalan"]), stage), Array.from({ length: 30 }, (_, i) => W({ index: i, lines: 1, score: 5000 })));
  assert.ok(huge.bonus <= ARTIFACT_LIMITS.movePoints, "per-move point cap");
  let r2 = startArtifactRun(slotsFor(s, ["zhouyu"]), stage);
  let excl = 0;
  for (let i = 0; i < 50; i++) {
    r2 = artifactCast(r2, "zhouyu", "zhouyu").run;
    const m = artifactMove(r2, [W({ lines: 1, rowLines: 1 })]);
    if (m.notes.includes("赤壁焚音")) excl += 1;
    r2 = m.run;
  }
  assert.equal(excl, ARTIFACT_LIMITS.exclusivePerStage);
  let r3 = startArtifactRun(slotsFor(wear(withItems("wangyue-yinling"), "a1", R_ID), [R_ID]), stage);
  let total = 0;
  for (let i = 0; i < 100; i++) {
    const m = artifactMove(r3, [W({ removed: 9 })]);
    total += m.energy[R_ID] ?? 0;
    r3 = m.run;
  }
  assert.ok(total <= ARTIFACT_LIMITS.energyPerStage);
});

test("金屋鳳釵: score only — no 墨玉 field, no star-reward multiply; raid shred only flagged in raid", () => {
  const out = probe("jinwu-fengchai", "liuche", [W({ score: 100 })]);
  assert.equal(out.perWave[0], 25); // 金屋藏嬌 next normal clear +25%
  assert.ok(!("ink" in out) && !("reward" in out));
  const s = wear(withItems("weiwu-hufu"), "a1", "caocao");
  for (const mode of ["main", "raid"]) {
    let run = startArtifactRun(slotsFor(s, ["caocao"]), { ...stage, mode });
    run = artifactCast(run, "caocao", "caocao").run;
    const m = artifactMove(run, [W({ sealHits: 1, sealsBroken: 1 })]);
    assert.equal(m.perWave[0], 40); // 號令 10% + 魏武軍令 30%
    assert.deepEqual(m.shred, mode === "raid" ? ["caocao"] : []);
  }
});

test("engine reads real match-3 waves (刻玉 detonation from trySwap)", () => {
  // row 0 has a horizontal 刻玉 at (0,0); swapping (1,3)->(0,3) makes 0-0-0 on row 0 including it
  const b = boardFrom(
    ["0010234", "5503411", "1234502", "2345013", "3450124", "4501235", "5012340", "0123451"],
    [[0, 0, "row"]],
  );
  const res = trySwap(b, { r: 0, c: 2 }, { r: 1, c: 2 }, makeRng(3));
  assert.ok(res.ok);
  const infos = res.waves.map((w, i) => waveInfo(w, i, w.score));
  const anyLine = infos.some((w) => w.lines > 0);
  assert.ok(anyLine, "the 刻玉 detonated");
  const s = wear(withItems("chixia-ren"), "a1", R_ID);
  const out = artifactMove(startArtifactRun(slotsFor(s, [R_ID]), stage), infos);
  assert.equal(out.bonus > 0, anyLine);
});

test("save clean: keeps instances, drops bad equips to the vault, never duplicates", () => {
  const raw = {
    instances: [
      { uid: "a1", eid: "chibi-guqin", level: 3, equippedBy: "zhouyu", locked: true },
      { uid: "a1", eid: "chibi-guqin", level: 3, equippedBy: "libai" }, // duplicate uid → dropped
      { uid: "a2", eid: "no-such", level: 1, equippedBy: null },
      { uid: "a3", eid: "qingluan-yupei", level: 99, equippedBy: "zhouyu" }, // 2nd on same char → vault
      { uid: "a4", eid: "xingluo-pan", level: 1, equippedBy: "ghost" },
    ],
    materials: { jingmosha: 5, zhenejing: -3, bogus: 9 },
    grants: ["vault-gift", "vault-gift", 3],
    serial: 2,
  };
  const s = cleanArtifacts(raw, { zhouyu: 1 });
  assert.deepEqual(s.instances.map((i) => [i.uid, i.equippedBy, i.level]), [["a1", "zhouyu", 3], ["a3", null, 10], ["a4", null, 1]]);
  assert.equal(s.instances[0]!.locked, true);
  assert.deepEqual(s.materials, { jingmosha: 5, zhenejing: 0, tianmingcanyin: 0, suyuanlu: 0 });
  assert.deepEqual(s.grants, ["vault-gift"]);
  assert.equal(s.serial, 5, "serial never reuses an id");
  assert.deepEqual(cleanArtifacts(undefined, {}), emptyArtifacts());
});

test("命器閣 unlock at 第 5 關 (auto for old players) and the gift is idempotent", () => {
  const m3 = { "1": { stars: 3, best: 1 }, "5": { stars: 1, best: 1 } };
  assert.equal(artifactUnlocks({}).vault, false);
  assert.equal(artifactUnlocks(m3).vault, true);
  assert.equal(artifactUnlocks(m3).raid, false);
  assert.equal(artifactUnlocks({}, true).awaken, true);
  let s = emptyArtifacts();
  assert.equal(claimVaultGift(s, {}).granted, null);
  const first = claimVaultGift(s, m3);
  assert.equal(first.granted!.eid, VAULT_GIFT_ID);
  s = first.save;
  for (let i = 0; i < 5; i++) {
    const again = claimVaultGift(cleanArtifacts(JSON.parse(JSON.stringify(s)), {}), m3);
    assert.equal(again.granted, null);
    s = again.save;
  }
  assert.equal(s.instances.length, 1);
});
