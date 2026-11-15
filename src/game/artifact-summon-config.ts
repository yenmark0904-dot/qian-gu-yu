/** Confirmed summon economy. Essence counts converted new copies, not paid currency. */
export const ARTIFACT_SUMMON = {
  one: 150,
  ten: 1350,
  ssPity: 10,
  ssrPity: 60,
  wishSSR: 120,
  wishSS: 40,
  rates: { SSR: 0.01, SS: 0.02, S: 0.485, R: 0.485 },
  // Initial bookkeeping unit (one converted new copy = one share); future spend values are not set.
  essencePerDuplicate: 1,
  historyLimit: 200,
} as const;
