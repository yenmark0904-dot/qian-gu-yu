import { create } from "zustand";
import { persist } from "zustand/middleware";
import { claimVolumeAward, cleanVolumeAwards, levelReward, type LevelRecord } from "./levels";
import { bondLevel, dupOutcome, type Skin } from "./bond";
import { BY_ID } from "./data";
import { DEFAULT_BACKDROP, DEFAULT_FRAME, buyCharacter, buyCosmetic, ownsCosmetic, COSMETIC_BY_ID } from "./shop";
import { migrateLegacySr } from "./migrate";
import {
  COST_ONE,
  COST_TEN,
  DAILY_INK,
  DUP_REFUND,
  START_INK,
  localDay,
  payTierUp,
  pullMany,
  settleTierPaid,
  type PullCard,
} from "./logic";

type SaveData = {
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
  /** 三消 助陣: a character id, null = auto (strongest owned), "none" = 不帶助陣 (see game/assist.ts). */
  assist: string | null;
  /** 緣分升階 墨玉: highest bond tier already settled per character (paid, or pre-existing = not back-paid). */
  tierInkPaid: Record<string, number>;
};

export type ShopError = "unknown" | "broke" | "maxed" | "owned";

type SaveActions = {
  pull: (n: 1 | 10) => PullCard[] | "broke";
  claimDaily: () => boolean;
  gain: (amount: number) => void;
  /** Record a level clear, pay its 墨玉 reward and return the amount paid. */
  clearLevel: (id: number, stars: number, final: number) => { reward: number; prevStars: number };
  /** Pay a 卷's 成就 once; returns the 墨玉 paid (0 if the 卷 is not full or already claimed). */
  claimVolumeAward: (volume: number) => number;
  buyCharacter: (id: string) => { ok: true; price: number; tierInk: number } | { ok: false; reason: ShopError };
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

const initial: SaveData = {
  ink: START_INK,
  pity: 0,
  owned: {},
  totalPulls: 0,
  lastDaily: null,
  history: [],
  muted: false,
  m3: {},
  volumeAwards: [],
  m3Best: 0,
  marks: 0,
  cosmetics: [],
  frame: DEFAULT_FRAME,
  backdrop: DEFAULT_BACKDROP,
  skins: {},
  assist: null,
  tierInkPaid: {},
};

export const useSave = create<SaveData & SaveActions>()(
  persist(
    (set, get) => ({
      ...initial,
      pull: (n) => {
        const cost = n === 1 ? COST_ONE : COST_TEN;
        const state = get();
        if (state.ink < cost) return "broke";
        const rolled = pullMany(state.pity, n, state.totalPulls === 0);
        const owned = { ...state.owned };
        let ink = state.ink - cost;
        let marks = state.marks;
        let tierInkPaid = state.tierInkPaid;
        const cards: PullCard[] = rolled.cards.map((character) => {
          const prev = owned[character.id] ?? 0;
          const isNew = prev === 0;
          const count = prev + 1;
          const refund = isNew ? 0 : DUP_REFUND[character.rarity];
          const bond = dupOutcome(character.rarity, prev);
          owned[character.id] = count;
          const tier = payTierUp(tierInkPaid, character.id, bond.prevLevel, bond.level);
          tierInkPaid = tier.paid;
          ink += refund + tier.ink;
          marks += bond.marks;
          return { character, isNew, count, refund, bond: bond.level, bondUp: bond.levelUp, marks: bond.marks, tierInk: tier.ink };
        });
        set({
          ink,
          marks,
          tierInkPaid,
          pity: rolled.pity,
          owned,
          totalPulls: state.totalPulls + n,
          history: [...rolled.cards.map((c) => c.id), ...state.history].slice(0, 40),
        });
        return cards;
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
        set({ ink: get().ink + amount });
      },
      clearLevel: (id, stars, final) => {
        const state = get();
        const prev = state.m3[String(id)];
        const prevStars = prev?.stars ?? 0;
        const reward = levelReward(id, prevStars, stars);
        set({
          ink: state.ink + reward,
          m3: { ...state.m3, [String(id)]: { stars: Math.max(prevStars, stars), best: Math.max(prev?.best ?? 0, final) } },
        });
        return { reward, prevStars };
      },
      claimVolumeAward: (volume) => {
        const res = claimVolumeAward(get(), volume);
        if (res.paid > 0) set({ ink: res.ink, volumeAwards: res.volumeAwards });
        return res.paid;
      },
      buyCharacter: (id) => {
        const state = get();
        const res = buyCharacter(state, id, BY_ID[id]?.rarity);
        if (!res.ok) return res;
        const prev = state.owned[id] ?? 0;
        const tier =
          prev > 0
            ? payTierUp(state.tierInkPaid, id, bondLevel(prev), bondLevel(res.state.owned[id] ?? prev))
            : { ink: 0, paid: state.tierInkPaid };
        set({ marks: res.state.marks, owned: res.state.owned, ink: state.ink + tier.ink, tierInkPaid: tier.paid });
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
      setSkin: (id, skin) => set({ skins: { ...get().skins, [id]: skin } }),
      setAssist: (id) => set({ assist: id }),
      applyCloud: (row) =>
        set({
          ink: row.ink,
          pity: row.pity,
          owned: row.owned,
          totalPulls: row.totalPulls,
          lastDaily: row.lastDaily,
          history: row.history,
          // Tiers that arrive with a cloud save are settled, never paid here (they were earned elsewhere).
          tierInkPaid: settleTierPaid(row.owned, get().tierInkPaid),
          // A claimed 卷 stays claimed: a cloud row can add ids but never remove them.
          volumeAwards: cleanVolumeAwards([...get().volumeAwards, ...(row.volumeAwards ?? [])]),
        }),
      toggleMuted: () => set({ muted: !get().muted }),
      reset: () => set({ ...initial, owned: {}, history: [], m3: {}, cosmetics: [], skins: {}, volumeAwards: [], tierInkPaid: {} }),
    }),
    {
      name: "qiangu-yu",
      skipHydration: true,
      version: 4,
      migrate: (persisted) => migrateLegacySr(persisted),
      // Older saves have no volumeAwards; junk ids are dropped so a 卷 can never pay twice or be faked.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SaveData>;
        // 緣分升階 墨玉: tiers an older save already has are settled without back-pay; the mark never drops.
        return { ...current, ...p, volumeAwards: cleanVolumeAwards(p.volumeAwards), tierInkPaid: settleTierPaid(p.owned, p.tierInkPaid) };
      },
    },
  ),
);
