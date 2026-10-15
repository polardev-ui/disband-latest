import { useMemo, useRef, useState } from "react";
import { Copy, Ellipsis, Pencil, Reply, RotateCw, SmilePlus, Trash2 } from "lucide-react";
import type { Message } from "../data/types";
import { QUICK_REACTIONS } from "../data/seed";
import { EmojiPicker } from "./EmojiPicker";
import { Popover } from "./Popover";

export interface MessageHandlers {
  reply: (m: Message) => void;
  react: (m: Message, emoji: string) => void;
  copy: (m: Message) => void;
  edit: (m: Message) => void;
  remove: (m: Message) => void;
  retry: (m: Message) => void;
}

/**
 * The hover toolbar plus its overflow menu. Buttons stay in the tab order
 * (the toolbar is revealed on hover and on focus-within), so nothing here
 * depends on a mouse. `quick` sets how many one-tap reactions to show.
 */
export function MessageActions({
  msg,
  mine,
  h,
  quick = 3,
  menuOpen,
  setMenuOpen,
}: {
  msg: Message;
  mine: boolean;
  h: MessageHandlers;
  quick?: number;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const moreRef = useRef<HTMLButtonElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);

  return (
    <div className="ma" role="toolbar" aria-label="Message actions" data-open={menuOpen || picking || undefined}>
      {QUICK_REACTIONS.slice(0, quick).map((e) => (
        <button key={e} type="button" className="ma-btn ma-emoji" aria-label={`React with ${e}`} title={`React with ${e}`} onClick={() => h.react(msg, e)}>
          {e}
        </button>
      ))}
      <button ref={pickRef} type="button" className="ma-btn" aria-label="Add reaction" title="Add reaction" onClick={() => setPicking((v) => !v)}>
        <SmilePlus size={17} />
      </button>
      <button type="button" className="ma-btn" aria-label="Reply" title="Reply" onClick={() => h.reply(msg)}>
        <Reply size={17} />
      </button>
      <button
        ref={moreRef}
        type="button"
        className="ma-btn"
        aria-label="More actions"
        title="More"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Ellipsis size={17} />
      </button>

      {picking && (
        <Popover anchor={pickRef} onClose={() => setPicking(false)} label="Add reaction">
          <EmojiPicker
            title="Add reaction"
            onPick={(e) => {
              h.react(msg, e);
              setPicking(false);
            }}
          />
        </Popover>
      )}
      {menuOpen && (
        <Popover anchor={moreRef} onClose={() => setMenuOpen(false)} className="menu-pop" label="Message actions">
          <MessageMenu msg={msg} mine={mine} h={h} close={() => setMenuOpen(false)} />
        </Popover>
      )}
    </div>
  );
}

export function MessageMenu({ msg, mine, h, close }: { msg: Message; mine: boolean; h: MessageHandlers; close: () => void }) {
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <div className="menu" role="menu">
      <div className="menu-emoji">
        {QUICK_REACTIONS.map((e) => (
          <button key={e} type="button" role="menuitem" className="menu-emoji-btn" aria-label={`React with ${e}`} onClick={run(() => h.react(msg, e))}>
            {e}
          </button>
        ))}
      </div>
      {msg.failed && (
        <button type="button" role="menuitem" className="menu-item" onClick={run(() => h.retry(msg))}>
          <RotateCw size={16} /> Try again
        </button>
      )}
      <button type="button" role="menuitem" className="menu-item" onClick={run(() => h.reply(msg))}>
        <Reply size={16} /> Reply
      </button>
      <button type="button" role="menuitem" className="menu-item" onClick={run(() => h.copy(msg))}>
        <Copy size={16} /> Copy text
      </button>
      {mine && (
        <button type="button" role="menuitem" className="menu-item" onClick={run(() => h.edit(msg))}>
          <Pencil size={16} /> Edit
        </button>
      )}
      {mine && (
        <button type="button" role="menuitem" className="menu-item menu-item--danger" onClick={run(() => h.remove(msg))}>
          <Trash2 size={16} /> Delete
        </button>
      )}
    </div>
  );
}

/** Right-click menu, positioned at the pointer. */
export function ContextMenu({
  at,
  msg,
  mine,
  h,
  close,
}: {
  at: { x: number; y: number };
  msg: Message;
  mine: boolean;
  h: MessageHandlers;
  close: () => void;
}) {
  // A virtual anchor: a zero-size rect at the pointer.
  const virtual = useMemo(
    () => ({
      current: { getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0), contains: () => false } as unknown as HTMLElement,
    }),
    [at.x, at.y],
  );
  return (
    <Popover anchor={virtual} onClose={close} align="start" className="menu-pop" label="Message actions">
      <MessageMenu msg={msg} mine={mine} h={h} close={close} />
    </Popover>
  );
}
