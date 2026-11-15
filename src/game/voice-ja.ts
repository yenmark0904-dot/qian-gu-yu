/**
 * Retained Japanese 情話 text for restoration. Chinese-trial mp3s now live in public/voice/; original Japanese audio is backed up in /workspace/bak/voice-ja-mp3/.
 * S and R are silent (no mp3, no speech fallback, no play buttons).
 *   VOICE_JA      — 情話・其一 (data.ts `line`): public/voice/<id>.mp3 (助陣 cut-in) and the
 *                   identical public/voice/<id>-line.mp3 (codex, shown once owned).
 *                   Source: /workspace/stories/voice_ja.json
 *   VOICE_LOVE_JA — 情話・其二 (stories-extra `love`): public/voice/<id>-love.mp3 (codex, 緣分三階 = LOVE_TIER).
 *                   Source: /workspace/stories/voice_love_ja.json
 * On-screen text stays Chinese; these strings only feed the speech-synthesis fallback.
 */
import type { Rarity } from "./data.ts";

export const VOICED_RARITIES: readonly Rarity[] = ["SSR", "SS"];

/** Does a character of this rarity have any human voice audio? */
export const hasVoice = (rarity: Rarity): boolean => VOICED_RARITIES.includes(rarity);

export const VOICE_JA: Record<string, string> = {
  qin: "天下はすべて朕の掌中にある。ただ、そなただけは……朕を、そばに留まりたいと思わせる。",
  zhouyu: "琴の音がどれほど美しくとも、そなたが近づいたときの息遣いには及ばない。",
  lanling: "長年、この素顔は仮面の下に隠してきた。だが、そなたに見せた今は、もう何ひとつ、そなたに隠しておきたくはない。",
  libai: "今宵は月が美しい。詩仙などやめて、君だけの風来坊になりたい。酒は人を酔わせない。君が来て、僕を酔わせてくれ。",
  liuche: "江山がどれほど広くとも、お前がこの身の下にいる、このひとときには及ばぬ。",
  sima: "鳳よ、鳳よ、故郷へ帰る。四海をめぐりて、その凰を求む。ずいぶん長く探した。僕の凰は、君だったんだ。",
  zhuge: "淡泊もって志を明らかにす。天下に対しては、そうありたい。けれど君には、星の光をすべて、その肩へ集めてあげたくなる。",
  huo: "匈奴いまだ滅びず、なにをもって家をなさん。けれど君に呼ばれて、ふと、帰る場所が欲しくなった。",
  caocao: "天下など、少し待たせておけばよい。この一杯は、そなたと酌み交わしたい。",
  lishimin: "江山は背にある。手を差し伸べて、ただ問おう。こちらへ来てくれるか。",
  nalan: "夜があまりに長い。窓辺の席を君のために空けておいた。月は、一緒に眺めよう。",
  panan: "花が見事に咲いている。ひと枝手折って、君のびんの髪に挿してあげたい。",
  songyu: "賦はいくつも書いてきた。けれど君が来てから、残りの言葉はすべて、君にだけ贈りたくなった。",
  luyou: "墨がまだ乾かない。君の名を書いたところで、筆が止まってしまった。",
  zhaoyun: "一身すべてこれ胆なり。それは敵に向けた言葉だ。君の前では銀の槍を置いて、今夜は寒くないかと尋ねたい。",
};

export const VOICE_LOVE_JA: Record<string, string> = {
  qin: "朕は生涯、誰にも頭を垂れたことはない。ただ、そなたに口づけるときだけは、それすら蜜のように甘い。",
  zhouyu: "弦が乱れたなら、また調べ直せばよい。だが、そなたは私の心を乱した。ならば、そなた自ら、なだめに来てもらおう。",
  lanling: "戦場では、誰ひとり近づけたことはない。それなのにそなたは、まっすぐこの腕の中まで来て、まだ抱きしめ方が足りないと言うのか。",
  libai: "酒は明月に残し、詩は天地に贈ろう。けれど、この口づけだけは、君からもらいたい。",
  liuche: "もう一度、朕を見よ。お前にそんなふうに見つめられては、一度の口づけでは足りぬ。",
  sima: "この曲が、どうして君にはわからないのかな。まあいい、手を貸して。僕の胸にもたれて、もう一度聴いてごらん。",
  zhuge: "万事は、ゆっくり計ればよい。ただ、君に会いたいというこのことだけは、いっこくも待てない。",
  huo: "封侯の褒美は、もう受け取った。君が俺のためにとっておいてくれたあの抱擁は、いつ受け取りに行けばいい？",
  caocao: "私は昔から欲が深い。そなたにひと目見つめられただけで、そなたの一生が欲しくなる。今度ばかりは、隠すつもりもない。",
  lishimin: "朕の襟を、少し直してくれぬか。そなたを、もう少しそばに留めておく口実がほしいのだ。",
  nalan: "まだ、おやすみなんて言わないで。君はまだここにいるのに、僕はもう、君を恋しく思いはじめている。",
  panan: "君がまたそんなふうに見つめるなら、この顔のほうが、先に赤くなってしまうよ。",
  songyu: "人は僕を、言葉に長けていると褒める。けれど君が近づくと、ただひとつ聞きたくなるんだ。口づけても、いいかい？",
  luyou: "君の名は、ゆっくり書きたい。ひと筆は恋しさ。もうひと筆は、君とともに過ごしたい、残りの人生だ。",
  zhaoyun: "俺の腕の中においで。風も雨も、俺が防いでやる。このささやかなわがままを、どうか叶えてほしい。",
};
