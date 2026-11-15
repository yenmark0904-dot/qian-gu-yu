import { QuickEquipSlot } from "./QuickEquip";
import { BondStoryVN } from "./BondStoryVN";
import { useEffect, useState } from "react";
import { Check, Lock, Maximize2, Volume2, X } from "lucide-react";
import { BondPips, MoHen, Portrait, RarityMark, SkinnedCard, Spoken, cn } from "@/components/game/bits";
import { CHARACTERS, LOVE_FUTURE_NOTE, RARITY_META, RARITY_ORDER, destinyBook, type Character, type Rarity } from "@/game/data";
import { RANK, bondName } from "@/game/logic";
import {
  CG_TIER,
  LOVE_TIER,
  MARK_OVERFLOW,
  SKINS,
  bondLevel,
  bondProgress,
  chapterList,
  hasExclusiveCg,
  shownSkin,
  skinUnlocked,
  tierRequirement,
  type ChapterView,
} from "@/game/bond";
import { progressCopy, rewardRows } from "@/game/bond-feedback";
import { STEP_NAMES, STEP_TIERS, describeFx, skillOf, skillStep } from "@/game/skills";
import { STORIES_EXTRA, extraChapter } from "@/game/stories-extra";
import { useSave } from "@/game/store";
import { AdultGate } from "@/components/game/AdultGate";
import { playVoice, stopVoice, voiceSrc, type VoiceClip } from "@/game/audio";
import { hasVoice } from "@/game/voice-ja";
import { adultConfirmed, confirmAdult, isExplicit, needsAdultGate, resetAdult } from "@/game/adult-gate";

const FILTERS: Array<Rarity | "ALL"> = ["ALL", ...RARITY_ORDER];

