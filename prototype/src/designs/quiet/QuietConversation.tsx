import { useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, ArrowUp, BellOff, ChevronLeft, CornerUpLeft, Hash, Lock, PanelLeft, PanelRight, Phone, Plus,
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
  clock, convInfo, effectivePresence, fullTime, groupMessages, plainText, PRESENCE_LABEL, type ConvInfo,
} from "../../state/selectors";
import { useChat } from "../../state/store";

interface ConvProps {
  convId: string;
  highlight: string | null;
  onHighlight: (id: string) => void;
  onProfile: (personId: string, anchor: HTMLElement, spaceId?: string) => void;
  onChannelRef: (name: string) => void;
  details: boolean;
  onToggleDetails: () => void;
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
  onBack?: () => void;
  backTo?: { label: string; go: () => void } | null;
}

export function Conversation(p: ConvProps) {
  const c = useConversation(p.convId);
  const { state } = c;
  const toast = useToast();
  const info = convInfo(state, p.convId)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountedAt = useMemo(() => Date.now(), [p.convId]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => groupMessages(c.messages), [c.messages]);
  const last = c.messages[c.messages.length - 1];
  useStickToBottom(scrollRef, p.convId, c.messages.length, last?.authorId === ME);

  const loading = state.scenario === "loading";
  const readOnly = info.channel?.readOnly && info.space?.ownerId !== ME;
  const spaceId = info.space?.id;

  return (
    <section className="qc-main" aria-label={info.conv.kind === "channel" ? `#${info.title}` : info.title}>
      <ConvHeader info={info} {...p} />
      {state.scenario === "offline" && (
        <p className="qc-banner" role="status"><AlertCircle size={15} aria-hidden="true" /> You're offline. New messages will wait here until you reconnect.</p>
      )}
      {p.backTo && (
        <div className="qc-backto">
          <button type="button" onClick={p.backTo.go}><CornerUpLeft size={14} aria-hidden="true" /> Back to {p.backTo.label}</button>
        </div>
      )}
      <div className="qc-scroll" ref={scrollRef}>
        {loading ? (
          <SkeletonMessages />
        ) : (
          <div className="qc-msgs" key={p.convId}>
            <Beginning info={info} empty={c.messages.length === 0} />
            {rows.map((r) =>
              r.type === "day" ? (
                <div key={r.key} className="qc-day" role="separator" aria-label={r.label}><span>{r.label}</span></div>
              ) : (
                <MessageRow
                  key={r.key}
                  msg={r.msg}
                  first={r.first}
                  isNew={!!r.msg.local && r.msg.at >= mountedAt}
                  c={c}
                  info={info}
                  highlight={p.highlight === r.msg.id}
                  onHighlight={p.onHighlight}
                  onProfile={(id, el) => p.onProfile(id, el, spaceId)}
                  onChannelRef={p.onChannelRef}
                />
              ),
            )}
          </div>
        )}
      </div>
      {readOnly ? (
        <div className="qc-composer">
          <p className="qc-readonly"><Lock size={15} aria-hidden="true" /> Only the people who run {info.space!.name} can post in #{info.title}.</p>
        </div>
      ) : (
        <Composer
          key={p.convId}
          convId={p.convId}
          disabled={loading}
          placeholder={info.conv.kind === "channel" ? `Message #${info.title}` : `Message ${info.title}`}
          c={c}
          onAttachHint={() => toast("Files you pick stay in this tab — nothing is uploaded.")}
        />
      )}
      {c.ctx && (() => {
        const m = c.byId(c.ctx.id);
        return m ? <ContextMenu at={c.ctx} msg={m} mine={m.authorId === ME} h={c.h} close={() => c.setCtx(null)} /> : null;
      })()}
      {c.confirmEl}
    </section>
  );
}

