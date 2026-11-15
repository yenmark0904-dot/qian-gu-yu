import { equipTransaction, unequipTransaction } from "./quick-equip";
import { cleanBondStoryPlay, type BondStoryPlay } from "./bond-story-play";
import { cleanSummon, setArtifactWish, summonArtifacts } from "./artifact-summon";
import { emptyArtifactSummon, type ArtifactSummonState, type ArtifactPullRecord } from "./artifact-summon-state";
import {
  applyDrops,
  cleanRaid,
  cleanRaidTeam,
  emptyRaid,
  recordRaidClear,
  RAID_ENCOUNTER_BY_ID,
  type MatDrop,
  type RaidSave,
} from "./raid";
import { refineArtifact as refineArtifactRule, type RefineResult } from "./artifact-refine";
import { resolveCompanion } from "./companion";
import {
  ARTIFACT_BY_ID,
  VAULT_GIFT_ID,
  VAULT_GIFT_KEY,
  VAULT_GIFT_SEEN_KEY,
  artifactUnlocks,
  claimVaultGift,
  cleanArtifacts,
  emptyArtifacts,
  setArtifactLock as setArtifactLockRule,
  type ArtifactInstance,
  type ArtifactSave,
  type EquipResult,
} from "./artifacts";
import {
  LETTERS,
  mergeLetterSaves,
  completeLetter,
  letterUnlocked,
  type LetterChoice,
  type LetterSave,
} from "./letters";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { claimVolumeAward, cleanVolumeAwards, levelReward, type LevelRecord } from "./levels";
import {
  cleanMainStoryHanRead,
  cleanMainStoryPrologueRead,
  cleanMainStoryQiRead,
  cleanMainStoryRead,
  cleanMainStoryTangRead,
  cleanMainStoryWuRead,
  markMainStoryHanRead as appendMainStoryHanRead,
  markMainStoryQiRead as appendMainStoryQiRead,
  markMainStoryRead as appendMainStoryRead,
  markMainStoryTangRead as appendMainStoryTangRead,
  markMainStoryWuRead as appendMainStoryWuRead,
} from "./main-story";
import { cleanMainStoryQinPlay, type QinStoryPlay } from "./qin-vn";
import { bondLevel, type Skin } from "./bond";
import { cleanAssist } from "./assist-pin";
import { BY_ID } from "./data";
import { resolveAvatarId } from "./avatar";
import {
  DEFAULT_BACKDROP,
  DEFAULT_FRAME,
  buyCharacter,
  buyCosmetic,
  ownsCosmetic,
  COSMETIC_BY_ID,
} from "./shop";
import { migrateLegacySr } from "./migrate";
import {
  applyQuestEvent,
  claimChest as claimChestRule,
  claimDailyQuest,
  claimMilestone as claimMilestoneRule,
  claimWeekly as claimWeeklyRule,
  cleanQuestBook,
  cleanTickets,
  emptyQuestBook,
  grantReward,
  type QuestBook,
  type QuestCtx,
  type QuestEvent,
  type Reward,
} from "./quests";
import { freeSummonTransaction, settleCharacterPull, type PullPay } from "./pull-settle";
import { cleanStoryEvents, type StoryEventSave } from "./story-events";
import { claimRankRewards, cleanRanksPaid } from "./shengong";
import {
  DAILY_INK,
  START_INK,
  localDay,
  payTierUp,
  settleTierPaid,
  type PullCard,
} from "./logic";

