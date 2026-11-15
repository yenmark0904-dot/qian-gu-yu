/** 劇情三消 overlay: the shared Game in story mode, on top of the story reader. Lazy-loaded (breaks the Match3 ↔ story import cycle). */
import { useState } from "react";
import { Game } from "@/components/game/Match3";
import { useSave } from "@/game/store";
import type { StoryEvent } from "@/game/story-events";

export default function StoryEventPlayer({ event, onLeave }: { event: StoryEvent; onLeave: () => void }) {
  const [run, setRun] = useState(() => Date.now());
  return (
    <div
      className="ink-overlay m3-screen fixed inset-0 z-[80] flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label={`劇情三消 · ${event.name}`}
      data-testid="story-event"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Game
        key={run}
        def={event.def}
        onMap={onLeave}
        onPlay={() => setRun(Date.now())}
        story={{
          event,
          onClear: () => useSave.getState().recordStoryEvent(event.id, "clear"),
          onLeave,
        }}
      />
    </div>
  );
}
