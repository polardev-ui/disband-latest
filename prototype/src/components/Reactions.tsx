import { useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import type { Message, Person } from "../data/types";
import { ME } from "../data/seed";
import { firstName } from "../state/selectors";
import { EmojiPicker } from "./EmojiPicker";
import { Popover } from "./Popover";

export function Reactions({
  msg,
  people,
  onToggle,
}: {
  msg: Message;
  people: Record<string, Person>;
  onToggle: (emoji: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  if (!msg.reactions.length) return null;
  return (
    <div className="rx-row">
      {msg.reactions.map((r) => {
        const mine = r.userIds.includes(ME);
        const who = r.userIds.map((id) => (id === ME ? "You" : firstName(people[id]))).join(", ");
        return (
          <button
            key={r.emoji}
            type="button"
            className={`rx${mine ? " rx--mine" : ""}`}
            aria-pressed={mine}
            title={`${who} reacted with ${r.emoji}`}
            onClick={() => onToggle(r.emoji)}
          >
            <span className="rx-e">{r.emoji}</span>
            <span key={r.userIds.length} className="rx-n">{r.userIds.length}</span>
          </button>
        );
      })}
      <button ref={addRef} type="button" className="rx rx-add" aria-label="Add reaction" title="Add reaction" onClick={() => setPicking((v) => !v)}>
        <SmilePlus size={16} />
      </button>
      {picking && (
        <Popover anchor={addRef} onClose={() => setPicking(false)} align="start" label="Add reaction">
          <EmojiPicker
            title="Add reaction"
            onPick={(e) => {
              onToggle(e);
              setPicking(false);
            }}
          />
        </Popover>
      )}
    </div>
  );
}