type SaveData = {
  /** 修行簿 (今日修行 / 七日修行 / 旅途饋贈). Additive; old saves default empty. Local only (not in CloudSave). */
  questBook: QuestBook;
  /** 千古召喚券: character pool only. Additive (default 0). */
  charTickets: number;
  /** 命器召喚券: artifact pool only. Additive (default 0). */
  artifactTickets: number;
  /** 劇情三消 event records (additive; old saves default empty). */
  storyEvents: StoryEventSave;
  /** 動畫教學指引: highest combat-coach version finished or skipped (0 = never; additive flag). */
  coachSeen: number;
  /** V2.0 命器: instances, equip relation, materials, one-time grants (additive; old saves default empty). */
  artifacts: ArtifactSave;
  artifactSummon: ArtifactSummonState;
  raid: RaidSave;
  companionId: string | null;
  companionGuideDone: boolean;
  letters: LetterSave;
  lettersVersion: number;
  storyLast: Record<string, number>;
  ink: number;
  pity: number;
  owned: Record<string, number>;
  totalPulls: number;
  lastDaily: string | null;
  history: string[];
  muted: boolean;
  /** 三消 level progress by level id. */
  m3: Record<string, LevelRecord>;
  /** 成就 · 卷滿: 卷 ids (1 = 卷一) whose 2000 墨玉 full-stars award was paid. One-time each. */
  volumeAwards: number[];
  /** 三消主線: 卷 ids whose opening story has been read. */
  mainStoryRead: number[];
  /** 主線序章已讀（boolean；不用 0）。舊存檔缺省 = 未讀。 */
  mainStoryPrologueRead: boolean;
  /** 西漢篇已讀卷 ids 1–10。 */
  mainStoryHanRead: number[];
  /** 三國篇已讀卷 ids 1–10。 */
  mainStoryWuRead: number[];
  /** 北齊篇已讀卷 ids 1–10。 */
  mainStoryQiRead: number[];
  /** 唐朝篇已讀卷 ids 1–10。 */
  mainStoryTangRead: number[];
  /** 秦朝篇逐句演出進度與已做選擇。 */
  bondStoryPlay: Record<string, BondStoryPlay>;
  mainStoryQinPlay: QinStoryPlay | null;
  /** 三國篇逐句演出進度與已做選擇（與秦朝篇同格式）。 */
  mainStoryWuPlay: QinStoryPlay | null;
  mainStoryQiPlay: QinStoryPlay | null;
  /** 唐朝篇逐句演出進度：卷、對話位置、已選分支（含卷六／九／十親密選擇）。 */
  mainStoryTangPlay: QinStoryPlay | null;
  /** Legacy: best score of the removed 閒弈 endless mode (kept so old saves still load). */
  m3Best: number;
  /** 墨痕: duplicate currency, spent in 墨寶閣. */
  marks: number;
  /** Bought 墨寶閣 cosmetics (frames / backdrops). */
  cosmetics: string[];
  frame: string;
  backdrop: string;
  /** Chosen bond card skin per character. */
  skins: Record<string, Skin>;
  /** 三消 助陣: a pinned character id (固定助陣, kept for every level until cleared), null = auto (strongest owned), "none" = 不帶助陣 (see game/assist-pin.ts). */
  assist: string | null;
  /** 緣分升階 墨玉: highest bond tier already settled per character (paid, or pre-existing = not back-paid). */
  tierInkPaid: Record<string, number>;
  /** 深宮: highest floor cleared, cumulative score, rank indices whose one-time 墨玉 was paid, nickname. */
  sgBest: number;
  sgTotal: number;
  sgRanksPaid: number[];
  sgNick: string | null;
  /** Top-bar avatar: owned character id, or null for the 遇 seal. */
  avatarId: string | null;
};

export type ShopError = "unknown" | "broke" | "maxed" | "owned";

