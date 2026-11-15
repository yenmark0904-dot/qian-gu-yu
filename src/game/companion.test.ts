import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CHARACTERS } from "./data.ts";
import { COMPANION_ART, companionArtCandidates } from "./companion-art.ts";
import { COMPANION_LINES } from "./companion-lines.ts";
import {
  timeSlot,
  resolveCompanion,
  companionTier,
  interactionDeck,
  nextInteraction,
  newRound,
} from "./companion.ts";
import { sanitizeSnapshot } from "./cloud-save.ts";

test("65 characters retain rarities and independent eleven-line tables", () => {
  assert.equal(CHARACTERS.length, 65);
  assert.deepEqual(
    Object.fromEntries(
      ["SSR", "SS", "S", "R"].map((r) => [r, CHARACTERS.filter((c) => c.rarity === r).length]),
    ),
    { SSR: 5, SS: 10, S: 20, R: 30 },
  );
  const all = new Set<string>();
  for (const c of CHARACTERS) {
    const entries = Object.values(COMPANION_LINES[c.id] ?? {});
    assert.equal(entries.length, 11, c.id);
    assert.equal(new Set(entries).size, 11, c.id);
    for (const line of entries) {
      assert.ok(line.length >= 8);
      assert.ok(!all.has(line), `shared line: ${line}`);
      all.add(line);
    }
    assert.equal(interactionDeck(c.id, 1, "morning").length, 8);
    assert.equal(interactionDeck(c.id, 16, "morning").length, 9);
    assert.equal(interactionDeck(c.id, 31, "morning").length, 10);
  }
  assert.equal(all.size, 715);
});
test("every image is this character own existing asset and tiny thumbnail exists", () => {
  let sprites = 0,
    cards = 0;
  for (const c of CHARACTERS) {
    const art = COMPANION_ART[c.id].companionImage;
    const candidates = companionArtCandidates(art);
    assert.ok(candidates.length);
    assert.ok(art.thumbnail && existsSync(`public${art.thumbnail}`));
    for (const a of candidates) {
      assert.ok(existsSync(`public${a.src.split("?")[0]}`), a.src);
      assert.ok(a.src.includes(c.id));
    }
    if (art.sprite) sprites++;
    else if (art.card) cards++;
  }
  assert.equal(sprites, 5);
  assert.equal(cards, 60);
  assert.deepEqual(
    companionArtCandidates({ sprite: "/s", card: "/c", avatar: "/a" }).map((a) => a.kind),
    ["sprite", "card", "avatar"],
  );
  assert.deepEqual(companionArtCandidates({}), []);
});
test("all boundary hours use local device hour, no location access", () => {
  for (let h = 0; h < 24; h++)
    assert.equal(
      timeSlot(h),
      h < 5 || h >= 21 ? "night" : h < 11 ? "morning" : h < 17 ? "day" : "evening",
    );
  assert.equal(timeSlot(), timeSlot(new Date().getHours()));
});
test("unowned, junk, invalid or removed companion safely rejected", () => {
  for (const c of CHARACTERS) {
    assert.equal(resolveCompanion(c.id, { [c.id]: 1 }), c.id);
    assert.equal(resolveCompanion(c.id, {}), null);
  }
  for (const id of ["unknown", "__proto__", "constructor", null, 5])
    assert.equal(resolveCompanion(id, { qin: 1 }), null);
  for (const n of [0, -1, NaN, Infinity]) assert.equal(resolveCompanion("qin", { qin: n }), null);
});
test("read-only companion tiers use existing copies to bond conversion", () => {
  for (const n of [1, 6, 11, 15]) assert.equal(companionTier(n), "初識");
  for (const n of [16, 21, 26, 30]) assert.equal(companionTier(n), "熟稔");
  assert.equal(companionTier(31), "情深");
});
test("all65 cycle without repeats each normal round and rapid taps trigger own reaction", () => {
  for (const c of CHARACTERS) {
    let round = newRound();
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      const n = nextInteraction(c.id, 1, "day", round, i * 1500);
      assert.ok(!seen.has(n.text), c.id);
      seen.add(n.text);
      round = n.round;
    }
    round = newRound();
    let text = "";
    for (const t of [0, 100, 200]) {
      const n = nextInteraction(c.id, 1, "night", round, t);
      round = n.round;
      text = n.text;
    }
    assert.equal(text, COMPANION_LINES[c.id].rapid);
    const after = nextInteraction(c.id, 1, "night", round, 300);
    assert.notEqual(after.text, text);
  }
});
test("old cloud/export snapshots default new fields, preserve letters and progress", () => {
  const old = {
    ink: 1234,
    pity: 12,
    owned: { qin: 1 },
    totalPulls: 15,
    history: ["qin"],
    letters: {},
    m3: {},
    mainStoryRead: [1],
  };
  const migrated = sanitizeSnapshot(old);
  assert.equal(migrated.ok, true);
  if (!migrated.ok) return;
  assert.equal(migrated.data.companionId, null);
  assert.equal(migrated.data.companionGuideDone, false);
  assert.equal(migrated.data.ink, 1234);
  assert.equal(migrated.data.pity, 12);
  assert.deepEqual(migrated.data.mainStoryRead, [1]);
  const selected = sanitizeSnapshot({ ...old, companionId: "qin", companionGuideDone: true });
  assert.equal(selected.ok, true);
  if (!selected.ok) return;
  assert.equal(selected.data.companionId, "qin");
  assert.equal(selected.data.companionGuideDone, true);
  const invalid = sanitizeSnapshot({ ...old, companionId: "libai" });
  assert.equal(invalid.ok, true);
  if (invalid.ok) assert.equal(invalid.data.companionId, null);
});
test("story chapter hero has no character portraits; existing letter completion logic untouched", () => {
  const story = readFileSync("src/components/game/StoryJourney.tsx", "utf8");
  assert.ok(!story.includes("<Portrait"));
  assert.ok(!story.includes("/portraits/"));
  assert.ok(story.includes("story-hero-scene"));
  const letters = readFileSync("src/components/game/Letters.tsx", "utf8");
  assert.ok(letters.includes("initialCharacter"));
  assert.ok(letters.includes("state.readLetter(letter.id)"));
  assert.ok(letters.includes("replyLetter"));
});


test("front companion uses original sprite cutouts; character portraits stay on card fallback", () => {
  for (const id of ["libai", "liuche", "zhouyu", "lanling"]) {
    const art = COMPANION_ART[id].companionImage;
    assert.equal(companionArtCandidates(art)[0].src, `/sprites/${id}.png?v=20`);
    assert.equal(art.card, `/portraits/${id}.jpg`);
    assert.equal(art.thumbnail, `/companion/thumbs/${id}.webp`);
  }
});