function ConvHeader({ info, details, onToggleDetails, onToggleSidebar, sidebarCollapsed, onBack, onProfile }: ConvProps & { info: ConvInfo }) {
  const { state } = useChat();
  const toast = useToast();
  const muted = state.muted.includes(info.id);
  let title;
  if (info.person) {
    const pres = effectivePresence(state, info.person);
    title = (
      <button type="button" className="qc-head-who" onClick={(e) => onProfile(info.person!.id, e.currentTarget)}>
        <Avatar person={info.person} size={28} presence={info.person.unavailable ? null : pres} />
        <span className="qc-head-text">
          <h2 className="qc-head-title">{info.title}</h2>
          <span className="qc-head-sub">{info.person.unavailable ? "Account unavailable" : `${PRESENCE_LABEL[pres]}${info.person.note && pres !== "offline" ? ` · ${info.person.note}` : ""}`}</span>
        </span>
      </button>
    );
  } else if (info.members) {
    title = (
      <div className="qc-head-who qc-head-who--static">
        <GroupAvatar people={info.members} size={28} />
        <span className="qc-head-text">
          <h2 className="qc-head-title">{info.title}</h2>
          <span className="qc-head-sub">{info.members.length + 1} people · {info.members.map((m) => m.name.split(" ")[0]).join(", ")} and you</span>
        </span>
      </div>
    );
  } else {
    title = (
      <div className="qc-head-who qc-head-who--static">
        <Hash size={18} className="qc-head-hash" aria-hidden="true" />
        <span className="qc-head-text qc-head-text--inline">
          <h2 className="qc-head-title">{info.title}</h2>
          {info.channel?.topic && <span className="qc-head-topic">{info.channel.topic}</span>}
        </span>
      </div>
    );
  }
  return (
    <header className="qc-head">
      {onBack && (
        <button type="button" className="qc-icon-btn qc-back" aria-label="Back to list" onClick={onBack}>
          <ChevronLeft size={22} />
        </button>
      )}
      {onToggleSidebar && (
        <button type="button" className="qc-icon-btn qc-hide-mobile" aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"} data-tip={sidebarCollapsed ? "Show sidebar  ⌘\\" : "Hide sidebar  ⌘\\"} onClick={onToggleSidebar}>
          <PanelLeft size={18} />
        </button>
      )}
      {title}
      <div className="qc-head-actions">
        {muted && <BellOff size={16} className="qc-muted-icon" aria-label="Muted" />}
        {info.conv.kind !== "channel" && !info.person?.unavailable && (
          <>
            <button type="button" className="qc-icon-btn qc-hide-mobile" aria-label="Start voice call" data-tip="Voice call" onClick={() => toast("Calls aren't simulated in this prototype.")}>
              <Phone size={18} />
            </button>
            <button type="button" className="qc-icon-btn qc-hide-mobile" aria-label="Start video call" data-tip="Video call" onClick={() => toast("Calls aren't simulated in this prototype.")}>
              <Video size={18} />
            </button>
          </>
        )}
        <button type="button" className="qc-icon-btn" aria-label={details ? "Hide details" : "Show details"} aria-pressed={details} data-tip="Details" onClick={onToggleDetails}>
          <PanelRight size={18} />
        </button>
      </div>
    </header>
  );
}

function Beginning({ info, empty }: { info: ConvInfo; empty: boolean }) {
  if (info.person) {
    return (
      <div className="qc-begin">
        <Avatar person={info.person} size={48} />
        <h3>{info.person.unavailable ? "Profile unavailable" : info.person.name}</h3>
        <p>{empty ? `No messages yet. Say hello — this is the start of your conversation with ${info.person.name.split(" ")[0]}.` : `This is the start of your conversation with ${info.person.name.split(" ")[0]}.`}</p>
      </div>
    );
  }
  if (info.members) {
    return (
      <div className="qc-begin">
        <GroupAvatar people={info.members} size={48} />
        <h3>{info.title}</h3>
        <p>This is the start of the group with {info.members.map((m) => m.name.split(" ")[0]).join(", ")} and you.</p>
      </div>
    );
  }
  return (
    <div className="qc-begin">
      <span className="qc-begin-hash"><Hash size={22} aria-hidden="true" /></span>
      <h3>#{info.title}</h3>
      <p>{empty ? `Nothing here yet. ${info.channel?.topic ?? ""} Start the conversation.` : `This is the start of #${info.title} in ${info.space!.name}. ${info.channel?.topic ?? ""}`}</p>
    </div>
  );
}

type C = ReturnType<typeof useConversation>;

