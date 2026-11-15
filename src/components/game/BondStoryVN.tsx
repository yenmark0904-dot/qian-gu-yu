import { useMemo } from "react";
import { createPortal } from "react-dom";
import { QinStoryVN } from "./MainStory";
import { BOND_STORY_SCRIPTS, bondStage } from "@/game/stories-vn";

/** The exact Qin/Wu/Qi/Tang presentation and voice player, not a second VN skin. */
export function BondStoryVN({ id, index, title, label, onClose, onFinish }: {
  id: string; index: number; title: string; label: string;
  onClose: () => void; onFinish: () => void;
}) {
  const stage = useMemo(() => bondStage(id), [id]);
  const key = `${id}:${index}`;
  return createPortal(
    <div onClick={(event) => event.stopPropagation()}>
      <QinStoryVN key={key} chapter={1} volume={index + 1} title={title}
        text={BOND_STORY_SCRIPTS[key]} onClose={onClose}
        bond={{ key, label: `《${label}》`, stage, onFinish }} />
    </div>, document.body,
  );
}
