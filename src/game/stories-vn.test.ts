import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createHash } from "node:crypto";
import { CHARACTERS, destinyBook } from "./data.ts";
import { chapterList } from "./bond.ts";
import { extraChapter } from "./stories-extra.ts";
import { parseQinVolume, walkQin, qinChoiceIndex, nextQinIndex } from "./qin-vn.ts";
import { BOND_STORY_SCRIPTS, bondStage, bondSprite, bondSceneBackground } from "./stories-vn.ts";
import { cleanBondStoryPlay } from "./bond-story-play.ts";

const counts = { SSR: 0, SS: 0, S: 0, R: 0 };
for (const c of CHARACTERS) {
  for (const ch of chapterList(c, 31, extraChapter, destinyBook(c)?.text ?? null)) {
    counts[c.rarity]++;
    test(`${c.id}:${ch.index} complete playable scene, original SSR prose or distinct non-SSR paths, existing stage art`, () => {
      const script = BOND_STORY_SCRIPTS[`${c.id}:${ch.index}`];
      assert.ok(script, `${c.name}: ${ch.title}`);
      assert.match(script, /【場景一｜/);
      assert.doesNotMatch(script, /待你撰寫|月老|【分支 C】/);
      const beats = parseQinVolume(script, bondStage(c.id));
      assert.ok(beats.length >= (c.rarity === "SSR" ? 8 : 11));
      if (c.rarity === "SSR") {
        assert.ok(beats.every(b => b.kind !== "choice" && b.kind !== "goto"));
        assert.doesNotMatch(script, /【玩家選項】|【分支/);
        const path = walkQin(beats);
        assert.deepEqual(path, beats, "all original beats play linearly, without a skip branch");
        assert.equal(nextQinIndex(beats, beats.length - 1), beats.length);
      } else {
        const at = beats.findIndex(b => b.kind === "choice");
        assert.ok(at >= 0);
        const choice = beats[at];
        assert.ok(choice.kind === "choice");
        assert.equal(choice.choices.length, 2);
        assert.notEqual(qinChoiceIndex(beats, at, "A"), qinChoiceIndex(beats, at, "B"));
        const a = walkQin(beats, "A"), b = walkQin(beats, "B");
        assert.notDeepEqual(a, b);
        assert.deepEqual(a.at(-1), b.at(-1), "branches must rejoin");
        for (const path of [a, b]) assert.equal(nextQinIndex(beats, beats.indexOf(path.at(-1)!)), beats.length);
      }
      for (const beat of beats) {
        for (const asset of [beat.background, beat.sprite].filter(Boolean) as string[]) {
          assert.doesNotMatch(asset, new RegExp(`^/cg/${c.id}\\.`));
          assert.ok(existsSync(new URL(`../../public${asset.split("?")[0]}`, import.meta.url)), asset);
        }
        if (beat.kind === "dialogue") assert.notEqual(beat.speaker, "月");
      }
      assert.equal(bondSprite(c.id, "我"), "/cg/prologue/witch.png");
    });
  }
}
test("exact 65-character / 120-chapter coverage, unchanged unlock cadence", () => {
  assert.equal(CHARACTERS.length, 65);
  assert.equal(Object.keys(BOND_STORY_SCRIPTS).length, 120);
  assert.deepEqual(counts, { SSR: 20, SS: 30, S: 40, R: 30 });
});
test("stage resolvers reuse supplied art, never 定情 CG or different 李白 sprite", () => {
  assert.equal(bondSprite("libai", "李白"), "/sprites/libai.png?v=20");
  assert.equal(bondSprite("qin", "嬴政"), "/cg/prologue/qin.png?v=20");
  assert.doesNotMatch(bondSprite("qin", "嬴政") ?? "", /^\/cg\/qin\./);
  assert.equal(bondSceneBackground("時隙"), "/cg/prologue/rift.jpg");
  assert.equal(bondSceneBackground("神社"), "/cg/prologue/shrine.jpg");
});
test("additive resume cleaner rejects bad keys/cursors, keeps each chapter separate", () => {
  assert.deepEqual(cleanBondStoryPlay(undefined), {});
  assert.deepEqual(cleanBondStoryPlay({ "qin:0": {beat: 8,done: false,choice: "B"}, "qin:3": {beat: 20,done: true}, "tao:0": {beat: 3}, "tao:1": {beat: -1}, "qin:4": {beat: 2}, "bad:1": {beat: 1}, "qin:1:junk": {beat: 0} }), {
    "qin:0": {beat: 8,done: false,choice: "B"}, "qin:3": {beat: 20,done: true},
  });
});
test("Codex plays shared shell after the gate; save version stays 5", () => {
  const codex = readFileSync(new URL("../components/game/Codex.tsx", import.meta.url), "utf8");
  const reader = readFileSync(new URL("../components/game/BondStoryVN.tsx", import.meta.url), "utf8");
  assert.match(codex, /needsAdultGate/);
  assert.match(codex, /open\?\.state === "open" && gateFor === null/);
  assert.doesNotMatch(codex, /\{open\.text\}/);
  assert.match(reader, /<QinStoryVN/);
  assert.match(readFileSync(new URL("./store.ts", import.meta.url), "utf8"), /version: 5/);
});
test("summon/replay first-meeting chapters also use VN, never raw eroticStory prose", () => {
  const cinematic = readFileSync(new URL("../components/game/Cinematic.tsx", import.meta.url), "utf8");
  assert.match(cinematic, /<BondStoryVN/);
  assert.doesNotMatch(cinematic, /\{book\.text\}/);
  assert.match(cinematic, /showStory && !gate/);
  assert.match(cinematic, /needsAdultGate/);
});

