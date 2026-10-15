import { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlertTriangle, ArrowUp, AtSign, ChevronLeft, CornerDownRight, Hash, Lock, PanelRightClose, PanelRightOpen, Phone, Plus,
  Smile, Video, X,
} from "lucide-react";
import { Attachments } from "../../components/Attachments";
import { Avatar, GroupAvatar } from "../../components/Avatar";
import { EmojiPicker } from "../../components/EmojiPicker";
import { InlineEditor } from "../../components/InlineEditor";
import { ContextMenu, MessageActions } from "../../components/MessageActions";
import { MessageText } from "../../components/MessageText";
import { Popover } from "../../components/Popover";
import { ProfileCard } from "../../components/ProfileCard";
import { Reactions } from "../../components/Reactions";
import { SkeletonMessages } from "../../components/Skeleton";
import { useToast } from "../../components/Toast";
import { useComposer, useConversation } from "../../components/useConversation";
import { ME } from "../../data/seed";
import type { Message } from "../../data/types";
import { useStickToBottom } from "../../lib/hooks";
import {
  clock, convInfo, effectivePresence, firstName, fullTime, groupMessages, plainText, PRESENCE_LABEL, type ConvInfo,
} from "../../state/selectors";
import { useChat } from "../../state/store";

export const ROLE_COLOR: Record<string, string> = {
  Owner: "#f2b45a",
  Engineering: "#7cc4ff",
  Design: "#c9a8ff",
  QA: "#7fe0b6",
  Ops: "#ffad88",
};

type C = ReturnType<typeof useConversation>;

