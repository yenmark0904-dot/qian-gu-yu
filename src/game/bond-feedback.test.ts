import assert from "node:assert/strict";
import { test } from "node:test";
import { BOND_TIER_NAMES, MARK_OVERFLOW, dupOutcome } from "./bond.ts";
import { copiesToNext, dupeFeedback, maxedCopy, nextLookTier, nextSkillTier, progressCopy, rewardRows, tierUnlocks } from "./bond-feedback.ts";
import { CHARACTERS, type Rarity } from "./data.ts";
import { SSR_RANKUP_DRAFTS, rankUpLine } from "./rankup-lines.ts";

const by = (r: Rarity) => CHARACTERS.find((c) => c.rarity === r)!;

/** Simulate drawing copy number `count` (owning count-1 before). */
const draw = (r: Rarity, count: number) => {
  const c = by(r);
  const o = dupOutcome(r, count - 1);
  return dupeFeedback(c, count, o.levelUp, o.overflow);
};

test("progress copy names the real next rank and counts copies", () => {
  assert.equal(progressCopy(1), "再得 5 張，即可進入再逢");
  assert.equal(progressCopy(2), "再得 4 張，即可進入再逢");
  assert.equal(progressCopy(6), "再得 5 張，即可進入相知");
  assert.equal(progressCopy(9), "再得 2 張，即可進入相知");
  assert.equal(progressCopy(30), "再得 1 張，即可進入定情");
  assert.equal(progressCopy(31), null);
  assert.equal(copiesToNext(31), 0);
  for (let n = 1; n < 31; n++) assert.match(progressCopy(n)!, new RegExp(`^再得 \\d 張，即可進入(${BOND_TIER_NAMES.slice(1).join("|")})$`));
});

test("every duplicate gets feedback: progress → near (1 left) → rank-up", () => {
  assert.equal(draw("S", 1).kind, "new");
  const p = draw("S", 3);
  assert.equal(p.kind, "progress");
  assert.equal(p.kind === "progress" && p.text, "再得 3 張，即可進入再逢");
  const near = draw("SSR", 10); // 1 more → 二階 相知 (金絲 art)
  assert.equal(near.kind, "near");
  if (near.kind === "near") {
    assert.equal(near.nextName, "相知");
    assert.equal(near.previewSkin, "gilt");
    assert.equal(near.text, "再得 1 張，即可進入相知");
  }
  const nearNoArt = draw("SSR", 5); // 1 more → 一階 再逢: no new art, teaser only
  assert.equal(nearNoArt.kind, "near");
  if (nearNoArt.kind === "near") {
    assert.equal(nearNoArt.previewSkin, null);
    assert.ok(nearNoArt.teaser.length > 0);
  }
  assert.equal(draw("SS", 20).kind === "near" && draw("SS", 20).kind, "near");
  const nearInk = draw("R", 20);
  assert.ok(nearInk.kind === "near" && nearInk.previewSkin === "ink", "四階 previews 墨染");
  const up = draw("SSR", 11);
  assert.equal(up.kind, "rankup");
  if (up.kind === "rankup") {
    assert.equal(up.tier, 2);
    assert.ok(up.unlocks.some((u) => u.kind === "skin" && u.skin === "gilt"));
    assert.ok(up.unlocks.some((u) => u.kind === "story"));
    assert.ok(up.line.length > 0);
    assert.equal(up.after, "再得 5 張，即可進入入心");
  }
  const skillUp = draw("S", 16);
  assert.ok(skillUp.kind === "rankup" && skillUp.unlocks.some((u) => u.kind === "skill" && u.label.includes("貳")));
});

