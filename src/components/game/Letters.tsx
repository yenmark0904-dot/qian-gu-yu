import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Mail, X } from "lucide-react";
import { Portrait } from "./bits";
import { BY_ID } from "@/game/data";
import {
  LETTERS,
  LETTER_REWARD,
  arrivedLetters,
  letterSenders,
  type Letter,
} from "@/game/letters";
import { useSave } from "@/game/store";

export function Letters({
  onClose,
  initialCharacter,
}: {
  onClose: () => void;
  initialCharacter?: string;
}) {
  const state = useSave();
  const [filter, setFilter] = useState(
    initialCharacter && Object.hasOwn(BY_ID, initialCharacter) ? initialCharacter : "all",
  );
  const [opened, setOpened] = useState<Letter | null>(null);
  const [ready, setReady] = useState(false);
  const [fast, setFast] = useState(false);
  const [notice, setNotice] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (opened) setOpened(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [opened, onClose]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [opened]);
  const record = opened ? state.letters[opened.id] : undefined;
  const selected = opened?.replies.find((r) => r.id === record?.choice);
  const arrived = arrivedLetters(state);
  const senders = letterSenders(state);
  const characters = [
    ...new Set([
      ...senders,
      ...(filter !== "all" && Object.hasOwn(BY_ID, filter) ? [filter] : []),
    ]),
  ];
  const visible = arrived.filter((letter) => filter === "all" || letter.character === filter);
  return (
    <section
      className="ink-overlay letter-screen fixed inset-0 z-40 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="千年書信"
    >
      <header className="journey-header safe-top">
        <button
          className="ui-icon"
          aria-label={opened ? "返回書信列表" : "返回首頁"}
          onClick={() => (opened ? setOpened(null) : onClose())}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="ui-eyebrow">墨線寄來的心事</p>
          <h1>千年書信</h1>
        </div>
        <button className="ui-icon" aria-label="關閉書信" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div ref={scroll} className="journey-scroll letter-scroll">
        {!opened ? (
          <div className="letters-content">
            <div className="letter-intro">
              <Mail size={32} strokeWidth={1} />
              <h2>見字，如晤</h2>
              <p>無法隨意回到的歲月，偶爾循墨線傳來一封信。</p>
              <small>首次完成每封回覆，得 {LETTER_REWARD} 墨玉；重讀不再領取。</small>
            </div>
            <label className="letter-filter">
              朝代・人物
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="朝代與角色篩選"
              >
                <option value="all">全部書信</option>
                {characters.map((id) => (
                  <option key={id} value={id}>
                    {BY_ID[id].era}・{BY_ID[id].name}
                  </option>
                ))}
              </select>
            </label>
            {filter !== "all" && !LETTERS.some((l) => l.character === filter) && (
              <p className="hall-notice" role="status">
                {BY_ID[filter]?.name}的書信尚未收錄。此處沒有可領取的書信獎勵。
              </p>
            )}
            {visible.length === 0 &&
              !(filter !== "all" && !LETTERS.some((l) => l.character === filter)) && (
              <p className="hall-notice" role="status">
                {filter === "all"
                  ? "目前還沒有書信寄達。與他們再相處一段日子，信便會循墨線而來。"
                  : `尚未收到${BY_ID[filter]?.name ?? ""}的來信。`}
              </p>
            )}
            <ul className="letter-list">
              {visible.map((letter) => {
                const who = BY_ID[letter.character];
                const saved = state.letters[letter.id];
                return (
                  <li key={letter.id}>
                    <button
                      className="letter-row"
                      data-testid={`letter-${letter.id}`}
                      onClick={() => {
                        state.readLetter(letter.id);
                        setOpened(letter);
                        setReady(!!saved?.completed);
                        setFast(false);
                        setNotice("");
                      }}
                    >
                      <Portrait id={who.id} name={who.name} className="letter-portrait" />
                      <span>
                        <small>
                          {who.era}・{who.name}　{letter.tier}
                        </small>
                        <strong>{letter.title}</strong>
                        <small>
                          {saved?.completed
                            ? "已回覆 · 可重讀"
                            : saved?.read
                              ? "已讀 · 尚未回覆"
                              : "未讀"}
                        </small>
                      </span>
                      <Mail size={18} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <article className={`letter-paper ${fast ? "letter-fast" : ""}`} key={opened.id}>
            <div className="letter-sender">
              <Portrait
                id={opened.character}
                name={BY_ID[opened.character].name}
                className="letter-portrait"
              />
              <div>
                <small>
                  {opened.tier}・來自{BY_ID[opened.character].era}
                </small>
                <h2>{BY_ID[opened.character].name}</h2>
              </div>
              <span className="letter-seal">書</span>
            </div>
            <h3>{opened.title}</h3>
            <div className="letter-body" onClick={() => setFast(true)}>
              {opened.body}
            </div>
            {!ready ? (
              <div className="letter-reading-actions">
                <button className="ui-quiet" onClick={() => setFast(true)}>
                  略過展信動畫
                </button>
                <button
                  className="ui-primary"
                  onClick={() => {
                    setFast(true);
                    setReady(true);
                  }}
                >
                  讀畢・提筆回信
                </button>
              </div>
            ) : selected ? (
              <div className="letter-answer" aria-live="polite">
                <small>你的回覆・{selected.tone}</small>
                <p>{selected.text}</p>
                <hr />
                <small>{BY_ID[opened.character].name}回信</small>
                <p className="ink-appear">{selected.response}</p>
                <p className="letter-closer">{opened.closer}</p>
                <small>{notice || "已珍藏回覆；重讀不會更改選擇或重複領取獎勵。"}</small>
                <button className="ui-quiet" onClick={() => setOpened(null)}>
                  收起書信・返回列表
                </button>
              </div>
            ) : (
              <div className="letter-options">
                <p>提筆回信，無關對錯</p>
                {opened.replies.map((reply) => (
                  <button
                    key={reply.id}
                    data-testid={`letter-reply-${reply.id}`}
                    onClick={() => {
                      const reward = state.replyLetter(opened.id, reply.id);
                      setNotice(reward ? `回覆已珍藏 · 墨玉 +${reward}` : "回覆已珍藏");
                    }}
                  >
                    <small>
                      {reply.id}・{reply.tone}
                    </small>
                    <span>{reply.text}</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