export function Stage({
  convId, highlight, onHighlight, onProfile, onChannelRef, details, onToggleDetails, onBack,
}: {
  convId: string;
  highlight: string | null;
  onHighlight: (id: string) => void;
  onProfile: (id: string, el: HTMLElement, spaceId?: string) => void;
  onChannelRef: (name: string) => void;
  details: boolean;
  onToggleDetails: () => void;
  onBack?: () => void;
}) {
  const c = useConversation(convId);
  const { state } = c;
  const toast = useToast();
  const info = convInfo(state, convId)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountedAt = useMemo(() => Date.now(), [convId]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => groupMessages(c.messages), [c.messages]);
  const last = c.messages[c.messages.length - 1];
  useStickToBottom(scrollRef, convId, c.messages.length, last?.authorId === ME);
  const loading = state.scenario === "loading";
  const readOnly = info.channel?.readOnly && info.space?.ownerId !== ME;
  const call = () => toast("Calls aren't simulated in this prototype.");

  let title;
  if (info.person) {
    const pres = effectivePresence(state, info.person);
    title = (
      <button type="button" className="ds-head-who" onClick={(e) => onProfile(info.person!.id, e.currentTarget)}>
        <Avatar person={info.person} size={30} presence={info.person.unavailable ? null : pres} />
        <span className="ds-head-text">
          <span className="ds-head-title">{info.title}</span>
          <span className="ds-head-sub">{info.person.unavailable ? "Unavailable" : `${PRESENCE_LABEL[pres]}${info.person.note && pres !== "offline" ? ` — ${info.person.note}` : ""}`}</span>
        </span>
      </button>
    );
  } else if (info.members) {
    title = (
      <div className="ds-head-who">
        <GroupAvatar people={info.members} size={30} />
        <span className="ds-head-text">
          <span className="ds-head-title">{info.title}</span>
          <span className="ds-head-sub">{info.members.length + 1} members</span>
        </span>
      </div>
    );
  } else {
    title = (
      <div className="ds-head-who">
        <span className="ds-head-glyph"><Hash size={17} aria-hidden="true" /></span>
        <span className="ds-head-text ds-head-text--row">
          <span className="ds-head-title">{info.title}</span>
          {info.channel?.topic && <span className="ds-head-sub">{info.channel.topic}</span>}
        </span>
      </div>
    );
  }

  return (
    <section className="ds-stage-inner" aria-label={info.conv.kind === "channel" ? `#${info.title}` : info.title}>
      <header className="ds-head">
        {onBack && <button type="button" className="ds-icon-btn" aria-label="Back" onClick={onBack}><ChevronLeft size={22} /></button>}
        {title}
        <div className="ds-head-actions">
          {info.conv.kind !== "channel" && !info.person?.unavailable && (
            <>
              <button type="button" className="ds-icon-btn ds-hide-sm" aria-label="Voice call" data-tip="Voice call" onClick={call}><Phone size={17} /></button>
              <button type="button" className="ds-icon-btn ds-hide-sm" aria-label="Video call" data-tip="Video call" onClick={call}><Video size={17} /></button>
            </>
          )}
          <button type="button" className="ds-icon-btn" aria-label={details ? "Close details" : "Open details"} aria-pressed={details} data-tip={details ? "Close details" : "Details"} onClick={onToggleDetails}>
            {details ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </button>
        </div>
      </header>
      {state.scenario === "offline" && (
        <p className="ds-banner" role="status"><AlertTriangle size={15} aria-hidden="true" /> Connection lost. New messages are kept here and marked until you're back.</p>
      )}
      <div className="ds-scroll" ref={scrollRef}>
        {loading ? (
          <SkeletonMessages />
        ) : (
          <div className="ds-msgs" key={convId}>
            <Origin info={info} empty={!c.messages.length} />
            {rows.map((r) =>
              r.type === "day" ? (
                <div key={r.key} className="ds-day" role="separator"><span>{r.label}</span></div>
              ) : (
                <Row
                  key={r.key}
                  msg={r.msg}
                  first={r.first}
                  isNew={!!r.msg.local && r.msg.at >= mountedAt}
                  c={c}
                  info={info}
                  highlight={highlight === r.msg.id}
                  onHighlight={onHighlight}
                  onProfile={(id, el) => onProfile(id, el, info.space?.id)}
                  onChannelRef={onChannelRef}
                />
              ),
            )}
          </div>
        )}
      </div>
      {readOnly ? (
        <div className="ds-composer">
          <p className="ds-readonly"><Lock size={15} aria-hidden="true" /> #{info.title} is read-only. Only {info.space!.name} organisers can post.</p>
        </div>
      ) : (
        <Composer key={convId} convId={convId} c={c} disabled={loading} placeholder={info.conv.kind === "channel" ? `Message #${info.title}` : `Message ${info.title}`} />
      )}
      {c.ctx && (() => {
        const m = c.byId(c.ctx.id);
        return m ? <ContextMenu at={c.ctx} msg={m} mine={m.authorId === ME} h={c.h} close={() => c.setCtx(null)} /> : null;
      })()}
      {c.confirmEl}
    </section>
  );
}

function Origin({ info, empty }: { info: ConvInfo; empty: boolean }) {
  return (
    <div className="ds-origin">
      {info.person ? <Avatar person={info.person} size={56} /> : info.members ? <GroupAvatar people={info.members} size={56} /> : <span className="ds-origin-glyph"><Hash size={26} aria-hidden="true" /></span>}
      <h3>{info.person ? (info.person.unavailable ? "Profile unavailable" : info.person.name) : info.conv.kind === "channel" ? `#${info.title}` : info.title}</h3>
      <p>
        {info.person
          ? empty ? `Nothing here yet. Your first message to ${firstName(info.person)} starts the thread.` : `The beginning of your messages with ${firstName(info.person)}.`
          : info.members
            ? `The beginning of ${info.title}, with ${info.members.map((m) => firstName(m)).join(", ")}.`
            : empty ? `No messages in #${info.title} yet. ${info.channel?.topic ?? ""}` : `The beginning of #${info.title} in ${info.space!.name}.`}
      </p>
    </div>
  );
}

function Row({
  msg, first, isNew, c, info, highlight, onHighlight, onProfile, onChannelRef,
}: {
  msg: Message; first: boolean; isNew: boolean; c: C; info: ConvInfo; highlight: boolean;
  onHighlight: (id: string) => void; onProfile: (id: string, el: HTMLElement) => void; onChannelRef: (n: string) => void;
}) {
  const { state } = c;
  const author = state.people[msg.authorId];
  const mine = msg.authorId === ME;
  const reply = c.byId(msg.replyToId);
  const replyAuthor = reply ? state.people[reply.authorId] : undefined;
  const role = info.space?.roles[msg.authorId];
  const roleColor = info.conv.kind === "channel" && role ? ROLE_COLOR[role] : undefined;
  const editing = c.editingId === msg.id;
  const mentionsMe = !mine && /@polar\b/i.test(msg.text);
  const [tapped, setTapped] = useState(false);

  return (
    <div
      className="ds-row"
      data-msg-id={msg.id}
      data-first={first || undefined}
      data-new={isNew || undefined}
      data-highlight={highlight || undefined}
      data-mention={mentionsMe || undefined}
      data-mine={mine || undefined}
      data-failed={msg.failed || undefined}
      data-active={c.menuFor === msg.id || tapped || undefined}
      style={roleColor ? ({ "--role": roleColor } as CSSProperties) : undefined}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("a, textarea")) return;
        e.preventDefault();
        c.setCtx({ id: msg.id, x: e.clientX, y: e.clientY });
      }}
      onClick={(e) => {
        if (window.matchMedia("(hover: none)").matches && !(e.target as HTMLElement).closest("button, a, textarea")) setTapped((v) => !v);
      }}
    >
      {reply && (
        <button type="button" className="ds-reply" onClick={() => onHighlight(reply.id)}>
          <CornerDownRight size={13} aria-hidden="true" />
          <span className="ds-reply-name">{replyAuthor?.id === ME ? "You" : replyAuthor?.name}</span>
          <span className="ds-reply-text">{plainText(reply.text)}</span>
        </button>
      )}
      <div className="ds-row-grid">
        <div className="ds-gutter">
          {first || reply ? (
            <button type="button" className="ds-av-btn" aria-label={`${author.name}'s profile`} onClick={(e) => onProfile(author.id, e.currentTarget)}>
              <Avatar person={author} size={34} />
            </button>
          ) : (
            <time className="ds-gutter-time" title={fullTime(msg.at)}>{clock(msg.at).replace(/\s?[AP]M/, "")}</time>
          )}
        </div>
        <div className="ds-body">
          {(first || reply) && (
            <div className="ds-meta">
              <button type="button" className="ds-name" onClick={(e) => onProfile(author.id, e.currentTarget)}>{author.unavailable ? "Deleted account" : author.name}</button>
              {roleColor && <span className="ds-role">{role}</span>}
              <time title={fullTime(msg.at)}>{clock(msg.at)}</time>
            </div>
          )}
          {editing ? (
            <InlineEditor initial={msg.text} onSave={(t) => c.saveEdit(msg, t)} onCancel={() => c.setEditingId(null)} />
          ) : (
            msg.text && (
              <div className="ds-text">
                <MessageText text={msg.text} people={state.people} onMention={onProfile} onChannel={onChannelRef} />
                {msg.editedAt && <span className="ds-edited" title={`Edited ${fullTime(msg.editedAt)}`}>edited</span>}
              </div>
            )
          )}
          <Attachments items={msg.attachments} linkPreviews={state.prefs.linkPreviews} />
          <Reactions msg={msg} people={state.people} onToggle={(e) => c.h.react(msg, e)} />
          {msg.failed && (
            <p className="ds-failed" role="status">
              <AlertTriangle size={13} aria-hidden="true" /> Not delivered
              <button type="button" onClick={() => c.h.retry(msg)}>Retry</button>
              <button type="button" onClick={() => c.h.remove(msg)}>Discard</button>
            </p>
          )}
        </div>
      </div>
      {!editing && <MessageActions msg={msg} mine={mine} h={c.h} menuOpen={c.menuFor === msg.id} setMenuOpen={(o) => c.setMenuFor(o ? msg.id : null)} />}
    </div>
  );
}