export function Codex({
  onReplay,
  focusId,
  onFocused,
}: {
  onReplay: (character: Character) => void;
  /** Open this character's sheet right away (from the 召喚結果 rank-up entry). */
  focusId?: string | null;
  onFocused?: () => void;
}) {
  const owned = useSave((s) => s.owned);
  const [filter, setFilter] = useState<Rarity | "ALL">("ALL");
  const [open, setOpen] = useState<Character | null>(() => (focusId ? CHARACTERS.find((c) => c.id === focusId) ?? null : null));
  useEffect(() => {
    if (!focusId) return;
    const c = CHARACTERS.find((x) => x.id === focusId);
    if (c) setOpen(c);
    onFocused?.();
  }, [focusId, onFocused]);
  const [view, setView] = useState<"cards" | "owned">("cards");
  const met = CHARACTERS.filter((c) => (owned[c.id] ?? 0) > 0).length;
  const list = CHARACTERS.filter((c) => filter === "ALL" || c.rarity === filter).slice().sort((a, b) => {
    const byRank = RANK[b.rarity] - RANK[a.rarity];
    if (byRank !== 0) return byRank;
    return a.name.localeCompare(b.name, "zh-Hant");
  });

  return (
    <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-muted">
            {view === "owned" ? "已擁有" : "已遇"} {met} / {CHARACTERS.length}
          </p>
          <div className="owned-switch flex shrink-0 rounded-full border border-line p-0.5" role="tablist" aria-label="圖鑑檢視">
            {(["cards", "owned"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                data-testid={`codex-view-${v}`}
                className={cn("min-h-9 rounded-full px-3.5 text-sm", view === v ? "bg-gold text-bg" : "text-fg")}
                onClick={() => setView(v)}
              >
                {v === "cards" ? "卡牌" : "已擁有"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-3">
          {FILTERS.map((item) => {
            const active = item === filter;
            const label = item === "ALL" ? "全部" : RARITY_META[item].label;
            return (
              <button
                key={item}
                type="button"
                className={cn(
                  "min-h-11 shrink-0 rounded-full px-4 text-sm",
                  active ? "bg-gold text-bg" : "border border-line text-fg",
                )}
                onClick={() => setFilter(item)}
              >
                {label}
              </button>
            );
          })}
        </div>
        {view === "owned" ? <OwnedTable owned={owned} filter={filter} onOpen={setOpen} /> : null}
        <div className={cn("grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6", view === "owned" && "hidden")}>
          {list.map((character) => {
            const count = owned[character.id] ?? 0;
            return (
              <button key={character.id} type="button" className="text-left" onClick={() => setOpen(character)}>
                <SkinnedCard character={character} count={count} skin={count > 0 ? undefined : "base"}>
                  <Portrait
                    id={character.id}
                    name={character.name}
                    className={cn("aspect-card w-full object-contain object-center", count === 0 && "opacity-40")}
                  />
                  <div className="absolute left-1.5 top-1.5">
                    <RarityMark rarity={character.rarity} />
                  </div>
                  {count > 1 ? (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-bg/80 px-1.5 text-xs tabular-nums text-gold">
                      ×{count}
                    </span>
                  ) : null}
                  {count > 0 ? (
                    <span className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/70 to-transparent pb-1 pt-3">
                      <BondPips level={bondLevel(count)} />
                    </span>
                  ) : null}
                </SkinnedCard>
                <p className="mt-1 truncate text-sm text-fg">{character.name}</p>
                <p className="truncate text-xs text-muted">{count > 0 ? `${bondName(count)} · ${bondLevel(count)}階` : "未逢"}</p>
              </button>
            );
          })}
        </div>
      </div>
      {open ? <Detail character={open} count={owned[open.id] ?? 0} onClose={() => setOpen(null)} onReplay={onReplay} /> : null}
    </div>
  );
}

type OwnedSort = "rarity" | "bond" | "count" | "name";
const OWNED_SORTS: { id: OwnedSort; label: string }[] = [
  { id: "rarity", label: "稀有度" },
  { id: "bond", label: "緣分" },
  { id: "count", label: "張數" },
  { id: "name", label: "名字" },
];

/** 已擁有: every owned card as a table row (portrait, name, rarity, 緣分階, copies, unlocked card faces). Tap a row for its detail. */
function OwnedTable({
  owned,
  filter,
  onOpen,
}: {
  owned: Record<string, number>;
  filter: Rarity | "ALL";
  onOpen: (character: Character) => void;
}) {
  const [sort, setSort] = useState<OwnedSort>("rarity");
  const byName = (a: Character, b: Character) => a.name.localeCompare(b.name, "zh-Hant");
  const byRank = (a: Character, b: Character) => RANK[b.rarity] - RANK[a.rarity];
  const rows = CHARACTERS.filter((c) => (owned[c.id] ?? 0) > 0 && (filter === "ALL" || c.rarity === filter))
    .slice()
    .sort((a, b) => {
      const ca = owned[a.id] ?? 0;
      const cb = owned[b.id] ?? 0;
      if (sort === "bond") return bondLevel(cb) - bondLevel(ca) || cb - ca || byRank(a, b) || byName(a, b);
      if (sort === "count") return cb - ca || byRank(a, b) || byName(a, b);
      if (sort === "name") return byName(a, b);
      return byRank(a, b) || bondLevel(cb) - bondLevel(ca) || cb - ca || byName(a, b);
    });
  const groups = sort === "rarity" ? [...RARITY_ORDER].reverse().map((r) => ({ rarity: r as Rarity | null, rows: rows.filter((c) => c.rarity === r) })).filter((g) => g.rows.length) : [{ rarity: null, rows }];
  return (
    <div data-testid="owned-table">
      <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="shrink-0 text-muted">排序</span>
        {OWNED_SORTS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={sort === o.id}
            className={cn("min-h-9 shrink-0 rounded-full px-3", sort === o.id ? "border border-gold text-gold" : "border border-line text-muted")}
            onClick={() => setSort(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="owned-empty rounded-xl px-4 py-8 text-center text-sm text-muted">{filter === "ALL" ? "尚未擁有任何卡片，去抽卡結緣吧。" : "這個稀有度還沒有擁有的卡片。"}</p>
      ) : (
        <table className="owned-table w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col">角色</th>
              <th scope="col" className="text-center">稀有</th>
              <th scope="col">緣分</th>
              <th scope="col" className="text-right">張數</th>
              <th scope="col" className="text-center">卡面</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.rarity ?? "all"}>
              {g.rarity ? (
                <tr className="owned-group">
                  <th colSpan={5} scope="rowgroup">
                    {RARITY_META[g.rarity].label} · {RARITY_META[g.rarity].epithet}
                    <span className="ml-2 tabular-nums text-muted">{g.rows.length}</span>
                  </th>
                </tr>
              ) : null}
              {g.rows.map((c) => {
                const count = owned[c.id] ?? 0;
                const level = bondLevel(count);
                const faces = SKINS.filter((sk) => skinUnlocked(sk.id, count));
                return (
                  <tr key={c.id} className="owned-row" data-id={c.id} tabIndex={0} role="button" aria-label={`${c.name}，${c.rarity}，${bondName(count)}${level}階，${count}張`} onClick={() => onOpen(c)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(c); } }}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className={cn("owned-thumb shrink-0 overflow-hidden rounded-md", `owned-thumb-${c.rarity}`)}>
                          <Portrait id={c.id} name={c.name} className="h-full w-full object-cover object-top" />
                        </span>
                        <span className="min-w-0 truncate font-medium text-fg">{c.name}</span>
                      </span>
                    </td>
                    <td className="text-center">
                      <span className={cn("owned-rarity", `rarity-pill-${c.rarity}`)}>{RARITY_META[c.rarity].label}</span>
                    </td>
                    <td>
                      <span className="block whitespace-nowrap text-xs text-fg">
                        {bondName(count)} · {level}階
                      </span>
                      <BondPips level={level} className="mt-0.5" />
                    </td>
                    <td className="text-right tabular-nums text-gold">×{count}</td>
                    <td className="text-center tabular-nums text-xs text-muted" title={faces.map((f) => f.name).join("、")}>
                      {faces.length}/{SKINS.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      )}
      <p className="mt-2 text-[0.7rem] text-muted">卡面：本相、金絲（2階）、墨染（4階）、定情（6階）。點一列看詳情。</p>
    </div>
  );
}

const NUM = ["零", "一", "二", "三", "四", "五", "六"];

function Detail({
  character,
  count,
  onClose,
  onReplay,
}: {
  character: Character;
  count: number;
  onClose: () => void;
  onReplay: (character: Character) => void;
}) {
  const special = character.rarity === "SS" || character.rarity === "SSR";
  const book = destinyBook(character);
  const owned = count > 0;
  const level = bondLevel(count);
  const progress = bondProgress(count);
  const extra = STORIES_EXTRA[character.id];
  const chapters = chapterList(character, count, extraChapter, book?.text ?? null);
  const [reading, setReading] = useState<number | null>(null);
  // 18+ gate: the chapter index waiting for confirmation (its text is not rendered meanwhile)
  const [gateFor, setGateFor] = useState<number | null>(null);
  const [adultOk, setAdultOk] = useState(false);
  useEffect(() => setAdultOk(adultConfirmed()), []);
  const openChapter = (ch: ChapterView) => {
    if (reading === ch.index) return setReading(null);
    if (ch.state === "open" && needsAdultGate(character.rarity, ch.index)) return setGateFor(ch.index);
    setReading(ch.index);
  };
  const [viewCg, setViewCg] = useState(false);
  const [cgPending, setCgPending] = useState(false);
  const chosen = useSave((s) => s.skins[character.id]);
  const setSkin = useSave((s) => s.setSkin);
  const assist = useSave((s) => s.assist);
  const setAssist = useSave((s) => s.setAssist);
  const skin = shownSkin(count, chosen);
  const skill = skillOf(character.id);
  const step = skillStep(count);
  const open = chapters.find((c) => c.index === reading && c.state !== "locked") ?? null;
  // 修行簿 · 情牽一念: an owned character's sheet shows their unlocked 情話; opening an unlocked
  // 專屬物語 / 天命書 chapter counts too. Rereads count (at most once per quest per day by the tracker).
  useEffect(() => {
    if (owned) useSave.getState().questEvent("CHARACTER_STORY_READ");
  }, [owned, character.id]);
  useEffect(() => {
    if (open?.state === "open") useSave.getState().questEvent("CHARACTER_STORY_READ");
  }, [open?.state, open?.index]);
  const cgPath = extra?.cg?.trim() ?? "";
  const cgUnlocked = hasExclusiveCg(character.rarity) && owned && level >= CG_TIER;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (gateFor !== null || open?.state === "open") return;
      if (cgPending) { setCgPending(false); return; }
      if (viewCg) setViewCg(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, viewCg, gateFor, open?.state, cgPending]);

  const muted = useSave((s) => s.muted);
  const voiced = hasVoice(character.rarity);
  useEffect(() => () => stopVoice(), []);
  /** Japanese voice of a love line — SSR/SS only, and only where the line itself is shown. */
  const voiceButton = (clip: VoiceClip, label: string) =>
    voiced && voiceSrc(character.id, clip) ? (
      <button
        type="button"
        data-testid={`voice-${clip}`}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-gold hover:bg-white/5 disabled:opacity-40"
        aria-label={`播放${label}（日語）`}
        title={muted ? "已靜音" : `播放${label}（日語）`}
        disabled={muted}
        onClick={(event) => {
          event.stopPropagation();
          playVoice(character.id, "", muted, clip);
        }}
      >
        <Volume2 className="h-4 w-4" aria-hidden />
      </button>
    ) : null;
  const lineSlot = (label: string, tier: number, text: string | undefined, clip?: VoiceClip) => {
    const unlocked = owned && level >= tier;
    return (
      <div className="bond-line rounded-lg px-3 py-2" data-state={unlocked ? (text?.trim() ? "open" : "empty") : "locked"}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[0.65rem] tracking-[0.25em] text-muted">{label}</p>
          {unlocked && text?.trim() && clip ? voiceButton(clip, label) : null}
        </div>
        {unlocked ? (
          text?.trim() ? (
            <p className="mt-0.5 text-sm text-fg">「{text}」</p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">待你撰寫</p>
          )
        ) : (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <Lock className="h-3 w-3" aria-hidden /> {tierRequirement(tier)}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="codex-scrim fixed inset-0 z-30 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div
        className="sheet safe-bottom w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={character.name}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 整張卡圖在最上面（不裁切），下面才是技能與緣分幾階，再來是情話與物語 */}
        <div className="relative">
          <div className="codex-hero mx-auto w-full" data-testid="codex-hero">
            <SkinnedCard character={character} count={count} skin={owned ? skin : "base"}>
              <Portrait id={character.id} name={character.name} className={cn("aspect-card w-full object-contain object-center", !owned && "opacity-40")} />
            </SkinnedCard>
          </div>
          <button type="button" className="codex-close absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-fg" aria-label="關閉" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3">
          <RarityMark rarity={character.rarity} />
          <h2 className="mt-2 font-serif text-3xl">{character.name}</h2>
          <p className="text-sm text-muted">
            {character.era} · {character.epithet}
            {character.courtesy ? ` · 字${character.courtesy}` : ""}
          </p>
        </div>
        <section className="mt-3" data-testid="character-equipment"><h3 className="mb-2 text-xs text-gold">命器</h3><QuickEquipSlot charId={character.id} /></section>
        {skill ? (
          <section className="bond-skill mt-3 rounded-xl p-3" data-testid="codex-skill">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm">
                <span className="text-[0.65rem] tracking-[0.3em] text-muted">三消助陣 </span>
                <span className="font-serif text-gold">「{skill.name}」</span>
              </p>
              {owned ? (
                <button
                  type="button"
                  className={cn("bond-chip rounded-full px-3 py-1 text-xs", assist === character.id && "on")}
                  onClick={() => setAssist(assist === character.id ? null : character.id)}
                  data-testid="codex-pin-assist"
                  title={assist === character.id ? "再點一次取消固定，改回純自動配對" : "自動配對三人戰隊時優先帶他，直到取消"}
                >
                  {assist === character.id ? "📌 固定中 · 取消" : "固定助陣"}
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted">{skill.flavor}</p>
            <ul className="mt-2 space-y-1 text-xs">
              {skill.steps.map((fx, i) => (
                <li key={i} className={cn("flex gap-2", owned && i === step ? "text-gold" : "text-fg/70")}>
                  <span className="w-14 shrink-0">
                    {STEP_NAMES[i]} · {NUM[STEP_TIERS[i]]}階
                  </span>
                  <span>{describeFx(fx)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {owned ? (
          <section className="bond-panel mt-3 rounded-xl p-3" data-testid="bond-panel" data-level={level}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-serif text-lg text-gold">
                緣分 · {bondName(count)} <span className="text-sm text-fg/80">{NUM[level]}階</span>
              </p>
              <BondPips level={level} />
            </div>
            <div className="bond-bar mt-2 h-1.5 overflow-hidden rounded-full">
              <span style={{ width: `${progress.max ? 100 : (progress.have / progress.need) * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {progress.max ? (
                <span className="inline-flex items-center gap-1">
                  緣分已圓滿 · 之後每張化為墨痕 <MoHen /> ×{MARK_OVERFLOW[character.rarity]}
                </span>
              ) : (
                `持有 ×${count} · ${progressCopy(count)}`
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="卡面">
              {SKINS.map((s) => {
                const ok = skinUnlocked(s.id, count);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={skin === s.id}
                    disabled={!ok}
                    className={cn("bond-chip rounded-full px-3 py-1 text-xs", skin === s.id && "on", !ok && "locked")}
                    onClick={() => setSkin(character.id, s.id)}
                    title={ok ? s.name : tierRequirement(s.tier)}
                  >
                    {ok ? s.name : `${s.name} · ${NUM[s.tier]}階`}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
        <p className="mt-4 text-sm text-muted">
          {character.verseFrom} · {character.verse}
        </p>


        {owned ? (
          <div className="mt-3">
            <div className="flex items-start justify-between gap-2">
              <Spoken character={character} />
              {voiceButton("line", "情話 · 其一")}
            </div>
            <div className="mt-3 grid gap-2">
              {lineSlot("情話 · 其二", LOVE_TIER[character.rarity], extra?.love, "love")}
            </div>
            {character.scene ? <p className="mt-3 text-sm leading-relaxed text-fg">{character.scene}</p> : null}
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Lock className="h-4 w-4" aria-hidden />
            尚未對你開口。召喚之後，他才會把那句話說給你。
          </p>
        )}


        <section className="mt-4" data-testid="codex-chapters">
          <h3 className="text-xs tracking-[0.3em] text-muted">《{chapters[0]?.label ?? "專屬物語"}》</h3>
          <p className="mt-1 text-[0.7rem] tracking-[0.16em] text-muted">{LOVE_FUTURE_NOTE}</p>
          <div className="mt-2 grid gap-2">
            {chapters.map((ch) => (
              <ChapterRow key={ch.index} ch={ch} active={reading === ch.index} onOpen={() => openChapter(ch)} />
            ))}
          </div>
          {open?.state === "open" && gateFor === null ? (
            <BondStoryVN id={character.id} index={open.index} title={`${character.name} · ${open.title}`} label={open.label}
              onClose={() => setReading(null)}
              onFinish={() => {
                setReading(null);
                // CG ownership remains tier six, even for SS's final tier-four chapter.
                if (cgUnlocked && open.index === chapters.at(-1)?.index) {
                  if (cgPath) setViewCg(true);
                  else setCgPending(true);
                }
              }} />
          ) : null}
          {isExplicit(character.rarity) && adultOk ? (
            <button
              type="button"
              data-testid="adult-reset"
              className="mt-2 text-[11px] text-muted underline-offset-2 hover:underline"
              onClick={() => {
                resetAdult();
                setAdultOk(false);
                setReading(null);
              }}
            >
              重設 18 歲確認
            </button>
          ) : null}
          {gateFor !== null ? (
            <AdultGate
              onConfirm={() => {
                confirmAdult();
                setAdultOk(true);
                setReading(gateFor);
                setGateFor(null);
              }}
              onDecline={() => {
                setGateFor(null);
                setReading(null);
              }}
            />
          ) : null}
        </section>

        {hasExclusiveCg(character.rarity) ? (
          <section className="mt-4" data-testid="codex-cg">
            <h3 className="text-xs tracking-[0.3em] text-muted">專屬 CG</h3>
            {cgUnlocked ? (
              cgPath ? (
                // Any aspect fits: the image keeps its own shape (portrait or 16:9) inside a dark letterbox; tap = fullscreen.
                <button
                  type="button"
                  className="cg-slot cg-frame relative mt-2 grid min-h-[12rem] w-full place-items-center overflow-hidden rounded-xl"
                  onClick={() => setViewCg(true)}
                  aria-label={`${character.name} 專屬 CG · 輕觸全屏`}
                  data-testid="codex-cg-open"
                >
                  <img
                    src={cgPath}
                    alt={`${character.name} 專屬 CG`}
                    className="block h-auto max-h-[min(62dvh,32rem)] w-auto max-w-full object-contain"
                    decoding="async"
                  />
                  <span className="cg-hint pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] tracking-[0.2em]" aria-hidden>
                    <Maximize2 className="h-3 w-3" /> 輕觸全屏
                  </span>
                </button>
              ) : (
                <div className="cg-slot cg-empty mt-2 grid aspect-video place-items-center rounded-xl">
                  <span className="font-serif tracking-[0.4em]">CG 準備中</span>
                </div>
              )
            ) : (
              <div className="cg-slot cg-locked mt-2 grid aspect-video place-items-center rounded-xl">
                <span className="flex items-center gap-1.5 text-sm">
                  <Lock className="h-4 w-4" aria-hidden /> {tierRequirement(CG_TIER)}
                </span>
              </div>
            )}
          </section>
        ) : null}

        <details className="bond-table mt-4 rounded-xl p-3" open={owned} data-testid="bond-table">
          <summary className="cursor-pointer text-xs tracking-[0.25em] text-muted">緣分階梯 · 每重逢 5 次升一階</summary>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="bond-next bond-next-look rounded-full px-1.5">外觀／故事</span>下一次外觀／故事解鎖
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="bond-next bond-next-skill rounded-full px-1.5">技能</span>下一次技能強化
            </span>
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {rewardRows(character.rarity, count).map((t) => (
              <li
                key={t.tier}
                className={cn("bond-row flex gap-2 rounded-lg px-1.5 py-1", t.reached ? "text-gold" : "text-fg/70", (t.nextLook || t.nextSkill) && "bond-row-next")}
                data-testid={`bond-row-${t.tier}`}
                data-next-look={t.nextLook || undefined}
                data-next-skill={t.nextSkill || undefined}
              >
                <span className="w-[4.5rem] shrink-0 leading-snug">
                  {NUM[t.tier]}階 · {t.name}
                  <span className="block text-[0.65rem] text-muted">×{t.copies}</span>
                </span>
                <span className="flex-1 leading-snug">
                  {t.nextLook || t.nextSkill ? (
                    <span className="mb-0.5 flex flex-wrap gap-1">
                      {t.nextLook ? <span className="bond-next bond-next-look rounded-full px-1.5 text-[0.62rem]">下一次外觀／故事解鎖</span> : null}
                      {t.nextSkill ? <span className="bond-next bond-next-skill rounded-full px-1.5 text-[0.62rem]">下一次技能強化</span> : null}
                    </span>
                  ) : null}
                  {[...t.look, ...t.skill, t.ink].join("、")}
                </span>
                {t.reached ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              </li>
            ))}
          </ul>
        </details>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" className="min-h-11 rounded-xl border border-line" onClick={onClose}>
            關閉
          </button>
          {special ? (
            <button
              type="button"
              className="min-h-11 rounded-xl bg-gold text-bg"
              onClick={() => {
                onClose();
                onReplay(character);
              }}
            >
              {character.rarity === "SSR" ? "看天命演出" : "看星輝演出"}
            </button>
          ) : (
            <button type="button" className="min-h-11 rounded-xl border border-line text-muted" disabled>
              普通相逢
            </button>
          )}
        </div>
      </div>
      {cgPending && cgUnlocked ? (
        <div className="cg-viewer fixed inset-0 z-50 grid place-items-center p-6" role="dialog" aria-label="CG 準備中" onClick={(event) => { event.stopPropagation(); setCgPending(false); }}>
          <div className="cloud-sheet rounded-xl p-6 text-center"><p className="font-serif tracking-widest">CG 準備中</p><button type="button" className="mt-4 min-h-11 text-gold" onClick={() => setCgPending(false)}>返回章節</button></div>
        </div>
      ) : null}
      {viewCg && cgUnlocked && cgPath ? (
        <div
          className="cg-viewer fixed inset-0 z-50 grid place-items-center p-3"
          role="dialog"
          aria-label={`${character.name} 專屬 CG`}
          onClick={(e) => {
            e.stopPropagation();
            setViewCg(false);
          }}
        >
          <img
            src={cgPath}
            alt={`${character.name} 專屬 CG`}
            className="block h-auto max-h-[calc(100dvh-1.5rem)] w-auto max-w-[calc(100vw-1.5rem)] rounded-lg object-contain"
            data-testid="codex-cg-full"
          />
          <button type="button" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-fg" aria-label="關閉">
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ChapterRow({ ch, active, onOpen }: { ch: ChapterView; active: boolean; onOpen: () => void }) {
  if (ch.state === "locked") {
    return (
      <div className="chapter-row locked flex items-center justify-between rounded-lg px-3 py-2" data-state="locked">
        <span className="font-serif text-sm text-fg/60">{ch.title}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <Lock className="h-3 w-3" aria-hidden /> {ch.requirement}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn("chapter-row flex w-full items-center justify-between rounded-lg px-3 py-2 text-left", active && "on")}
      data-state={ch.state}
      onClick={onOpen}
    >
      <span className="font-serif text-sm">{ch.title}</span>
      <span className="text-xs text-muted">{ch.state === "empty" ? "待你撰寫" : active ? "收起" : "展讀"}</span>
    </button>
  );
}