type SaveActions = {
  setBondStoryPlay: (key: string, play: BondStoryPlay) => void;
  /** 修行簿 event tracker (LOGIN / MATCH3 / … ). Safe to call any time; rolls the 04:00 period first. */
  questEvent: (event: QuestEvent, n?: number) => void;
  /** Claim a completed daily quest's 墨緣值; returns 墨緣 gained (0 = nothing). */
  claimQuest: (id: string) => number;
  claimQuestChest: (step: number) => Reward | null;
  claimWeeklyQuest: (id: string) => Reward | null;
  claimMilestone: (id: string) => Reward | null;
  /** 今日免費召喚: one free character single pull per quest-day (Taipei 04:00). */
  pullFree: () => PullCard[] | "used";
  pullArtifact: (n: 1 | 10, pay?: "ink" | "ticket") => ArtifactPullRecord[] | string;
  setArtifactWish: (eid: string | null) => void;
  /** Equip a 命器 instance on any owned character; moving it off someone else needs confirmTransfer. */
  equipArtifact: (uid: string, charId: string, confirmTransfer?: boolean) => EquipResult;
  unequipArtifact: (uid: string) => boolean;
  setArtifactLock: (uid: string, locked: boolean) => void;
  /** 命器淬鍊: spend 鎮厄司 materials (never 墨玉 / cards / 緣分) for Lv+1; Lv.10 覺醒 needs 第 50 關. */
  refineArtifact: (uid: string, dev?: boolean) => RefineResult;
  /** Pay the one-time 命器閣 gift if 第 5 關 is cleared (or dev flag); returns the new instance or null. */
  syncArtifactGift: (dev?: boolean) => ArtifactInstance | null;
  /** First 命器閣 visit after the gift: returns the gift name once (sticky "seen" marker), else null. */
  takeArtifactGiftNotice: () => string | null;
  setRaidTeam: (ids: string[]) => void;
  /** 劇情三消: count a try; mark cleared / skipped (never pays 墨玉). */
  recordStoryEvent: (id: string, outcome: "try" | "clear" | "skip") => void;
  markCoachSeen: (version: number) => void;
  /** 鎮厄司 win: materials drop (+ one-time first-clear bonus); null if the tier is still locked. */
  winRaid: (encounterId: string, dev?: boolean) => { drops: MatDrop; first: boolean; ink: number } | null;
  setCompanionId: (id: string | null) => boolean;
  readLetter: (id: string) => void;
  replyLetter: (id: string, choice: LetterChoice) => number;
  visitStory: (chapter: number, volume: number) => void;
  /** Character pull. pay "ink" (default, unchanged 160/1440) or "ticket" (千古召喚券, never falls back to 墨玉). */
  pull: (n: 1 | 10, pay?: Exclude<PullPay, "free">) => PullCard[] | "broke" | "no-tickets";
  claimDaily: () => boolean;
  gain: (amount: number) => void;
  /** Record a level clear, pay its 墨玉 reward and return the amount paid. */
  clearLevel: (id: number, stars: number, final: number) => { reward: number; prevStars: number };
  /** 深宮 floor clear: only the next floor counts; pays each new title's 墨玉 once, never per floor. */
  clearFloor: (floor: number, final: number) => { counted: boolean; ink: number; ranks: number[] };
  setSgNick: (nick: string) => void;
  /** Set avatar to an owned character, or null for the seal. Returns false if the id is not owned. */
  setAvatarId: (id: string | null) => boolean;
  /** Pay a 卷's 成就 once; returns the 墨玉 paid (0 if the 卷 is not full or already claimed). */
  claimVolumeAward: (volume: number) => number;
  /** Mark a 卷's main story as read (idempotent). */
  markMainStoryRead: (volume: number) => void;
  /** Mark 序章 as read (idempotent). */
  markMainStoryPrologueRead: () => void;
  /** Mark 西漢篇 volume as read (idempotent). */
  markMainStoryHanRead: (volume: number) => void;
  /** Mark 三國篇 volume as read (idempotent). */
  markMainStoryWuRead: (volume: number) => void;
  /** Mark 北齊篇 volume as read (idempotent). */
  markMainStoryQiRead: (volume: number) => void;
  /** Mark 唐朝篇 volume as read (idempotent). */
  markMainStoryTangRead: (volume: number) => void;
  /** Persist Qin VN cursor, branch, and choices. */
  setMainStoryQinPlay: (play: QinStoryPlay | null) => void;
  /** Persist 三國篇 VN cursor and choices. */
  setMainStoryWuPlay: (play: QinStoryPlay | null) => void;
  setMainStoryQiPlay: (play: QinStoryPlay | null) => void;
  setMainStoryTangPlay: (play: QinStoryPlay | null) => void;
  buyCharacter: (
    id: string,
  ) => { ok: true; price: number; tierInk: number } | { ok: false; reason: ShopError };
  buyCosmetic: (id: string) => { ok: true; price: number } | { ok: false; reason: ShopError };
  equip: (id: string) => boolean;
  setSkin: (id: string, skin: Skin) => void;
  setAssist: (id: string | null) => void;
  applyCloud: (row: CloudSave) => void;
  toggleMuted: () => void;
  reset: () => void;
};

export type CloudSave = {
  ink: number;
  pity: number;
  owned: Record<string, number>;
  totalPulls: number;
  lastDaily: string | null;
  history: string[];
  /** 成就 · 卷滿 claimed 卷 ids (optional so older cloud rows still parse). */
  volumeAwards?: number[];
};

export function toCloud(state: SaveData): CloudSave {
  return {
    ink: state.ink,
    pity: state.pity,
    owned: state.owned,
    totalPulls: state.totalPulls,
    lastDaily: state.lastDaily,
    history: state.history,
    volumeAwards: state.volumeAwards,
  };
}

