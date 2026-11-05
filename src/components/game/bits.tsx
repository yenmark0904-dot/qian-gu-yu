import { useState, type ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { RARITY_META, type Character, type Rarity } from "@/game/data";
import { MAX_BOND, bondLevel, shownSkin, type Skin } from "@/game/bond";
import { useSave } from "@/game/store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Portrait({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={cn("grid place-items-center bg-surface-2 text-gold", className)}>
        <span className="font-serif text-5xl">{name.slice(0, 1)}</span>
      </div>
    );
  }
  return (
    <img
      src={`/portraits/${id}.jpg?v=10`}
      alt={name}
      draggable={false}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export function RarityMark({ rarity }: { rarity: Rarity }) {
  const meta = RARITY_META[rarity];
  return (
    <span className={cn("rarity-pill", `rarity-pill-${rarity}`)}>
      {meta.label}
      <span>{meta.epithet}</span>
    </span>
  );
}

/** Six small pips: filled up to the bond tier. */
export function BondPips({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cn("bond-pips", className)} aria-label={`緣分 ${level} 階`} data-testid="bond-pips">
      {Array.from({ length: MAX_BOND }, (_, i) => (
        <i key={i} className={i < level ? "on" : undefined} />
      ))}
    </span>
  );
}

/** Card art wrapper honouring the equipped 墨寶閣 frame and the bond skin. */
export function SkinnedCard({
  character,
  count,
  skin,
  children,
  className,
}: {
  character: Character;
  count: number;
  skin?: Skin;
  children: ReactNode;
  className?: string;
}) {
  const frame = useSave((s) => s.frame);
  const chosen = useSave((s) => s.skins[character.id]);
  const shown = skin ?? shownSkin(count, chosen);
  return (
    <div className={cn("rounded-xl", count > 0 && `glow-${character.rarity}`, className)}>
      <div className={cn("card-art relative overflow-hidden rounded-xl", `edge-${character.rarity}`, `frame-${frame}`, `skin-${shown}`)} data-skin={shown}>
        {children}
        {shown === "vow" ? (
          <span className="vow-stamp" aria-hidden>
            定情
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CardFace({
  character,
  count = 0,
  fresh = false,
  bondUp = false,
}: {
  character: Character;
  count?: number;
  fresh?: boolean;
  bondUp?: boolean;
}) {
  const level = bondLevel(count);
  return (
    <SkinnedCard character={character} count={Math.max(count, 1)}>
      <Portrait id={character.id} name={character.name} className="aspect-card w-full object-contain object-center" />
      <div className="card-shade absolute inset-0" />
      <div className="absolute left-2 top-2">
        <RarityMark rarity={character.rarity} />
      </div>
      {fresh ? (
        <span className="absolute right-2 top-2 rounded-full bg-cinnabar px-2 py-0.5 text-xs text-bg">初遇</span>
      ) : null}
      {count > 1 ? (
        <span className="absolute right-2 top-2 rounded-full bg-bg/80 px-2 py-0.5 text-xs tabular-nums text-gold">
          ×{count}
        </span>
      ) : null}
      {bondUp ? <span className="bond-up-tag">緣分升階</span> : null}
      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="truncate font-serif text-sm" style={{ color: "#f3eadc", textShadow: "0 1px 6px #100e0c" }}>{character.name}</p>
        <p className="truncate text-xs" style={{ color: "#f6e7c1", textShadow: "0 1px 6px #100e0c" }}>{character.epithet}</p>
        {count > 0 ? <BondPips level={level} className="mt-1" /> : null}
      </div>
    </SkinnedCard>
  );
}

export function Spoken({
  character,
  typed = false,
}: {
  character: Character;
  typed?: boolean;
}) {
  return (
    <div>
      <p className="text-xs tracking-widest text-gold">他看著你說</p>
      {typed ? (
        <p className="mt-2 text-fg">
          「
          {Array.from(character.line).map((ch, i) => (
            <span key={`${character.id}-${i}`} className="char" style={{ animationDelay: `${i * 28}ms` }}>
              {ch}
            </span>
          ))}
          」
        </p>
      ) : (
        <p className="mt-2 text-fg">「{character.line}」</p>
      )}
      <p className="mt-2 text-sm text-muted">
        —— {character.verseFrom} · {character.verse}
      </p>
    </div>
  );
}

const MOTES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 53) % 100,
  delay: (i % 8) * 0.28,
  duration: 5 + (i % 4),
  size: 3 + (i % 3),
}));

export function Motes({ tone }: { tone: "gold" | "silver" }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {MOTES.map((mote, i) => (
        <span
          key={i}
          className={tone === "gold" ? "mote mote-gold" : "mote mote-silver"}
          style={{
            left: `${mote.left}%`,
            animationDelay: `${mote.delay}s`,
            animationDuration: `${mote.duration}s`,
            width: mote.size,
            height: mote.size,
          }}
        />
      ))}
    </div>
  );
}

const PETALS = Array.from({ length: 10 }, (_, i) => ({
  left: (i * 17 + 6) % 100,
  delay: (i % 6) * 0.45,
  duration: 6 + (i % 4),
  size: 7 + (i % 4),
}));

export function Petals() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {PETALS.map((petal, i) => (
        <span
          key={i}
          className="petal"
          style={{
            left: `${petal.left}%`,
            animationDelay: `${petal.delay}s`,
            animationDuration: `${petal.duration}s`,
            width: petal.size,
            height: petal.size * 1.4,
          }}
        />
      ))}
    </div>
  );
}
/** The 墨玉 currency icon: a black-green ink-jade bead with a gold rim (SVG, crisp at any size). */
export function MoYu({ className, label }: { className?: string; label?: boolean }) {
  return (
    <img
      src="/icons/moyu.svg"
      alt={label ? "墨玉" : ""}
      aria-hidden={label ? undefined : true}
      width={16}
      height={16}
      draggable={false}
      decoding="async"
      className={cn("moyu-icon inline-block h-[1.15em] w-[1.15em] shrink-0 select-none align-[-0.2em]", className)}
    />
  );
}

/** The 墨痕 currency icon: a gold-rimmed ink stone bead with one dry-brush stroke and a cinnabar seal. */
export function MoHen({ className, label }: { className?: string; label?: boolean }) {
  return (
    <img
      src="/icons/mohen.svg"
      alt={label ? "墨痕" : ""}
      aria-hidden={label ? undefined : true}
      width={16}
      height={16}
      draggable={false}
      decoding="async"
      className={cn("moyu-icon inline-block h-[1.15em] w-[1.15em] shrink-0 select-none align-[-0.2em]", className)}
    />
  );
}
