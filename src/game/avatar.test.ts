import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHARACTERS } from "./data.ts";
import { resolveAvatarId } from "./avatar.ts";
import { sanitizeSnapshot, type Snapshot } from "./cloud-save.ts";

const ID = CHARACTERS[0]!.id;
const ID2 = CHARACTERS[1]!.id;

test("resolveAvatarId accepts owned, rejects unowned/unknown/null", () => {
  assert.equal(resolveAvatarId({ [ID]: 1 }, ID), ID);
  assert.equal(resolveAvatarId({ [ID]: 2 }, ID), ID);
  assert.equal(resolveAvatarId({ [ID]: 0 }, ID), null);
  assert.equal(resolveAvatarId({}, ID), null);
  assert.equal(resolveAvatarId({ [ID]: 1 }, "nobody"), null);
  assert.equal(resolveAvatarId({ [ID]: 1 }, null), null);
  assert.equal(resolveAvatarId({ [ID]: 1 }, undefined), null);
});

test("cloud sanitize keeps owned avatarId and drops illegal ones", () => {
  const ok = sanitizeSnapshot({ owned: { [ID]: 1 }, avatarId: ID, ink: 100 });
  assert.ok(ok.ok);
  assert.equal((ok as { ok: true; data: Snapshot }).data.avatarId, ID);

  const unowned = sanitizeSnapshot({ owned: { [ID]: 1 }, avatarId: ID2, ink: 100 });
  assert.ok(unowned.ok);
  assert.equal((unowned as { ok: true; data: Snapshot }).data.avatarId, null);

  const junk = sanitizeSnapshot({ owned: { [ID]: 1 }, avatarId: "hacker", ink: 100 });
  assert.ok(junk.ok);
  assert.equal((junk as { ok: true; data: Snapshot }).data.avatarId, null);

  const empty = sanitizeSnapshot({});
  assert.ok(empty.ok);
  assert.equal((empty as { ok: true; data: Snapshot }).data.avatarId, null);
});

test("store wiring: setAvatarId and merge reject unowned avatars", () => {
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.ok(store.includes("setAvatarId"), "store exposes setAvatarId");
  assert.ok(store.includes("resolveAvatarId"), "store uses resolveAvatarId");
  assert.ok(store.includes("avatarId: null"), "default avatar is seal");
  const hall = readFileSync(new URL("../components/game/Hall.tsx", import.meta.url), "utf8");
  assert.ok(hall.includes("SettingsSheet") && hall.includes("PlayerAvatar"), "TopBar opens settings");
  const settings = readFileSync(new URL("../components/game/Settings.tsx", import.meta.url), "utf8");
  assert.ok(settings.includes("頭貼") && settings.includes("名字") && settings.includes("setSgNick"), "settings sheet");
});
