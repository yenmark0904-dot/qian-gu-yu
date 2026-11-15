import { EXTRA_LETTERS } from "./letters-extra.ts";
/** 千年書信：額外陪伴內容；條件依實際已讀卷判定，不改主線解鎖。 */
export const LETTER_REWARD = 20;
export type LetterChoice = "A" | "B" | "C";
export type LetterRecord = {
  read: boolean;
  choice?: LetterChoice;
  completed: boolean;
  rewardClaimed: boolean;
};
export type LetterSave = Record<string, LetterRecord>;
export type LetterProgress = {
  owned: Record<string, number>;
  mainStoryRead: number[];
  mainStoryHanRead?: number[];
  mainStoryWuRead?: number[];
  mainStoryQiRead?: number[];
  mainStoryTangRead?: number[];
};
export type Letter = {
  id: string;
  character: string;
  tier: string;
  title: string;
  afterVolume?: number;
  afterChapter?: 1 | 2 | 3 | 4 | 5;
  body: string;
  replies: { id: LetterChoice; tone: string; text: string; response: string }[];
  closer: string;
};
export const LETTERS: Letter[] = [
  {
    id: "qin-1",
    character: "qin",
    tier: "初念",
    title: "一紙問安",
    body: "宮中今日落了細雨，簷下水聲不歇。朕擱筆時，忽然想起你初來時的神情。旁人見朕，多半低頭不語，你卻像藏著許多問題，想問，又不肯輕易問出口。朕尚不知道你從何處來，也不急著要你作答。若這些墨字當真能到你手裡，便告訴朕，那邊可也下雨？出門記得添衣，陌生的路不必趕得太急。這並非詔令，你若得閒，回一兩句便可。朕只是想知道，你此刻是否安好。",
    replies: [
      {
        id: "A",
        tone: "溫柔關懷",
        text: "我很好。陛下也別在窗邊坐得太久，雨天容易受寒。",
        response: "朕原是問你的安危，倒先得了你的叮囑。窗已掩上。這下，你可安心了？",
      },
      {
        id: "B",
        tone: "俏皮曖昧",
        text: "原來陛下也會問天氣？那我得把這封信好好收著。",
        response: "問一句天氣，有何稀奇。……你若想收著，便收著，不必特意報與朕知。",
      },
      {
        id: "C",
        tone: "真誠直白",
        text: "還有些不習慣，但收到陛下的信，我就沒那麼慌了。",
        response: "不習慣便慢些走。怕的時候不必硬撐，朕並不以此看輕你。你肯說實話，很好。",
      },
    ],
    closer: "雨勢漸緩。願你今夜睡得安穩。",
  },
  {
    id: "qin-2",
    character: "qin",
    tier: "牽掛",
    title: "燈下有餘溫",
    afterVolume: 4,
    body: "今夜窗邊的燈亮得很穩。朕批完一卷竹簡，才發覺茶已涼了，便叫人重新溫過。你若知道，想必又要說，冷了的何止是茶。朕記得你的話，今日按時用了膳，也未將所有事拖至深夜。只是擱下筆後，殿裡比往常靜些，才想寫幾句問你。你自己的飯可有好好吃？替旁人操心之前，先看看自己是否也累了。不必每回都笑著說無妨。朕既能聽你勸，也願聽你說一日裡那些不甚順心的小事。",
    replies: [
      {
        id: "A",
        tone: "溫柔關懷",
        text: "陛下肯歇一歇，我就放心了。我也會記得吃飯。",
        response: "那便說定，各自用膳，誰也不許只勸旁人。朕今日的茶尚溫著，你不必再掛心。",
      },
      {
        id: "B",
        tone: "俏皮曖昧",
        text: "連陛下都聽勸了，我這封回信是不是該得個好評？",
        response: "好評？你又帶了個新詞來。若是問朕可願再看你的信，答案是願意。",
      },
      {
        id: "C",
        tone: "真誠直白",
        text: "其實今日有些累。能和陛下說這些小事，我很高興。",
        response: "累了便歇，不必急著把來龍去脈都說清。朕在看，你寫得慢些也無妨。",
      },
    ],
    closer: "燈尚未熄，朕也該歇了。你亦如此。",
  },
  {
    id: "qin-3",
    character: "qin",
    tier: "情深",
    title: "山河之外，見字如晤",
    afterVolume: 10,
    body: "青川水畔一別，宮道仍舊，風過時卻少了一個人的腳步聲。朕今日有好好用膳，也沒有熬夜，原想這些小事不值落筆，寫下來才知，竟是想說給你聽。窗邊的燈白日熄去，入夜再點，並非催你循光歸來，只是留一處讓朕安靜想起你。朕不問歸期，也不願你為一句未定的承諾停步。到了新的地方，先護好自己。若有好景，便替自己多看一眼；若偶爾想起秦宮，也願你記起的不只有離別，還有曾在這裡笑過的時候。",
    replies: [
      {
        id: "A",
        tone: "溫柔關懷",
        text: "知道陛下過得好，我很安心。也請替自己多留些歇息的時辰。",
        response: "朕記下了。你不在身旁，叮囑卻仍一字不漏。朕會照做，不只為讓你安心，也為朕自己。",
      },
      {
        id: "B",
        tone: "俏皮曖昧",
        text: "我有記得笑。陛下也要多笑些，下封信可要寫來給我看。",
        response: "笑如何寫給你看？……罷了。朕讀到這一行時，確實笑了。這樣答，你可滿意？",
      },
      {
        id: "C",
        tone: "真誠直白",
        text: "我很想念陛下。但我會往前走，也好好照顧自己。",
        response:
          "朕亦想你。往前走吧，不必因想念而愧疚。朕珍重的，從來也包括你走自己的路時的模樣。",
      },
    ],
    closer: "山河各有晨昏。見字，願你平安。",
  },
  ...EXTRA_LETTERS,
];
/** Letters the player has actually received — unsent ones stay off the list. */
export function arrivedLetters(progress: LetterProgress): Letter[] {
  return LETTERS.filter((letter) => letterUnlocked(letter, progress));
}