function MessageRow({
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
  const mentionsMe = !mine && /@polar\b/i.test(msg.text);
  const editing = c.editingId === msg.id;
  const [tapped, setTapped] = useState(false);

  return (
    <div
      className="qc-msg"
      data-msg-id={msg.id}
      data-first={first || undefined}
      data-new={isNew || undefined}
      data-highlight={highlight || undefined}
      data-mention={mentionsMe || undefined}
      data-failed={msg.failed || undefined}
      data-active={c.menuFor === msg.id || tapped || undefined}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("a, textarea")) return;
        e.preventDefault();
        c.setCtx({ id: msg.id, x: e.clientX, y: e.clientY });
      }}
      onClick={(e) => {
        if (window.matchMedia("(hover: none)").matches && !(e.target as HTMLElement).closest("button, a, textarea")) setTapped((v) => !v);
      }}
    >
      <div className="qc-msg-gutter">
        {first ? (
          <button type="button" className="qc-msg-av" aria-label={`${author.name}'s profile`} onClick={(e) => onProfile(author.id, e.currentTarget)}>
            <Avatar person={author} size={36} />
          </button>
        ) : (
          <time className="qc-msg-time-h" dateTime={new Date(msg.at).toISOString()} title={fullTime(msg.at)}>{clock(msg.at).replace(/\s?[AP]M/, "")}</time>
        )}
      </div>
      <div className="qc-msg-body">
        {reply && (
          <button type="button" className="qc-reply" onClick={() => onHighlight(reply.id)}>
            <CornerUpLeft size={13} aria-hidden="true" />
            <Avatar person={replyAuthor} size={16} />
            <span className="qc-reply-name">{replyAuthor?.id === ME ? "You" : replyAuthor?.name}</span>
            <span className="qc-reply-text">{plainText(reply.text)}</span>
          </button>
        )}
        {msg.replyToId && !reply && <p className="qc-reply qc-reply--gone">Original message was deleted</p>}
        {first && (
          <div className="qc-msg-meta">
            <button type="button" className="qc-msg-name" onClick={(e) => onProfile(author.id, e.currentTarget)}>
              {author.unavailable ? "Deleted account" : author.name}
            </button>
            {role && info.conv.kind === "channel" && role !== "Member" && <span className="qc-msg-role">{role}</span>}
            <time dateTime={new Date(msg.at).toISOString()} title={fullTime(msg.at)}>{clock(msg.at)}</time>
          </div>
        )}
        {editing ? (
          <InlineEditor initial={msg.text} onSave={(t) => c.saveEdit(msg, t)} onCancel={() => c.setEditingId(null)} />
        ) : (
          msg.text && (
            <div className="qc-msg-text">
              <MessageText text={msg.text} people={state.people} onMention={onProfile} onChannel={onChannelRef} />
              {msg.editedAt && <span className="qc-edited" title={`Edited ${fullTime(msg.editedAt)}`}> (edited)</span>}
            </div>
          )
        )}
        <Attachments items={msg.attachments} linkPreviews={state.prefs.linkPreviews} />
        <Reactions msg={msg} people={state.people} onToggle={(e) => c.h.react(msg, e)} />
        {msg.failed && (
          <p className="qc-failed" role="status">
            <AlertCircle size={14} aria-hidden="true" /> Not sent.
            <button type="button" onClick={() => c.h.retry(msg)}>Try again</button>
            <button type="button" onClick={() => c.h.remove(msg)}>Delete</button>
          </p>
        )}
      </div>
      {!editing && (
        <MessageActions msg={msg} mine={mine} h={c.h} menuOpen={c.menuFor === msg.id} setMenuOpen={(o) => c.setMenuFor(o ? msg.id : null)} />
      )}
    </div>
  );
}

