import { sanitizeSnapshot, SNAPSHOT_KEYS } from "./cloud-save.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LETTERS,
  LETTER_REWARD,
  cleanLetters,
  mergeLetterSaves,
  completeLetter,
  letterUnlocked,
  arrivedLetters,
  letterSenders,
} from "./letters.ts";
const QIN = LETTERS.filter((l) => l.character === "qin");
const own = { owned: { qin: 1 }, mainStoryRead: [] as number[] };
test("letters: own-card required; first on own; later use read volumes, never stars or bond", () => {
  for (const l of QIN)
    assert.equal(letterUnlocked(l, { owned: {}, mainStoryRead: [4, 10] }), false);
  assert.equal(letterUnlocked(LETTERS[0], own), true);
  assert.equal(letterUnlocked(LETTERS[1], own), false);
  assert.equal(letterUnlocked(LETTERS[1], { ...own, mainStoryRead: [4] }), true);
  assert.equal(letterUnlocked(LETTERS[2], { ...own, mainStoryRead: [4] }), false);
  assert.equal(letterUnlocked(LETTERS[2], { ...own, mainStoryRead: [10] }), true);
});
test("letters: each A/B/C completes once, keeps original reply, survives serialize/clean", () => {
  for (const l of LETTERS)
    for (const choice of ["A", "B", "C"] as const) {
      const progress = {
        ...own,
        mainStoryRead: [4, 10],
        mainStoryHanRead: [5, 10],
        mainStoryWuRead: [4, 10],
        mainStoryQiRead: [6, 10],
        mainStoryTangRead: [6, 10],
        owned: { qin: 1, liuche: 1, zhouyu: 1, lanling: 1, libai: 1 },
      };
      const first = completeLetter({}, l, choice, progress);
      assert.equal(first.reward, LETTER_REWARD);
      const reloaded = cleanLetters(JSON.parse(JSON.stringify(first.letters)));
      const again = completeLetter(reloaded, l, choice === "A" ? "B" : "A", progress);
      assert.equal(again.reward, 0);
      assert.equal(again.letters[l.id].choice, choice);
      assert.ok(l.replies.find((r) => r.id === choice)?.response);
      assert.equal(again.letters[l.id].rewardClaimed, true);
    }
});
test("letters: old/malformed saves and locked attempts do not award", () => {
  assert.deepEqual(cleanLetters(undefined), {});
  assert.deepEqual(cleanLetters({ stranger: { completed: true } }), {});
  assert.equal(completeLetter({}, LETTERS[0], "A", { owned: {}, mainStoryRead: [] }).reward, 0);
  const cleaned = cleanLetters({ "qin-1": { choice: "A", completed: true, rewardClaimed: false } });
  assert.equal(completeLetter(cleaned, LETTERS[0], "B", own).reward, 0);
});
test("All letter copy is 120–220 characters with three distinct replies and no spoilers in first letter", () => {
  for (const l of LETTERS) {
    assert.ok(l.body.length >= 120 && l.body.length <= 220, `${l.title}: ${l.body.length}`);
    assert.equal(new Set(l.replies.map((r) => r.response)).size, 3);
    assert.ok(
      !/寡人|永遠屬於|一定回來|月老/.test(
        l.body + l.closer + l.replies.map((r) => r.response).join(""),
      ),
    );
  }
});

test("other dynasties use their own read arrays, not Qin or star gates", () => {
  for (const letter of LETTERS.filter((l) => l.afterChapter)) {
    const owns = { owned: { [letter.character]: 1 }, mainStoryRead: [letter.afterVolume!] };
    assert.equal(letterUnlocked(letter, owns), false);
    const key =
      letter.afterChapter === 2
        ? "mainStoryHanRead"
        : letter.afterChapter === 3
          ? "mainStoryWuRead"
          : letter.afterChapter === 4
            ? "mainStoryQiRead"
            : "mainStoryTangRead";
    assert.equal(letterUnlocked(letter, { ...owns, [key]: [letter.afterVolume!] }), true);
  }
  assert.equal(LETTERS.filter((l) => l.character === "liuche").length, 3);
});

test("old cloud snapshot cannot clear a completed reply or re-enable reward", () => {
  const original = completeLetter({}, QIN[0], "A", own).letters;
  const restored = mergeLetterSaves(original, undefined);
  assert.deepEqual(restored, original);
  const other = completeLetter({}, QIN[0], "B", own).letters;
  const merged = mergeLetterSaves(restored, other);
  assert.equal(merged["qin-1"].choice, "A");
  assert.equal(completeLetter(merged, QIN[0], "C", own).reward, 0);
});

test("all five SSR have exactly three letters, with first on own and distinct later conditions", () => {
  assert.equal(LETTERS.length, 15);
  for (const id of ["qin", "liuche", "zhouyu", "lanling", "libai"]) {
    const letters = LETTERS.filter((l) => l.character === id);
    assert.equal(letters.length, 3);
    assert.equal(letters[0].afterVolume, undefined);
    assert.ok(letters[1].afterVolume && letters[2].afterVolume! > letters[1].afterVolume);
  }
});

test("cloud snapshot includes letter ledger, schema and story position; old snapshots default safely", () => {
  const letters = completeLetter({}, QIN[0], "A", own).letters;
  const saved = sanitizeSnapshot({
    letters,
    lettersVersion: 1,
    storyLast: { 1: 4, 2: 10, bad: 99 },
  });
  assert.ok(saved.ok);
  if (saved.ok) {
    assert.deepEqual(saved.data.letters, letters);
    assert.deepEqual(saved.data.storyLast, { 1: 4, 2: 10 });
    assert.equal(saved.data.lettersVersion, 1);
  }
  assert.ok(SNAPSHOT_KEYS.includes("letters"));
  const old = sanitizeSnapshot({ owned: { qin: 1 }, ink: 1234 });
  assert.ok(old.ok);
  if (old.ok) {
    assert.deepEqual(old.data.letters, {});
    assert.equal(old.data.ink, 1234);
  }
});

test("unsent letters stay off the arrived list until the character has sent them", () => {
  assert.deepEqual(arrivedLetters({ owned: {}, mainStoryRead: [] }).map((l) => l.id), []);
  assert.deepEqual(letterSenders({ owned: {}, mainStoryRead: [] }), []);
  assert.deepEqual(arrivedLetters(own).map((l) => l.id), ["qin-1"]);
  assert.deepEqual(letterSenders(own), ["qin"]);
  assert.ok(!arrivedLetters(own).some((l) => l.id === "qin-2" || l.id === "qin-3"));
  const later = arrivedLetters({ ...own, mainStoryRead: [4] }).map((l) => l.id);
  assert.deepEqual(later, ["qin-1", "qin-2"]);
});
