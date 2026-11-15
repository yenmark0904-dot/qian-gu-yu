import { useCallback, useEffect, useRef, useState } from "react";
import { CHARACTERS, BY_ID } from "@/game/data";
import { COMPANION_ART, companionArtCandidates } from "@/game/companion-art";
import { COMPANION_LINES } from "@/game/companion-lines";
import {
  companionTier,
  newRound,
  nextInteraction,
  resolveCompanion,
  SLOT_LABELS,
  timeSlot,
} from "@/game/companion";
import { bondLevel } from "@/game/bond";
import { useSave } from "@/game/store";

export function CompanionArt({ id, name }: { id: string; name: string }) {
  const candidates = companionArtCandidates(COMPANION_ART[id]?.companionImage);
  const [failed, setFailed] = useState<string[]>([]);
  const art = candidates.find((a) => !failed.includes(a.src));
  return art ? (
    <img
      className={`companion-image companion-image-${art.kind}`}
      src={art.src}
      alt={name}
      width="720"
      height="1080"
      decoding="async"
      onError={() => setFailed((s) => [...s, art.src])}
    />
  ) : (
    <div className="companion-silhouette" role="img" aria-label={`${name}・墨影待繪`}>
      <span>墨影待繪</span>
    </div>
  );
}

export function CompanionPicker({ onClose }: { onClose: () => void }) {
  const owned = useSave((s) => s.owned);
  const current = useSave((s) => s.companionId);
  const [era, setEra] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState("all");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab") return;
      const nodes = root.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input, select",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);
  const rows = CHARACTERS.filter(
    (c) =>
      (era === "all" || c.era === era) &&
      (rarity === "all" || c.rarity === rarity) &&
      c.name.includes(query.trim()) &&
      (ownership === "all" || (ownership === "owned") === !!resolveCompanion(c.id, owned)),
  );
  return (
    <div
      ref={root}
      className="companion-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="companion-picker-title"
      data-testid="companion-picker"
    >
      <header>
        <div>
          <p className="ui-eyebrow">不費墨玉・隨時更換</p>
          <h2 id="companion-picker-title">朝夕相伴</h2>
        </div>
        <button className="ui-quiet" onClick={onClose}>
          返回首頁
        </button>
      </header>
      <div className="companion-filters">
        <label>
          姓名
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋角色姓名"
          />
        </label>
        <label>
          朝代
          <select value={era} onChange={(e) => setEra(e.target.value)}>
            <option value="all">全部朝代</option>
            {[...new Set(CHARACTERS.map((c) => c.era))].map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label>
          稀有度
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="all">全部稀有度</option>
            {["SSR", "SS", "S", "R"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          持有
          <select value={ownership} onChange={(e) => setOwnership(e.target.value)}>
            <option value="all">全部角色</option>
            <option value="owned">已擁有</option>
            <option value="locked">未擁有</option>
          </select>
        </label>
      </div>
      <p className="companion-count" role="status">
        共 {rows.length} 位 · 目前：{current && BY_ID[current] ? BY_ID[current].name : "尚未選擇"}
      </p>
      <div className="companion-list">
        {rows.map((c) => {
          const has = !!resolveCompanion(c.id, owned);
          const selected = current === c.id && has;
          return (
            <article key={c.id} className="companion-row" data-current={selected}>
              <img
                src={COMPANION_ART[c.id]?.companionImage.thumbnail ?? ""}
                width="48"
                height="72"
                loading="lazy"
                decoding="async"
                alt=""
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div>
                <h3>{c.name}</h3>
                <p>
                  {c.era} · {c.rarity} · {has ? `緣分 ${bondLevel(owned[c.id])} 階` : "尚未相逢"}
                </p>
              </div>
              <button
                className="ui-quiet"
                disabled={!has || selected}
                aria-label={`${selected ? "目前陪伴" : has ? "選擇" : "未擁有"}・${c.name}`}
                onClick={() => {
                  if (useSave.getState().setCompanionId(c.id)) onClose();
                }}
              >
                {selected ? "陪伴中" : has ? "設為陪伴" : "未擁有"}
              </button>
            </article>
          );
        })}
        {!rows.length && <p>此篩選下尚無角色，試試其他條件吧。</p>}
      </div>
    </div>
  );
}

export function CompanionHero({
  onLetters,
  onCodex,
  onSummon,
}: {
  onLetters: (id: string) => void;
  onCodex: (id: string) => void;
  onSummon: () => void;
}) {
  const owned = useSave((s) => s.owned);
  const saved = useSave((s) => s.companionId);
  const guide = useSave((s) => s.companionGuideDone);
  const id = resolveCompanion(saved, owned);
  const c = id ? BY_ID[id] : null;
  const [picker, setPicker] = useState(false);
  const closePicker = useCallback(() => setPicker(false), []);
  const [slot, setSlot] = useState<ReturnType<typeof timeSlot> | null>(null);
  const [dialogue, setDialogue] = useState<string | null>(null);
  const [reaction, setReaction] = useState(0);
  const round = useRef(newRound());
  useEffect(() => {
    const update = () => setSlot(timeSlot());
    update();
    const t = window.setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    round.current = newRound();
    setDialogue(null);
  }, [id, slot]);
  useEffect(() => {
    if (saved && !id) useSave.getState().setCompanionId(null);
  }, [saved, id]);
  const hasOwned = CHARACTERS.some((ch) => !!resolveCompanion(ch.id, owned));
  return (
    <section
      className="companion-hero"
      aria-label="朝夕相伴"
      data-testid="companion-hero"
      data-era={c?.era}
    >
      <div className="companion-title">
        <p className="ui-eyebrow">朝夕相伴 · {slot ? SLOT_LABELS[slot] : "靜候晨昏"}</p>
      </div>
      {c && id ? (
        <>
          <button
            className="companion-stage"
            aria-label={`與${c.name}說話`}
            data-testid="companion-art"
            onClick={() => {
              const next = nextInteraction(
                id,
                owned[id],
                slot ?? timeSlot(),
                round.current,
                performance.now(),
              );
              round.current = next.round;
              setDialogue(next.text);
              setReaction((n) => n + 1);
            }}
          >
            <div
              className={reaction ? (reaction % 2 ? "companion-react" : "companion-react-alt") : ""}
            >
              <CompanionArt key={id} id={id} name={c.name} />
            </div>
            <span className="companion-tap-hint">輕觸，聽他說話</span>
          </button>
          <div className="companion-court">
            <div className="companion-meta">
              <div>
                <h1>{c.name}</h1>
                <p>
                  {c.era} · {c.rarity} · {c.epithet}
                </p>
              </div>
              <span>
                緣分 {bondLevel(owned[id])} · {companionTier(owned[id])}
              </span>
            </div>
            <div className="companion-dialogue" role="status" aria-live="polite" aria-atomic="true">
              <div key={`${id}-${reaction}-${slot}`}>
                <strong>{c.name}</strong>
                <p>{dialogue ?? (slot ? COMPANION_LINES[id][slot] : "晨昏流轉，片刻相伴。")}</p>
              </div>
            </div>
            <div className="companion-actions">
              <button className="ui-quiet" onClick={() => onCodex(id)}>
                角色圖鑑
              </button>
              <button
                className="ui-quiet"
                data-testid="companion-letters"
                onClick={() => onLetters(id)}
              >
                書信
              </button>
              <button
                className="ui-quiet"
                data-testid="companion-switch"
                aria-label="更換陪伴・切換角色"
                onClick={() => setPicker(true)}
              >
                更換陪伴
              </button>
            </div>
          </div>
        </>
      ) : (
        <div
          className="companion-empty"
          data-testid={hasOwned ? "companion-empty-owned" : "companion-empty-none"}
        >
          <div className="companion-empty-panel">
            <div className="companion-empty-moon" aria-hidden="true">
              遇
            </div>
            <h1>{hasOwned ? "選一人，共度朝夕" : "一席清風，靜候相逢"}</h1>
            <p>
              {hasOwned
                ? guide
                  ? "陪伴席位尚空，選一位熟悉的人吧。"
                  : "初次相伴：從已擁有的角色中選一位。隨時可換，不費墨玉。"
                : "緣分未至，宮燈仍為你長明。待與他初逢，千古故事便由此展開。"}
            </p>
            {hasOwned ? (
              <button
                className="ui-primary"
                data-testid="companion-choose"
                onClick={() => setPicker(true)}
              >
                選擇陪伴
              </button>
            ) : (
              <button className="ui-primary" data-testid="companion-go-summon" onClick={onSummon}>
                前往召喚
              </button>
            )}
          </div>
        </div>
      )}
      {picker && <CompanionPicker onClose={closePicker} />}
    </section>
  );
}
