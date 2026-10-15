import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CornerDownLeft, Hash, MessageSquareText, Search, Users } from "lucide-react";
import { SPACES } from "../data/seed";
import { convInfo, listTime, plainText, recentConversations, search, type SearchHit } from "../state/selectors";
import { useChat } from "../state/store";
import { Avatar, GroupAvatar, SpaceIcon } from "./Avatar";
import { excerpt, Highlight } from "./MessageText";

/**
 * Search across people, places and messages. Keyboard: ↑ ↓ to move, Enter
 * to open, Esc to close and go back to where you were. Each design frames
 * it differently (palette, sheet, dropdown) and styles it.
 */
export function SearchPanel({
  onPick,
  onClose,
  placeholder = "Search people, chats and messages",
  initial = "",
  returnLabel,
  footer = true,
}: {
  onPick: (hit: SearchHit) => void;
  onClose: () => void;
  placeholder?: string;
  initial?: string;
  returnLabel?: string;
  footer?: boolean;
}) {
  const { state } = useChat();
  const [q, setQ] = useState(initial);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const groups = useMemo(() => search(state, q), [state, q]);
  const recent = useMemo<SearchHit[]>(
    () =>
      recentConversations(state)
        .slice(0, 5)
        .map((r) => ({
          kind: "place",
          key: `r-${r.info.id}`,
          convId: r.info.id,
          title: r.info.title,
          detail: r.last ? listTime(r.last.at) : "",
          icon: r.info.conv.kind === "group" ? "group" : "dm",
        })),
    [state],
  );

  const sections: { label: string; hits: SearchHit[] }[] = q.trim()
    ? [
        { label: "People", hits: groups.people },
        { label: "Chats and channels", hits: groups.places },
        { label: "Messages", hits: groups.messages },
      ].filter((s) => s.hits.length)
    : recent.length
      ? [{ label: "Recent", hits: recent }]
      : [];
  const flat = sections.flatMap((s) => s.hits);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      onPick(flat[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let idx = -1;
  const row = (hit: SearchHit, body: ReactNode, icon: ReactNode) => {
    idx += 1;
    const i = idx;
    return (
      <button
        key={hit.key}
        id={`sr-${i}`}
        type="button"
        role="option"
        aria-selected={i === active}
        data-idx={i}
        className={`sr-item${i === active ? " is-active" : ""}`}
        onMouseMove={() => i !== active && setActive(i)}
        onClick={() => onPick(hit)}
      >
        <span className="sr-icon">{icon}</span>
        <span className="sr-body">{body}</span>
        {i === active && <CornerDownLeft className="sr-enter" size={14} aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div className="sr" onKeyDown={onKeyDown}>
      <div className="sr-field">
        <Search size={18} className="sr-field-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="sr-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="sr-list"
          aria-activedescendant={flat.length ? `sr-${active}` : undefined}
        />
        <kbd className="sr-esc">Esc</kbd>
      </div>
      <div className="sr-list" id="sr-list" role="listbox" ref={listRef}>
        {sections.map((s) => (
          <div key={s.label} className="sr-group">
            <p className="sr-label">{s.label}</p>
            {s.hits.map((hit) => {
              if (hit.kind === "person") {
                return row(
                  hit,
                  <>
                    <span className="sr-title"><Highlight text={hit.person.name} query={q} /></span>
                    <span className="sr-detail"><Highlight text={hit.detail} query={q} /></span>
                  </>,
                  <Avatar person={hit.person} size={24} />,
                );
              }
              if (hit.kind === "place") {
                const info = hit.convId ? convInfo(state, hit.convId) : null;
                const icon =
                  hit.icon === "space" ? <SpaceIcon space={SPACES[hit.spaceId!]} size={24} />
                  : hit.icon === "channel" ? <Hash size={18} />
                  : hit.icon === "group" && info?.members ? <GroupAvatar people={info.members} size={24} />
                  : info?.person ? <Avatar person={info.person} size={24} />
                  : <Users size={18} />;
                return row(
                  hit,
                  <>
                    <span className="sr-title"><Highlight text={hit.title} query={q} /></span>
                    <span className="sr-detail">{hit.detail}</span>
                  </>,
                  icon,
                );
              }
              const author = state.people[hit.msg.authorId];
              return row(
                hit,
                <>
                  <span className="sr-title sr-title--msg">
                    <span className="sr-author">{author?.id === "me" ? "You" : author?.name}</span>
                    <span className="sr-where">{hit.where} · {listTime(hit.msg.at)}</span>
                  </span>
                  <span className="sr-snippet"><Highlight text={excerpt(plainText(hit.msg.text), q)} query={q} /></span>
                </>,
                <MessageSquareText size={18} />,
              );
            })}
          </div>
        ))}
        {q.trim() && !flat.length && (
          <div className="sr-empty">
            <p className="sr-empty-title">Nothing matches “{q.trim()}”</p>
            <p className="sr-empty-body">Try part of a name, a channel like <em>general</em>, or a word from a message.</p>
          </div>
        )}
        {!q.trim() && !flat.length && (
          <div className="sr-empty">
            <p className="sr-empty-title">Search starts working once you have conversations</p>
            <p className="sr-empty-body">Add a friend or join a space, and their names and messages will show up here.</p>
          </div>
        )}
      </div>
      {footer && (
        <div className="sr-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> {returnLabel ? `back to ${returnLabel}` : "close"}</span>
          <span className="sr-foot-tip">Sample data only</span>
        </div>
      )}
    </div>
  );
}