// Fingerprints and distinctive dialogue pinned to the owner-supplied pre-VN originals.
const SSR_ORIGINALS: Record<string, { sha256: string; line: string }> = {
  "qin:0": {
    "sha256": "8a432b319741001c5ba4ad50da6afdd80f9f104a91f34cd20cf7ca73b50bd117",
    "line": "「朕要你親手摸清楚，這具身子是怎麼為你發燙的。」"
  },
  "qin:1": {
    "sha256": "6a2409b9d740aeb41ecf8cc9d5364e0b497b44b67f3f2c5173b3099521e5824d",
    "line": "「可唯獨對你……朕動了心，也動了魔念。你感覺到了嗎？朕已經硬成這樣了。」"
  },
  "qin:2": {
    "sha256": "2ae087fd6911fd98cdc0476e5fd05541c7a686dfd164766673b820cc250833b6",
    "line": "「朕真正怕的……不是失去江山，而是你只把朕當秦始皇，而不想要這具會為你硬、為你失控的身子。」"
  },
  "qin:3": {
    "sha256": "6c2ffc4c73c6f39ac8de09ad70ffbf85c28d902c0e7774e9f5d57bfd0503f2fb",
    "line": "「只有被你迷了心智的嬴政……你要的話，朕就一點不剩地交給你。連這具會為你徹底失控的身子，也一併給你。」"
  },
  "zhouyu:0": {
    "sha256": "fe8b69e9dcb09be393969e9420c05e6309f0bca69809af1fa8b608a3cba3bd70",
    "line": "「本都督的手，平日裡連一根弦都不會彈錯。可你一靠近，它就先亂了。」"
  },
  "zhouyu:1": {
    "sha256": "6c8669c16fbe9f4a5b4a1a55384efb5e9efa067912a92d619fa23996a44d2cc8",
    "line": "「本都督可以指揮千軍萬馬，卻指揮不了自己在你面前硬成這樣。你要是現在走，本都督也不會攔。」"
  },
  "zhouyu:2": {
    "sha256": "10b3205f2ce38d6ef616f694a34daa95ef904b37a3431894632ce97c13a2c3df",
    "line": "「本都督最怕的，不是打輸仗，而是在你面前，連這點從容都守不住。」"
  },
  "zhouyu:3": {
    "sha256": "17c63d38975974b7b67675508aede782d952fd064b9554e4b91bcff0fc3d54b0",
    "line": "「今晚沒有周瑜，也沒有公瑾。只有一個會為你在黑暗裡發抖、會為你整夜不放的人。你要是願意，就讓我留到江水聲都聽不見。」"
  },
  "lanling:0": {
    "sha256": "57e68e0fe0b0b142b22851fb77124fd126e183faaaa3f23f2f3c201354104a56",
    "line": "「你要是想碰，就先隔著它。讓我知道，你不怕這副樣子。」"
  },
  "lanling:1": {
    "sha256": "c9d7cad1db0497c3d919346eb0ea7c1d6df6431aa41a8238262d0f5966998d6b",
    "line": "「這些傷，沒人看過。你要是願意，就繼續往下。不想的話，現在可以停。」"
  },
  "lanling:2": {
    "sha256": "76ee630d8b94f82d1ed5e21fe46549c9596ac3e0a3732279cb76bb096c94ec35",
    "line": "「還不行。我想先讓你舒服。我的身體，可以等。」"
  },
  "lanling:3": {
    "sha256": "1f498e64189ef0988d88563b5ecac9a329ae960d9c302d8b4a35ff6301833070",
    "line": "「外面的人還會怕它。可你要是願意，就看著我。看著沒有面具的高長恭，是怎麼在你身體裡發抖的。」"
  },
  "libai:0": {
    "sha256": "d21fb61322e2df9fbcd2cef66e7771b35ebbeb4f97c1999aecb9432dad2dd67c",
    "line": "「可為什麼看著你，我這心口還是燒得慌？」"
  },
  "libai:1": {
    "sha256": "1e45009bddaae89e3399c4c5b360245ccbbf42a8bd5fa096ac0d2146203f5f04",
    "line": "「可我現在只想求你的一個眼神。你願意自己把腿分開，讓我的手指進去嗎？」"
  },
  "libai:2": {
    "sha256": "bab6f67f351aada71503e7dc9b0f86bc8cf44919627270672f46c06ab18b6686",
    "line": "「我寫過那麼多詩，卻怕你只喜歡那個詩仙，而不想要這個會為你硬、會為你在花瓣裡失控的浪子。」"
  },
  "libai:3": {
    "sha256": "cc18cc5a54cdf491404c24273d2e1efc11fdfb43a2eb4b5fb8dd3f805bc55546",
    "line": "「只做你的浪子。你要是敢求饒，我就真的把你留在這花瓣裡到天亮，讓你明天走路都還記得我是怎麼在你身體裡的。」"
  },
  "liuche:0": {
    "sha256": "3f4b037f3dcb50ae73a3272af5b2682691fd40afcd3d97dc449891a194a4927a",
    "line": "「手還是熱的。你要是躲，朕就在這柱子前把你按住，讓你自己感覺到朕有多硬。」"
  },
  "liuche:1": {
    "sha256": "ba448cba0771a5df147e89a31eb25563bc2d82ba56121393cf8a27d4661b5400",
    "line": "「那時候還不懂。現在才知道，金屋太慢了。朕想看你自己把腿分開，讓朕的手指進去，讓朕知道你是願意的。」"
  },
  "liuche:2": {
    "sha256": "75be4b8b6fafa9f8e05c64fe47284f9b3ab35ea54b812d90f0f2c9924a4ef7a9",
    "line": "「朕打贏過匈奴，卻怕你只喜歡那個開疆的皇帝，而不想要這個會為你硬到發疼、會為你在帳裡失控的人。」"
  },
  "liuche:3": {
    "sha256": "d94f9cf3a8d7b5f3375bb1b40bf4ab40fc4671603c1c20171384da76d2d436df",
    "line": "「只有劉徹。你要是敢求饒，朕就真的把你留在這榻上到天亮，讓你明天走路都還記得朕是怎麼在你身體裡的。」"
  }
};