/** Shared ink grant arithmetic used by gain and atomic one-time letter completion. */
const grantedInk = (ink: number, amount: number) => ink + Math.max(0, amount);

const initial: SaveData = {
  questBook: emptyQuestBook(),
  charTickets: 0,
  artifactTickets: 0,
  storyEvents: {},
  coachSeen: 0,
  artifacts: emptyArtifacts(),
  artifactSummon: emptyArtifactSummon(),
  raid: emptyRaid(),
  companionId: null,
  companionGuideDone: false,
  letters: {},
  lettersVersion: 1,
  storyLast: {},
  ink: START_INK,
  pity: 0,
  owned: {},
  totalPulls: 0,
  lastDaily: null,
  history: [],
  muted: false,
  m3: {},
  volumeAwards: [],
  mainStoryRead: [],
  mainStoryPrologueRead: false,
  mainStoryHanRead: [],
  mainStoryWuRead: [],
  mainStoryQiRead: [],
  mainStoryTangRead: [],
  bondStoryPlay: {},
  mainStoryQinPlay: null,
  mainStoryWuPlay: null,
  mainStoryQiPlay: null,
  mainStoryTangPlay: null,
  m3Best: 0,
  marks: 0,
  cosmetics: [],
  frame: DEFAULT_FRAME,
  backdrop: DEFAULT_BACKDROP,
  skins: {},
  assist: null,
  tierInkPaid: {},
  sgBest: 0,
  sgTotal: 0,
  sgRanksPaid: [],
  sgNick: null,
  avatarId: null,
};

const questCtx = (s: Pick<SaveData, "m3">): QuestCtx => {
  const u = artifactUnlocks(s.m3);
  return { vault: u.vault, raid: u.raid };
};
/**
 * Patch for a finished 主線 / 深宮 三消. t445u: 命器養成 is now 「強化命器一次」 (ARTIFACT_ENHANCED from
 * refineArtifact), so a 三消 clear no longer fires EQUIPMENT_MATCH_COMPLETED.
 */
const matchQuestPatch = (s: SaveData, now = Date.now()) => applyQuestEvent(s.questBook, "MATCH3_COMPLETED", now);