/** Characters who have sent at least one letter the player can open. */
export function letterSenders(progress: LetterProgress): string[] {
  return [...new Set(arrivedLetters(progress).map((letter) => letter.character))];
}

export function letterUnlocked(letter: Letter, progress: LetterProgress): boolean {
  const read =
    letter.afterChapter === 2
      ? progress.mainStoryHanRead
      : letter.afterChapter === 3
        ? progress.mainStoryWuRead
        : letter.afterChapter === 4
          ? progress.mainStoryQiRead
          : letter.afterChapter === 5
            ? progress.mainStoryTangRead
            : progress.mainStoryRead;
  return (
    (progress.owned[letter.character] ?? 0) > 0 &&
    (!letter.afterVolume || (read ?? []).includes(letter.afterVolume))
  );
}
export function letterCondition(letter: Letter): string {
  const character =
    { qin: "秦始皇", liuche: "劉徹", zhouyu: "周瑜", lanling: "蘭陵王", libai: "李白" }[
      letter.character
    ] ?? letter.character;
  const chapter = {
    qin: "秦朝篇",
    liuche: "西漢篇",
    zhouyu: "三國篇",
    lanling: "北齊篇",
    libai: "唐朝篇",
  }[letter.character];
  return letter.afterVolume
    ? `擁有${character}，並讀完${chapter}卷${letter.afterVolume}`
    : `擁有${character}後解鎖`;
}
export function cleanLetters(raw: unknown): LetterSave {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: LetterSave = {};
  for (const letter of LETTERS) {
    const item = (raw as Record<string, unknown>)[letter.id];
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const choice =
      row.choice === "A" || row.choice === "B" || row.choice === "C" ? row.choice : undefined;
    result[letter.id] = {
      read: row.read === true || !!choice,
      choice,
      completed: !!choice && row.completed === true,
      rewardClaimed: row.rewardClaimed === true || (!!choice && row.completed === true),
    };
  }
  return result;
}
/** One transition commits choice and payment marker together. Rereads cannot change choice. */
export function completeLetter(
  letters: LetterSave,
  letter: Letter,
  choice: LetterChoice,
  progress: LetterProgress,
): { letters: LetterSave; reward: number } {
  if (
    !letterUnlocked(letter, progress) ||
    letters[letter.id]?.completed ||
    letters[letter.id]?.choice ||
    !letter.replies.some((r) => r.id === choice)
  )
    return { letters, reward: 0 };
  return {
    letters: {
      ...letters,
      [letter.id]: { read: true, choice, completed: true, rewardClaimed: true },
    },
    reward: letters[letter.id]?.rewardClaimed ? 0 : LETTER_REWARD,
  };
}

/** Preserve paid ledgers and original completed choices when adopting an older cloud snapshot. */
export function mergeLetterSaves(current: unknown, incoming: unknown): LetterSave {
  const a = cleanLetters(current),
    b = cleanLetters(incoming);
  const out: LetterSave = { ...a };
  for (const letter of LETTERS) {
    const local = a[letter.id],
      remote = b[letter.id];
    if (!remote) continue;
    const preferred = local?.completed || local?.choice ? local : remote;
    out[letter.id] = {
      ...preferred,
      read: !!local?.read || remote.read,
      rewardClaimed: !!local?.rewardClaimed || remote.rewardClaimed,
    };
  }
  return out;
}