const narrativeFirstPerson = (text: string) => text.split(/(「[^「」]*」)/u)
  .map(part => part.startsWith("「") ? part : part.replaceAll("你", "我")).join("");

for (const [key, fixture] of Object.entries(SSR_ORIGINALS)) {
  test(`${key} preserves EVERY original sentence and verbatim quotation, in playback order`, () => {
    const [id, idx] = key.split(":");
    const c = CHARACTERS.find(c => c.id === id)!;
    const original = Number(idx) === 0 ? destinyBook(c)!.text : extraChapter(id, Number(idx))!.text;
    assert.equal(createHash("sha256").update(original.trim()).digest("hex"), fixture.sha256, "archival source must still match the pre-VN original");
    const script = BOND_STORY_SCRIPTS[key];
    assert.ok(script.includes(fixture.line), "distinctive original dialogue must be present");
    const beats = walkQin(parseQinVolume(script, bondStage(id)));
    const playback = beats.map(b => "text" in b ? b.text : "").join("");
    assert.equal(playback, narrativeFirstPerson(original.trim()).replaceAll("\n", ""), "only narration pronouns and VN beat boundaries may change; no sentence can be dropped or added");
    const spokenOriginal = original.split("\n").filter(p => p.startsWith("「"))
      .flatMap(p => [...p.matchAll(/「[^「」]*」/gu)].map(m => m[0]));
    assert.deepEqual(beats.filter(b => b.kind === "dialogue").map(b => b.text), spokenOriginal, "dialogue must remain word-for-word, in its original order");
  });
}