test("max rank: 31st copy is the 定情 rank-up; every later copy says 圓滿 and the right 墨痕", () => {
  const vow = draw("SSR", 31);
  assert.equal(vow.kind, "rankup");
  if (vow.kind === "rankup") {
    assert.equal(vow.tierName, "定情");
    assert.ok(vow.unlocks.some((u) => u.kind === "cg"));
    assert.ok(vow.unlocks.some((u) => u.kind === "skill" && u.label.includes("參")));
    assert.match(vow.after!, /墨痕 ×200/);
  }
  const want: Record<Rarity, number> = { R: 10, S: 30, SS: 80, SSR: 200 };
  for (const r of ["R", "S", "SS", "SSR"] as Rarity[]) {
    const fb = draw(r, 32);
    assert.equal(fb.kind, "max", r);
    if (fb.kind === "max") {
      assert.equal(fb.marks, want[r]);
      assert.equal(fb.marks, MARK_OVERFLOW[r]);
      assert.ok(fb.text.includes("緣分已圓滿"));
      assert.ok(fb.text.includes(`墨痕 ×${want[r]}`));
    }
    assert.equal(maxedCopy(r), `緣分已圓滿（六階 · 定情），本張化為墨痕 ×${want[r]}`);
    assert.equal(draw(r, 50).kind, "max");
  }
});

test("reward table marks next 外觀／故事 and next 技能強化 separately", () => {
  // SSR at 一階: next look = 二階 (金絲 + 天命書其二), next skill = 三階 (貳)
  const rows = rewardRows("SSR", 6);
  assert.deepEqual(rows.filter((r) => r.nextLook).map((r) => r.tier), [2]);
  assert.deepEqual(rows.filter((r) => r.nextSkill).map((r) => r.tier), [3]);
  assert.ok(rows[2]!.skill[0]!.includes("貳"));
  assert.ok(rows[5]!.skill[0]!.includes("參"));
  assert.ok(rows[1]!.look.includes("卡面「金絲」"));
  // S at 二階: 三階 has both 情話其二 + 物語 AND the skill step
  const s = rewardRows("S", 11);
  assert.ok(s[2]!.nextLook && s[2]!.nextSkill);
  // SSR at 四階: next look 六階 (定情卡面, 天命書其三, CG); 五階 has only 墨玉
  const s4 = rewardRows("SSR", 21);
  assert.equal(nextLookTier("SSR", 4), 6);
  assert.deepEqual(s4[4]!.look, []);
  assert.ok(s4[5]!.nextLook && s4[5]!.nextSkill);
  // maxed: nothing next
  const done = rewardRows("SSR", 31);
  assert.ok(done.every((r) => r.reached && !r.nextLook && !r.nextSkill));
  assert.equal(nextSkillTier(6), null);
  // no 知心 or other new gate words in rewards
  for (const r of ["R", "S", "SS", "SSR"] as Rarity[])
    for (let t = 1; t <= 6; t++) assert.ok(tierUnlocks(r, t).every((u) => !u.label.includes("知心")));
});

test("rank-up lines: 5 SSR drafts for every tier; others get a named generic line", () => {
  const ssr = CHARACTERS.filter((c) => c.rarity === "SSR");
  assert.equal(ssr.length, 5);
  for (const c of ssr) for (let t = 1; t <= 6; t++) assert.equal(rankUpLine(c, t), SSR_RANKUP_DRAFTS[c.id]![t], `${c.id} ${t}`);
  for (const c of CHARACTERS.filter((x) => x.rarity !== "SSR")) for (let t = 1; t <= 6; t++) assert.ok(rankUpLine(c, t).includes(c.name));
  const all = Object.values(SSR_RANKUP_DRAFTS).flatMap((m) => Object.values(m));
  for (const line of all) assert.ok(!/永遠|一輩子|生生世世|我的人|戀人|夫君|妻/.test(line), line);
});


test("exclusive CG feedback is SS/SSR only, and only at full bond", () => {
  for (const rarity of ["R", "S", "SS", "SSR"] as Rarity[]) {
    for (let tier = 1; tier <= 6; tier++) {
      assert.equal(tierUnlocks(rarity, tier).some((u) => u.kind === "cg"), (rarity === "SS" || rarity === "SSR") && tier === 6, `${rarity} tier ${tier}`);
    }
  }
});