function Composer({ convId, placeholder, c, disabled, onAttachHint }: { convId: string; placeholder: string; c: C; disabled?: boolean; onAttachHint: () => void }) {
  const comp = useComposer({
    convId,
    onSend: c.send,
    onEditLast: c.editLast,
    onCancel: c.replyTo ? () => c.setReplyTo(null) : undefined,
  });
  const [emoji, setEmoji] = useState(false);
  const emojiRef = useRef<HTMLButtonElement>(null);
  const replyAuthor = c.replyTo ? c.state.people[c.replyTo.authorId] : undefined;

  return (
    <div className="qc-composer">
      <div className="qc-field" data-disabled={disabled || undefined} data-replying={!!c.replyTo || undefined}>
        {c.replyTo && (
          <div className="qc-replybar">
            <span className="qc-replybar-label">Replying to <b>{replyAuthor?.id === ME ? "yourself" : replyAuthor?.name}</b></span>
            <span className="qc-replybar-text">{plainText(c.replyTo.text)}</span>
            <button type="button" className="qc-icon-btn qc-icon-btn--sm" aria-label="Cancel reply" onClick={() => c.setReplyTo(null)}>
              <X size={15} />
            </button>
          </div>
        )}
        {comp.files.length > 0 && (
          <div className="qc-files">
            {comp.files.map((f, i) => (
              <span key={i} className="qc-file-chip">
                {f.kind === "file" ? f.name : ""}
                <button type="button" aria-label={`Remove ${f.kind === "file" ? f.name : "attachment"}`} onClick={() => comp.removeFile(i)}><X size={13} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="qc-field-row">
          <button type="button" className="qc-icon-btn" aria-label="Attach files" data-tip="Attach" disabled={disabled} onClick={() => { onAttachHint(); comp.fileRef.current?.click(); }}>
            <Plus size={19} />
          </button>
          <input ref={comp.fileRef} type="file" multiple hidden onChange={comp.onFiles} />
          <textarea
            ref={comp.ref}
            data-composer
            className="qc-input"
            rows={1}
            value={comp.value}
            disabled={disabled}
            placeholder={disabled ? "Loading…" : placeholder}
            aria-label={placeholder}
            onChange={(e) => comp.setValue(e.target.value)}
            onKeyDown={comp.onKeyDown}
          />
          <button ref={emojiRef} type="button" className="qc-icon-btn" aria-label="Emoji" data-tip="Emoji" disabled={disabled} onClick={() => setEmoji((v) => !v)}>
            <Smile size={19} />
          </button>
          <button
            type="button"
            className="qc-send"
            aria-label="Send message"
            disabled={!comp.canSend || disabled}
            onClick={comp.submit}
          >
            <ArrowUp key={comp.pulse} size={17} className={comp.pulse ? "qc-send-icon" : undefined} />
          </button>
        </div>
      </div>
      <p className="qc-hint" aria-hidden="true"><kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line · <kbd>↑</kbd> to edit your last message</p>
      {emoji && (
        <Popover anchor={emojiRef} onClose={() => setEmoji(false)} label="Insert emoji">
          <EmojiPicker onPick={(e) => { comp.insert(e); setEmoji(false); }} />
        </Popover>
      )}
    </div>
  );
}

// ── Details panel ─────────────────────────────────────────────────────

export function Details({
  convId, onClose, onProfile, onEditProfile, overlay,
}: {
  convId: string; onClose: () => void;
  onProfile: (id: string, el: HTMLElement, spaceId?: string) => void; onEditProfile: () => void; overlay: boolean;
}) {
  const { state, actions } = useChat();
  const info = convInfo(state, convId);
  if (!info) return null;
  const muted = state.muted.includes(convId);
  const files = (state.messages[convId] ?? []).flatMap((m) => (m.attachments ?? []).filter((a) => a.kind === "file").map((a) => ({ a, m })));

  let body;
  if (info.person) {
    body = <ProfileCard personId={info.person.id} variant="panel" onEditProfile={onEditProfile} />;
  } else {
    const ids = info.members ? [...info.members.map((m) => m.id), ME] : info.space!.memberIds;
    const people = ids.map((id) => state.people[id]);
    const online = people.filter((p) => effectivePresence(state, p) !== "offline");
    const offline = people.filter((p) => effectivePresence(state, p) === "offline");
    body = (
      <>
        <div className="qc-det-about">
          <h3 className="qc-det-title">{info.conv.kind === "channel" ? `#${info.title}` : info.title}</h3>
          <p className="qc-det-text">{info.channel?.topic ?? `A group with ${people.length} people.`}</p>
          {info.space && <p className="qc-det-meta">In {info.space.name} · {info.space.description}</p>}
        </div>
        {[{ label: "Online", list: online }, { label: "Offline", list: offline }].map((g) =>
          g.list.length ? (
            <div key={g.label} className="qc-det-section">
              <p className="qc-label">{g.label} — {g.list.length}</p>
              {g.list.map((p) => (
                <button key={p.id} type="button" className="qc-member" onClick={(e) => onProfile(p.id, e.currentTarget, info.space?.id)}>
                  <Avatar person={p} size={28} presence={effectivePresence(state, p)} />
                  <span className="qc-member-name">{p.id === ME ? `${p.name} (you)` : p.name}</span>
                  {info.space && info.space.roles[p.id] && info.space.roles[p.id] !== "Member" && <span className="qc-member-role">{info.space.roles[p.id]}</span>}
                </button>
              ))}
            </div>
          ) : null,
        )}
      </>
    );
  }

  return (
    <aside className="qc-details" data-overlay={overlay || undefined} aria-label="Conversation details">
      <header className="qc-det-head">
        <p className="qc-det-heading">{info.person ? "Profile" : info.conv.kind === "channel" ? "Channel" : "Group"}</p>
        <button type="button" className="qc-icon-btn" aria-label="Close details" onClick={onClose}>
          {overlay ? <ArrowLeft size={18} className="qc-only-mobile" /> : null}
          <X size={18} className={overlay ? "qc-hide-mobile" : undefined} />
        </button>
      </header>
      <div className="qc-det-scroll">
        {body}
        {files.length > 0 && (
          <div className="qc-det-section">
            <p className="qc-label">Shared files</p>
            {files.map(({ a, m }, i) => (
              <div key={i} className="qc-det-file">
                <span className="qc-det-file-name">{a.kind === "file" ? a.name : ""}</span>
                <span className="qc-det-file-meta">{state.people[m.authorId]?.name.split(" ")[0]} · {clock(m.at)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="qc-det-section">
          <label className="qc-det-toggle">
            <span>
              <span className="qc-det-toggle-label">Mute notifications</span>
              <span className="qc-det-toggle-hint">{muted ? "You won't be notified about new messages." : "You'll be notified based on your settings."}</span>
            </span>
            <button type="button" role="switch" aria-checked={muted} className="sw" onClick={() => actions.mute(convId)} aria-label="Mute notifications">
              <span className="sw-thumb" />
            </button>
          </label>
        </div>
      </div>
    </aside>
  );
}