function Composer({ convId, c, placeholder, disabled }: { convId: string; c: C; placeholder: string; disabled?: boolean }) {
  const toast = useToast();
  const comp = useComposer({ convId, onSend: c.send, onEditLast: c.editLast, onCancel: c.replyTo ? () => c.setReplyTo(null) : undefined });
  const [emoji, setEmoji] = useState(false);
  const emojiRef = useRef<HTMLButtonElement>(null);
  const replyAuthor = c.replyTo ? c.state.people[c.replyTo.authorId] : undefined;
  return (
    <div className="ds-composer">
      <div className="ds-field" data-disabled={disabled || undefined}>
        {c.replyTo && (
          <div className="ds-replying">
            <CornerDownRight size={14} aria-hidden="true" />
            <span className="ds-replying-who">{replyAuthor?.id === ME ? "Yourself" : replyAuthor?.name}</span>
            <span className="ds-replying-text">{plainText(c.replyTo.text)}</span>
            <button type="button" className="ds-icon-btn ds-icon-btn--xs" aria-label="Cancel reply" onClick={() => c.setReplyTo(null)}><X size={14} /></button>
          </div>
        )}
        {comp.files.length > 0 && (
          <div className="ds-files">
            {comp.files.map((f, i) => (
              <span key={i} className="ds-file-chip">
                {f.kind === "file" ? f.name : ""}
                <button type="button" aria-label="Remove attachment" onClick={() => comp.removeFile(i)}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={comp.ref}
          data-composer
          className="ds-input"
          rows={1}
          value={comp.value}
          disabled={disabled}
          placeholder={disabled ? "Syncing…" : placeholder}
          aria-label={placeholder}
          onChange={(e) => comp.setValue(e.target.value)}
          onKeyDown={comp.onKeyDown}
        />
        <div className="ds-field-bar">
          <button type="button" className="ds-icon-btn ds-icon-btn--sm" aria-label="Attach files" data-tip="Attach" disabled={disabled} onClick={() => { toast("Files you pick stay in this tab — nothing is uploaded."); comp.fileRef.current?.click(); }}><Plus size={17} /></button>
          <input ref={comp.fileRef} type="file" multiple hidden onChange={comp.onFiles} />
          <button ref={emojiRef} type="button" className="ds-icon-btn ds-icon-btn--sm" aria-label="Emoji" data-tip="Emoji" disabled={disabled} onClick={() => setEmoji((v) => !v)}><Smile size={17} /></button>
          <button type="button" className="ds-icon-btn ds-icon-btn--sm" aria-label="Mention someone" data-tip="Mention" disabled={disabled} onClick={() => comp.insert("@")}><AtSign size={17} /></button>
          <span className="ds-field-hint" aria-hidden="true"><kbd>↵</kbd> send <kbd>⇧↵</kbd> line</span>
          <button type="button" className="ds-send" aria-label="Send message" disabled={!comp.canSend || disabled} onClick={comp.submit}>
            <ArrowUp key={comp.pulse} size={16} className={comp.pulse ? "ds-send-icon" : undefined} />
          </button>
        </div>
      </div>
      {emoji && (
        <Popover anchor={emojiRef} onClose={() => setEmoji(false)} align="start" label="Insert emoji">
          <EmojiPicker onPick={(e) => { comp.insert(e); setEmoji(false); }} />
        </Popover>
      )}
    </div>
  );
}

// ── Details plane ─────────────────────────────────────────────────────

export function DetailsPlane({
  convId, onClose, onProfile, onEditProfile, sheet,
}: {
  convId: string; onClose: () => void; onProfile: (id: string, el: HTMLElement, spaceId?: string) => void; onEditProfile: () => void; sheet?: boolean;
}) {
  const { state, actions } = useChat();
  const info = convInfo(state, convId);
  if (!info) return null;
  const muted = state.muted.includes(convId);
  const ids = info.person ? [] : info.members ? [ME, ...info.members.map((m) => m.id)] : info.space!.memberIds;
  // Online people grouped by role (spaces) or together (groups); offline last.
  const byRole = new Map<string, string[]>();
  for (const id of ids) {
    const off = effectivePresence(state, state.people[id]) === "offline";
    const key = off ? "Offline" : info.space ? (info.space.roles[id] ?? "Member") : "Online";
    byRole.set(key, [...(byRole.get(key) ?? []), id]);
  }
  const rank = (k: string) => (k === "Owner" ? 0 : k === "Offline" ? 9 : k === "Member" ? 5 : 1);
  const files = (state.messages[convId] ?? []).flatMap((m) => (m.attachments ?? []).filter((a) => a.kind === "file").map((a) => ({ a, m })));

  return (
    <aside className="ds-plane" data-sheet={sheet || undefined} aria-label="Details">
      <header className="ds-plane-head">
        <span className="ds-label">{info.person ? "Profile" : info.members ? "Group" : "Channel"}</span>
        <button type="button" className="ds-icon-btn ds-icon-btn--sm" aria-label="Close details" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="ds-plane-scroll">
        {info.person ? (
          <ProfileCard personId={info.person.id} variant="panel" onEditProfile={onEditProfile} />
        ) : (
          <div className="ds-plane-about">
            <h3>{info.members ? info.title : `#${info.title}`}</h3>
            <p>{info.channel?.topic ?? `${ids.length} members`}</p>
            {info.space && <p className="ds-plane-meta">{info.space.name} · {info.space.description}</p>}
          </div>
        )}
        {[...byRole.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([role, list]) => (
          <section key={role} className="ds-plane-section">
            <p className="ds-label">{role} <span>{list.length}</span></p>
            {list.map((id) => {
              const p = state.people[id];
              const pres = effectivePresence(state, p);
              return (
                <button key={id} type="button" className="ds-member" data-off={pres === "offline" || undefined} onClick={(e) => onProfile(id, e.currentTarget, info.space?.id)} style={info.space?.roles[id] && ROLE_COLOR[info.space.roles[id]] ? ({ "--role": ROLE_COLOR[info.space.roles[id]] } as CSSProperties) : undefined}>
                  <Avatar person={p} size={28} presence={pres} />
                  <span className="ds-member-name">{p.name}{id === ME ? " (you)" : ""}</span>
                </button>
              );
            })}
          </section>
        ))}
        {files.length > 0 && (
          <section className="ds-plane-section">
            <p className="ds-label">Files <span>{files.length}</span></p>
            {files.map(({ a, m }, i) => (
              <div key={i} className="ds-file-row">
                <span className="ds-file-name">{a.kind === "file" ? a.name : ""}</span>
                <span className="ds-file-meta">{m.authorId === ME ? "You" : firstName(state.people[m.authorId])} · {clock(m.at)}</span>
              </div>
            ))}
          </section>
        )}
        <section className="ds-plane-section">
          <div className="st-row">
            <div className="st-row-text">
              <span className="st-label">Mute</span>
              <span className="st-hint">{muted ? "Muted. Mentions still show a badge." : "Notify me based on my settings."}</span>
            </div>
            <button type="button" role="switch" aria-checked={muted} aria-label="Mute" className="sw" onClick={() => actions.mute(convId)}><span className="sw-thumb" /></button>
          </div>
        </section>
      </div>
    </aside>
  );
}