export const useSave = create<SaveData & SaveActions>()(
  persist(
    (set, get) => ({
      ...initial,
      questEvent: (event, n = 1) => {
        const s = get();
        const book = applyQuestEvent(s.questBook, event, Date.now(), n);
        if (book !== s.questBook) set({ questBook: book });
      },
      claimQuest: (id) => {
        const s = get();
        const res = claimDailyQuest(s.questBook, id, questCtx(s), Date.now());
        set({ questBook: res.book });
        return res.moyuan;
      },
      claimQuestChest: (step) => {
        const s = get();
        const res = claimChestRule(s.questBook, step, questCtx(s), Date.now());
        if (!res.reward) {
          if (res.book !== s.questBook) set({ questBook: res.book });
          return null;
        }
        set({ questBook: res.book, ...grantReward(s, res.reward) });
        return res.reward;
      },
      claimWeeklyQuest: (id) => {
        const s = get();
        const res = claimWeeklyRule(s.questBook, id, questCtx(s), Date.now());
        if (!res.reward) {
          if (res.book !== s.questBook) set({ questBook: res.book });
          return null;
        }
        set({ questBook: res.book, ...grantReward(s, res.reward) });
        return res.reward;
      },
      claimMilestone: (id) => {
        const s = get();
        const res = claimMilestoneRule(s.questBook, id, s);
        if (!res.reward) return null;
        set({ questBook: res.book, ...grantReward(s, res.reward) });
        return res.reward;
      },
      pullFree: () => {
        // Cards, pity and the day's free-pull mark commit together: a refresh can never re-grant it.
        const res = freeSummonTransaction(get(), Date.now());
        if (!res.ok) return "used";
        set(res.patch);
        return res.cards;
      },
      pullArtifact: (n, pay = "ink") => {
        const s0 = get();
        if (pay === "ticket" && s0.artifactTickets < n) return "no-tickets";
        const result = summonArtifacts(s0, n, Math.random, Date.now(), pay);
        if (!result.ok) return result.error;
        const before = get();
        const artifactTickets = pay === "ticket" ? before.artifactTickets - n : before.artifactTickets;
        try {
          set({ ink: result.ink, artifacts: result.artifacts, artifactSummon: result.artifactSummon, artifactTickets });
        } catch {
          // localStorage quota/unavailable: revert memory too; no unpaid result is shown.
          try { set({ ink: before.ink, artifacts: before.artifacts, artifactSummon: before.artifactSummon, artifactTickets: before.artifactTickets }); } catch { /* state already restored before persistence throws */ }
          return "save-failed";
        }
        return result.records;
      },
      setArtifactWish: (eid) => {
        const before = get().artifactSummon;
        try { set({ artifactSummon: setArtifactWish(before, eid) }); }
        catch { try { set({ artifactSummon: before }); } catch { /* restore memory even if storage remains unavailable */ } }
      },
      equipArtifact: (uid, charId, confirmTransfer = false) => {
        return equipTransaction(get(), uid, charId, confirmTransfer, (artifacts) => set({ artifacts }));
      },
      unequipArtifact: (uid) => unequipTransaction(get(), uid, (artifacts) => set({ artifacts })),
      setArtifactLock: (uid, locked) =>
        set({ artifacts: setArtifactLockRule(get().artifacts, uid, locked) }),
      refineArtifact: (uid, dev = false) => {
        const s = get();
        const res = refineArtifactRule(s.artifacts, uid, artifactUnlocks(s.m3, dev));
        if (!res.ok) return res;
        // Materials, level and the 修行簿 「強化命器一次」 commit together.
        set({ artifacts: res.save, questBook: applyQuestEvent(s.questBook, "ARTIFACT_ENHANCED", Date.now()) });
        return res;
      },
      syncArtifactGift: (dev = false) => {
        const s = get();
        const res = claimVaultGift(s.artifacts, s.m3, dev);
        if (res.granted) set({ artifacts: res.save });
        return res.granted;
      },
      takeArtifactGiftNotice: () => {
        const a = get().artifacts;
        if (!a.grants.includes(VAULT_GIFT_KEY) || a.grants.includes(VAULT_GIFT_SEEN_KEY)) return null;
        set({ artifacts: { ...a, grants: [...a.grants, VAULT_GIFT_SEEN_KEY] } });
        return ARTIFACT_BY_ID[VAULT_GIFT_ID]?.name ?? null;
      },
      markCoachSeen: (version) => set({ coachSeen: Math.max(get().coachSeen, Math.floor(version)) }),
      recordStoryEvent: (id, outcome) => {
        const old = get().storyEvents[id] ?? { cleared: false, skipped: false, tries: 0 };
        const next = {
          cleared: old.cleared || outcome === "clear",
          skipped: old.skipped || outcome === "skip",
          tries: old.tries + (outcome === "try" ? 1 : 0),
        };
        set({ storyEvents: cleanStoryEvents({ ...get().storyEvents, [id]: next }) });
      },
      setRaidTeam: (ids) => set({ raid: { ...get().raid, team: cleanRaidTeam(ids, get().owned) } }),
      winRaid: (encounterId, dev = false) => {
        const s = get();
        const enc = RAID_ENCOUNTER_BY_ID[encounterId];
        if (!enc || !artifactUnlocks(s.m3, dev)[enc.unlock]) return null;
        const res = recordRaidClear(s.raid, enc);
        // Drops, records, the legacy one-time 墨玉 and BOSS_BATTLE_WON land in one commit (no double pay on refresh).
        set({
          raid: res.raid,
          ink: s.ink + res.ink,
          artifacts: { ...s.artifacts, materials: applyDrops(s.artifacts.materials, res.drops) },
          questBook: applyQuestEvent(s.questBook, "BOSS_BATTLE_WON", Date.now()),
        });
        return { drops: res.drops, first: res.first, ink: res.ink };
      },
      visitStory: (chapter, volume) =>
        set({ storyLast: { ...get().storyLast, [chapter]: volume } }),
      readLetter: (id) => {
        const letter = LETTERS.find((l) => l.id === id);
        const s = get();
        if (!letter || !letterUnlocked(letter, s)) return;
        set({
          letters: {
            ...s.letters,
            [id]: { ...(s.letters[id] ?? { completed: false, rewardClaimed: false }), read: true },
          },
        });
      },
      replyLetter: (id, choice) => {
        const letter = LETTERS.find((l) => l.id === id);
        if (!letter) return 0;
        const s = get();
        const result = completeLetter(s.letters, letter, choice, s);
        // Single persisted transition: no refresh window between granting ink and marking paid.
        // Same grant helper as gain(), with the payment marker committed atomically.
        set({ letters: result.letters, ink: grantedInk(s.ink, result.reward) });
        return result.reward;
      },
      pull: (n, pay = "ink") => {
        const res = settleCharacterPull(get(), n, pay);
        if (!res.ok) return res.error === "no-tickets" ? "no-tickets" : "broke";
        set(res.patch);
        return res.cards;
      },
      claimDaily: () => {
        const today = localDay();
        const state = get();
        if (state.lastDaily === today) return false;
        set({ ink: state.ink + DAILY_INK, lastDaily: today });
        return true;
      },
      gain: (amount) => {
        if (amount <= 0) return;
        set({ ink: grantedInk(get().ink, amount) });
      },
      clearFloor: (floor, final) => {
        const state = get();
        if (floor !== state.sgBest + 1) {
          // An already-climbed floor pays nothing, but it was still a finished 三消 for 修行簿.
          if (floor >= 1 && floor <= state.sgBest) set({ questBook: matchQuestPatch(state) });
          return { counted: false, ink: 0, ranks: [] };
        }
        const claim = claimRankRewards(floor, state.sgRanksPaid);
        set({
          questBook: matchQuestPatch(state),
          sgBest: floor,
          sgTotal: state.sgTotal + Math.max(0, Math.floor(final)),
          sgRanksPaid: claim.paid,
          ink: state.ink + claim.ink,
        });
        return { counted: true, ink: claim.ink, ranks: claim.ranks };
      },
      setSgNick: (nick) => set({ sgNick: nick }),
      setAvatarId: (id) => {
        if (id == null) {
          set({ avatarId: null });
          return true;
        }
        const next = resolveAvatarId(get().owned, id);
        if (!next) return false;
        set({ avatarId: next });
        return true;
      },
      clearLevel: (id, stars, final) => {
        const state = get();
        const prev = state.m3[String(id)];
        const prevStars = prev?.stars ?? 0;
        const reward = levelReward(id, prevStars, stars);
        const m3 = {
          ...state.m3,
          [String(id)]: {
            stars: Math.max(prevStars, stars),
            best: Math.max(prev?.best ?? 0, final),
          },
        };
        // 第 5 關通關 opens 命器閣: its one-time gift lands in the same commit (sticky grant key).
        set({
          ink: state.ink + reward,
          m3,
          artifacts: claimVaultGift(state.artifacts, m3).save,
          questBook: matchQuestPatch(state),
        });
        return { reward, prevStars };
      },
      claimVolumeAward: (volume) => {
        const res = claimVolumeAward(get(), volume);
        if (res.paid > 0) set({ ink: res.ink, volumeAwards: res.volumeAwards });
        return res.paid;
      },
      markMainStoryRead: (volume) => {
        set({
          mainStoryRead: appendMainStoryRead(get().mainStoryRead, volume),
          questBook: applyQuestEvent(get().questBook, "MAIN_STORY_READ", Date.now()),
        });
      },
      markMainStoryPrologueRead: () => {
        set({
          mainStoryPrologueRead: true,
          questBook: applyQuestEvent(get().questBook, "MAIN_STORY_READ", Date.now()),
        });
      },
      markMainStoryHanRead: (volume) => {
        set({
          mainStoryHanRead: appendMainStoryHanRead(get().mainStoryHanRead, volume),
          questBook: applyQuestEvent(get().questBook, "MAIN_STORY_READ", Date.now()),
        });
      },
      markMainStoryWuRead: (volume) => {
        set({
          mainStoryWuRead: appendMainStoryWuRead(get().mainStoryWuRead, volume),
          questBook: applyQuestEvent(get().questBook, "MAIN_STORY_READ", Date.now()),
        });
      },
      markMainStoryQiRead: (volume) => {
        set({
          mainStoryQiRead: appendMainStoryQiRead(get().mainStoryQiRead, volume),
          questBook: applyQuestEvent(get().questBook, "MAIN_STORY_READ", Date.now()),
        });
      },
      markMainStoryTangRead: (volume) => {
        set({
          mainStoryTangRead: appendMainStoryTangRead(get().mainStoryTangRead, volume),
          questBook: applyQuestEvent(get().questBook, "MAIN_STORY_READ", Date.now()),
        });
      },
      setBondStoryPlay: (key, play) => {
        const clean = cleanBondStoryPlay({ [key]: play });
        set({ bondStoryPlay: { ...get().bondStoryPlay, ...clean } });
      },
      setMainStoryQinPlay: (play) => {
        set({ mainStoryQinPlay: cleanMainStoryQinPlay(play) });
      },
      setMainStoryQiPlay: (play) => {
        set({ mainStoryQiPlay: cleanMainStoryQinPlay(play) });
      },
      setMainStoryTangPlay: (play) => {
        set({ mainStoryTangPlay: cleanMainStoryQinPlay(play) });
      },
      setMainStoryWuPlay: (play) => {
        set({ mainStoryWuPlay: cleanMainStoryQinPlay(play) });
      },
      buyCharacter: (id) => {
        const state = get();
        const res = buyCharacter(state, id, BY_ID[id]?.rarity);
        if (!res.ok) return res;
        const prev = state.owned[id] ?? 0;
        const tier =
          prev > 0
            ? payTierUp(
                state.tierInkPaid,
                id,
                bondLevel(prev),
                bondLevel(res.state.owned[id] ?? prev),
              )
            : { ink: 0, paid: state.tierInkPaid };
        set({
          marks: res.state.marks,
          owned: res.state.owned,
          ink: state.ink + tier.ink,
          tierInkPaid: tier.paid,
        });
        return { ok: true, price: res.price, tierInk: tier.ink };
      },
      buyCosmetic: (id) => {
        const res = buyCosmetic(get(), id);
        if (!res.ok) return res;
        set({ marks: res.state.marks, cosmetics: res.state.cosmetics });
        return { ok: true, price: res.price };
      },
      equip: (id) => {
        const item = COSMETIC_BY_ID[id];
        if (!item || !ownsCosmetic(get().cosmetics, id)) return false;
        set(item.kind === "frame" ? { frame: id } : { backdrop: id });
        return true;
      },
      setCompanionId: (id) => {
        if (id !== null && !resolveCompanion(id, get().owned)) return false;
        set({ companionId: id, companionGuideDone: id !== null || get().companionGuideDone });
        return true;
      },
      setSkin: (id, skin) => set({ skins: { ...get().skins, [id]: skin } }),
      setAssist: (id) => set({ assist: id }),
      applyCloud: (row) =>
        set({
          ink: row.ink,
          pity: row.pity,
          owned: row.owned,
          companionId: resolveCompanion(get().companionId, row.owned),
          totalPulls: row.totalPulls,
          lastDaily: row.lastDaily,
          history: row.history,
          // Tiers that arrive with a cloud save are settled, never paid here (they were earned elsewhere).
          tierInkPaid: settleTierPaid(row.owned, get().tierInkPaid),
          // A claimed 卷 stays claimed: a cloud row can add ids but never remove them.
          volumeAwards: cleanVolumeAwards([...get().volumeAwards, ...(row.volumeAwards ?? [])]),
        }),
      toggleMuted: () => set({ muted: !get().muted }),
      reset: () =>
        set({
          ...initial,
                  questBook: emptyQuestBook(),
          artifacts: emptyArtifacts(),
  artifactSummon: emptyArtifactSummon(),
          owned: {},
          history: [],
          m3: {},
          cosmetics: [],
          skins: {},
          volumeAwards: [],
          mainStoryRead: [],
          mainStoryPrologueRead: false,
          mainStoryHanRead: [],
          mainStoryWuRead: [],
          mainStoryQiRead: [],
          mainStoryTangRead: [],
          bondStoryPlay: {},
          mainStoryQinPlay: null,
          mainStoryWuPlay: null,
          mainStoryQiPlay: null,
          mainStoryTangPlay: null,
          tierInkPaid: {},
          sgRanksPaid: [],
        }),
    }),
    {
      name: "qiangu-yu",
      skipHydration: true,
      version: 5,
      // Persist only live save fields, excluding actions and retired trial data.
      partialize: (state) => Object.fromEntries(Object.keys(initial).map((key) => [key, state[key as keyof SaveData]])),
      migrate: (persisted) => migrateLegacySr(persisted),
      // Older saves have no volumeAwards; junk ids are dropped so a 卷 can never pay twice or be faked.
      merge: (persisted, current) => {
        // Ignore retired/unknown fields without resetting any current save data.
        const p = Object.fromEntries(
          Object.entries((persisted ?? {}) as Record<string, unknown>).filter(([key]) => Object.hasOwn(initial, key)),
        ) as Partial<SaveData>;
        // 緣分升階 墨玉: tiers an older save already has are settled without back-pay; the mark never drops.
        const sgBest =
          Number.isInteger(p.sgBest) && (p.sgBest as number) > 0 ? (p.sgBest as number) : 0;
        return {
          ...current,
          ...p,
          // 修行簿 / 召喚券: additive; missing on old saves → empty book, 0 tickets (period rolls on first use).
          // A cloud snapshot (CloudSave.applySnapshot → merge) carries none of these: keep the local ones,
          // so claimed milestones / tickets are never wiped or re-granted by a cloud restore.
          questBook: cleanQuestBook(p.questBook ?? current.questBook),
          charTickets: cleanTickets(p.charTickets ?? current.charTickets),
          artifactTickets: cleanTickets(p.artifactTickets ?? current.artifactTickets),
          // 命器: cleaned (never wiped); players who already cleared 第 5 關 get the one-time gift once.
          artifacts: claimVaultGift(
            cleanArtifacts(p.artifacts, (p.owned ?? current.owned) as Record<string, number>),
            (p.m3 ?? current.m3) as SaveData["m3"],
          ).save,
          artifactSummon: cleanSummon(p.artifactSummon),
          raid: cleanRaid(p.raid, p.owned ?? current.owned),
          storyEvents: cleanStoryEvents(p.storyEvents),
          coachSeen: Number.isInteger(p.coachSeen) ? Math.max(0, Math.min(99, p.coachSeen as number)) : 0,
          companionId: resolveCompanion(p.companionId, p.owned ?? current.owned),
          companionGuideDone: p.companionGuideDone === true,
          letters: mergeLetterSaves(current.letters, p.letters),
          lettersVersion: 1,
          storyLast: Object.fromEntries(
            Object.entries(p.storyLast ?? {}).filter(
              ([k, v]) => /^[1-5]$/.test(k) && Number.isInteger(v) && v >= 1 && v <= 10,
            ),
          ),
          volumeAwards: cleanVolumeAwards(p.volumeAwards),
          mainStoryRead: cleanMainStoryRead(p.mainStoryRead),
          mainStoryPrologueRead: cleanMainStoryPrologueRead(p.mainStoryPrologueRead),
          mainStoryHanRead: cleanMainStoryHanRead(p.mainStoryHanRead),
          mainStoryWuRead: cleanMainStoryWuRead(p.mainStoryWuRead),
          mainStoryQiRead: cleanMainStoryQiRead(p.mainStoryQiRead),
          mainStoryTangRead: cleanMainStoryTangRead(p.mainStoryTangRead),
          bondStoryPlay: cleanBondStoryPlay(p.bondStoryPlay ?? current.bondStoryPlay),
          mainStoryQinPlay: cleanMainStoryQinPlay(p.mainStoryQinPlay),
          mainStoryWuPlay: cleanMainStoryQinPlay(p.mainStoryWuPlay),
          mainStoryQiPlay: cleanMainStoryQinPlay(p.mainStoryQiPlay),
          mainStoryTangPlay: cleanMainStoryQinPlay(p.mainStoryTangPlay),
          tierInkPaid: settleTierPaid(p.owned, p.tierInkPaid),
          sgBest,
          sgTotal:
            Number.isFinite(p.sgTotal) && (p.sgTotal as number) > 0
              ? Math.floor(p.sgTotal as number)
              : 0,
          sgRanksPaid: cleanRanksPaid(p.sgRanksPaid, sgBest),
          // 固定助陣: a pinned id survives reloads; junk falls back to auto.
          assist: cleanAssist(p.assist),
          sgNick: typeof p.sgNick === "string" && p.sgNick ? p.sgNick : null,
          avatarId: resolveAvatarId(
            (p.owned ?? current.owned) as Record<string, number>,
            typeof p.avatarId === "string" ? p.avatarId : null,
          ),
        };
      },
    },
  ),
);
