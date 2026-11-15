import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESENCE_TTL_MS,
  bearer,
  cleanPresenceNick,
  cleanScreen,
  describeScreen,
  envPrefix,
  newPresenceId,
  safeEqual,
  summarize,
  validPresenceId,
} from "./presence.ts";
import { MemoryPresenceStore, RedisPresenceStore, beatCommands } from "./presence-store.server.ts";

test("presence ids: random hex, validated", () => {
  let n = 0;
  const id = newPresenceId((len) => Uint8Array.from({ length: len }, () => n++));
  assert.equal(id.length, 32);
  assert.ok(validPresenceId(id));
  for (const bad of [null, 1, "", "short", "has space in it 1234", "x".repeat(65), "<script>alert(1)</script>"]) assert.equal(validPresenceId(bad), false);
});

test("env prefix separates production, preview and dev", () => {
  assert.equal(envPrefix("production"), "pr:prod");
  assert.equal(envPrefix("preview"), "pr:preview");
  assert.equal(envPrefix(undefined), "pr:dev");
  assert.equal(envPrefix("development"), "pr:dev");
});

test("screen labels from DOM snapshots", () => {
  assert.equal(describeScreen({ tab: "summon" }), "首頁·召喚");
  assert.equal(describeScreen({ tab: "codex" }), "圖鑑");
  assert.equal(describeScreen({ tab: "codex", cardName: "李白" }), "角色 李白");
  assert.equal(describeScreen({ tab: "summon", summoning: true }), "召喚中");
  assert.equal(describeScreen({ tab: "summon", match3Map: true }), "三消地圖");
  assert.equal(describeScreen({ match3Map: false, match3Level: "第 12 關" }), "三消 第 12 關");
  assert.equal(describeScreen({ shengongHome: true }), "深宮");
  assert.equal(describeScreen({ shengongHome: true, shengongBoard: true }), "深宮排行");
  assert.equal(describeScreen({ shengongFloor: "第 7 層", shengongHome: true }), "深宮 第 7 層");
  assert.equal(describeScreen({ survey: true, tab: "summon" }), "問卷");
  assert.equal(describeScreen({ tab: "weird" }), "首頁");
});

test("screen and nickname cleaning", () => {
  assert.equal(cleanScreen("深宮 第 7 層"), "深宮 第 7 層");
  assert.equal(cleanScreen("<img src=x onerror=1>深宮"), "img srcx onerror1深宮");
  assert.equal(cleanScreen("a\u202eb\u0000c"), "abc");
  assert.equal(cleanScreen(42), "未知");
  assert.equal(cleanScreen(""), "未知");
  assert.ok(cleanScreen("長".repeat(100)).length <= 40);
  assert.equal(cleanPresenceNick(undefined), null);
  assert.equal(cleanPresenceNick(""), null);
  assert.equal(cleanPresenceNick("<b>宮人</b>"), "宮人");
});

test("summary keeps only live entries, newest first, short ids", () => {
  const now = 1_000_000;
  const s = summarize("prod", [
    { id: "aaaaaaaaaaaaaaaa1", screen: "圖鑑", nick: null, lastSeen: now - 10_000 },
    { id: "bbbbbbbbbbbbbbbb2", screen: "深宮", nick: "宮人", lastSeen: now - 1_000 },
    { id: "cccccccccccccccc3", screen: "首頁", nick: null, lastSeen: now - PRESENCE_TTL_MS - 1 },
  ], now);
  assert.equal(s.online, 2);
  assert.deepEqual(s.users.map((u) => [u.id, u.secondsAgo]), [["bbbbbb", 1], ["aaaaaa", 10]]);
  assert.equal(s.users[0].nick, "宮人");
});

test("admin token helpers", () => {
  assert.equal(bearer("Bearer abc123"), "abc123");
  assert.equal(bearer("bearer abc"), "abc");
  assert.equal(bearer("Basic abc"), null);
  assert.equal(bearer(null), null);
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
  assert.ok(!safeEqual("", "x"));
});

test("memory store: TTL expiry, leave, env isolation", async () => {
  const st = new MemoryPresenceStore();
  const t = 5_000_000;
  await st.beat("pr:prod", { id: "p".repeat(20), screen: "首頁", nick: null, lastSeen: t });
  await st.beat("pr:preview", { id: "q".repeat(20), screen: "深宮", nick: "宮人", lastSeen: t });
  assert.equal((await st.list("pr:prod", t + 1000)).length, 1);
  assert.equal((await st.list("pr:preview", t + 1000))[0].nick, "宮人");
  assert.equal((await st.list("pr:prod", t + PRESENCE_TTL_MS + 1)).length, 0);
  await st.leave("pr:preview", "q".repeat(20));
  assert.equal((await st.list("pr:preview", t + 1000)).length, 0);
});

test("redis store: beat commands set TTL and prune; list parses pipeline replies", async () => {
  const cmds = beatCommands("pr:prod", { id: "abcdefabcdefabcd", screen: "圖鑑", nick: null, lastSeen: 1000 + PRESENCE_TTL_MS });
  assert.deepEqual(cmds[0].slice(0, 2), ["SET", "pr:prod:s:abcdefabcdefabcd"]);
  assert.deepEqual(cmds[0].slice(3), ["EX", 75]);
  assert.deepEqual(cmds[1], ["ZADD", "pr:prod:z", 1000 + PRESENCE_TTL_MS, "abcdefabcdefabcd"]);
  assert.deepEqual(cmds[2], ["ZREMRANGEBYSCORE", "pr:prod:z", "-inf", "(1000"]);
  const sent: (string | number)[][][] = [];
  const replies: unknown[][] = [
    [0, ["id1aaaaaaaaaaaaaaa", "9000", "id2bbbbbbbbbbbbbbb", "9500"]],
    [[JSON.stringify({ screen: "深宮 第 3 層", nick: "宮人" }), null]],
  ];
  const st = new RedisPresenceStore(async (c) => {
    sent.push(c);
    return replies.shift() ?? [];
  });
  const list = await st.list("pr:preview", 10_000);
  assert.equal(sent[0][0][1], "pr:preview:z");
  assert.deepEqual(sent[1][0], ["MGET", "pr:preview:s:id1aaaaaaaaaaaaaaa", "pr:preview:s:id2bbbbbbbbbbbbbbb"]);
  assert.deepEqual(list, [{ id: "id1aaaaaaaaaaaaaaa", screen: "深宮 第 3 層", nick: "宮人", lastSeen: 9000 }]);
});
