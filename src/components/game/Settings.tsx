import { useMemo, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import { CloudBindChip } from "@/components/game/CloudSave";
import { Portrait, cn } from "@/components/game/bits";
import { ensureAudio } from "@/game/audio";
import { BY_ID, CHARACTERS, RARITY_ORDER, type Character } from "@/game/data";
import { DEVICE_KEY } from "@/game/feedback";
import { NICK_MAX, NICK_MIN, cleanNickname } from "@/game/shengong";
import { sgNickname } from "@/game/shengong-api";
import { useSave } from "@/game/store";

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Date.now().toString(36)}`;
  }
}

function SealMark({ className }: { className?: string }) {
  return (
    <span className={cn("ink-seal", className)} aria-hidden>
      遇
    </span>
  );
}

/** Circular avatar used in the top bar and the settings preview. */
export function PlayerAvatar({
  size = "bar",
  className,
}: {
  size?: "bar" | "lg";
  className?: string;
}) {
  const avatarId = useSave((s) => s.avatarId);
  const owned = useSave((s) => s.owned);
  const id = avatarId && (owned[avatarId] ?? 0) > 0 ? avatarId : null;
  const character = id ? BY_ID[id] : null;
  return (
    <span
      className={cn(
        "ink-avatar",
        size === "lg" ? "ink-avatar-lg" : "ink-avatar-bar",
        character ? `ink-avatar-${character.rarity}` : "ink-avatar-seal",
        className,
      )}
    >
      {character ? (
        <Portrait id={character.id} name={character.name} className="ink-avatar-img" />
      ) : (
        <SealMark className="ink-avatar-seal-inner" />
      )}
    </span>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <SettingsBody onClose={onClose} />;
}

function SettingsBody({ onClose }: { onClose: () => void }) {
  const owned = useSave((s) => s.owned);
  const avatarId = useSave((s) => s.avatarId);
  const muted = useSave((s) => s.muted);
  const [name, setName] = useState(() => useSave.getState().sgNick ?? "");
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => cleanNickname(name), [name]);

  const ownedList = useMemo(() => {
    const have = new Set(Object.keys(owned).filter((id) => (owned[id] ?? 0) > 0));
    const order = new Map(RARITY_ORDER.map((r, i) => [r, i]));
    return CHARACTERS.filter((c) => have.has(c.id)).sort((a, b) => {
      const d = (order.get(b.rarity) ?? 0) - (order.get(a.rarity) ?? 0);
      return d !== 0 ? d : a.name.localeCompare(b.name, "zh-Hant");
    });
  }, [owned]);

  const saveName = async () => {
    const clean = cleanNickname(name);
    if (!clean) {
      setNameErr(`名字需 ${NICK_MIN}–${NICK_MAX} 字`);
      setNameMsg(null);
      return;
    }
    setBusy(true);
    setNameErr(null);
    useSave.getState().setSgNick(clean);
    try {
      const res = await sgNickname({ data: { deviceId: deviceId(), nickname: clean } });
      if (res.ok) {
        useSave.getState().setSgNick(res.nickname);
        setName(res.nickname);
        setNameMsg("已儲存，並同步深宮排行榜");
      } else if (res.error === "no_record") {
        setNameMsg("已存於本機；登上深宮後會同步排行榜");
      } else if (res.error === "nickname") {
        setNameErr(`名字需 ${NICK_MIN}–${NICK_MAX} 字`);
      } else {
        setNameMsg("已存於本機；排行榜暫時無法同步");
      }
    } catch {
      setNameMsg("已存於本機；排行榜暫時無法同步");
    }
    setBusy(false);
  };

  const pick = (id: string | null) => {
    useSave.getState().setAvatarId(id);
  };

  return (
    <div className="cloud-modal ink-overlay fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose} data-testid="settings-sheet">
      <div
        className="cloud-sheet safe-bottom w-full max-w-md rounded-t-2xl px-5 pb-6 pt-5 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="font-serif text-xl tracking-[0.3em] text-fg">
            設定
          </h2>
          <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-muted" onClick={onClose} aria-label="關閉">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <PlayerAvatar size="lg" />
          <div className="min-w-0">
            <p className="text-xs tracking-[0.2em] text-muted">頭貼</p>
            <p className="truncate font-serif text-lg text-fg">
              {avatarId && BY_ID[avatarId] && (owned[avatarId] ?? 0) > 0 ? BY_ID[avatarId]!.name : "遇 · 印章"}
            </p>
          </div>
        </div>

        <section className="mt-5">
          <label className="text-sm tracking-[0.15em]" htmlFor="settings-name">
            名字
          </label>
          <p className="mt-0.5 text-xs text-muted">也會用在深宮排行榜（{NICK_MIN}–{NICK_MAX} 字）</p>
          <div className="mt-2 flex gap-2">
            <input
              id="settings-name"
              className="sg-input min-h-11 min-w-0 flex-1 rounded-xl px-3 text-base"
              value={name}
              maxLength={24}
              placeholder={`${NICK_MIN}–${NICK_MAX} 字`}
              autoComplete="off"
              data-testid="settings-name"
              onChange={(e) => {
                setName(e.target.value);
                setNameErr(null);
                setNameMsg(null);
              }}
            />
            <button type="button" className="min-h-11 shrink-0 rounded-xl bg-gold px-4 text-sm text-bg" disabled={busy || !preview} onClick={() => void saveName()} data-testid="settings-name-save">
              {busy ? "…" : "儲存"}
            </button>
          </div>
          {preview && preview !== name.trim() ? <p className="mt-1 text-xs text-muted">將顯示為：{preview}</p> : null}
          {nameErr ? <p className="sg-warn mt-1 text-xs">{nameErr}</p> : null}
          {nameMsg ? <p className="mt-1 text-xs text-muted" role="status">{nameMsg}</p> : null}
        </section>

        <section className="mt-5">
          <p className="text-sm tracking-[0.15em]">頭貼</p>
          <p className="mt-0.5 text-xs text-muted">獲得角色卡後，可換成他們的畫像</p>
          <ul className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-5" data-testid="settings-avatars">
            <li>
              <button
                type="button"
                className={cn("ink-avatar-pick", !avatarId && "ink-avatar-pick-on")}
                aria-label="印章 · 遇"
                aria-pressed={!avatarId}
                onClick={() => pick(null)}
              >
                <SealMark className="ink-avatar-seal-inner" />
              </button>
              <p className="mt-1 truncate text-center text-[0.65rem] text-muted">印章</p>
            </li>
            {ownedList.map((c: Character) => {
              const on = avatarId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={cn("ink-avatar-pick", `ink-avatar-${c.rarity}`, on && "ink-avatar-pick-on")}
                    aria-label={c.name}
                    aria-pressed={on}
                    onClick={() => pick(c.id)}
                  >
                    <Portrait id={c.id} name={c.name} className="ink-avatar-img" />
                  </button>
                  <p className="mt-1 truncate text-center text-[0.65rem] text-muted">{c.name}</p>
                </li>
              );
            })}
          </ul>
          {ownedList.length === 0 ? <p className="mt-2 text-xs text-muted">還沒有角色卡。召喚相逢後，即可換成他們的頭貼。</p> : null}
        </section>

        <section className="mt-5">
          <p className="text-sm tracking-[0.15em]">聲音</p>
          <button
            type="button"
            className="ink-ghost mt-2 flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-sm"
            aria-label={muted ? "開啟聲音" : "關閉聲音"}
            data-testid="settings-mute"
            onClick={() => {
              const next = !useSave.getState().muted;
              if (!next) ensureAudio();
              useSave.getState().toggleMuted();
            }}
          >
            <span>{muted ? "目前靜音" : "目前有聲"}</span>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </section>

        <section className="mt-5">
          <p className="mb-2 text-sm tracking-[0.15em]">雲端存檔</p>
          <CloudBindChip />
        </section>
      </div>
    </div>
  );
}
