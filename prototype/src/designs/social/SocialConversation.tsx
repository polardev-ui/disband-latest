import { useMemo, useRef, useState } from "react";
import {
  AlertCircle, ChevronLeft, CornerUpLeft, Hash, Info, Lock, Paperclip, Phone, SendHorizontal, Smile, Video, WifiOff, X,
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
  convInfo, effectivePresence, firstName, fullTime, groupMessages, naturalTime, plainText, PRESENCE_LABEL, type ConvInfo,
} from "../../state/selectors";
import { useChat } from "../../state/store";

type C = ReturnType<typeof useConversation>;

export function Conversation({
  convId, highlight, onHighlight, onProfile, onChannelRef, onDetails, details, onBack,
}: {
  convId: string;
  highlight: string | null;
  onHighlight: (id: string) => void;
  onProfile: (id: string, el: HTMLElement, spaceId?: string) => void;
  onChannelRef: (name: string) => void;
  onDetails: () => void;
  details: boolean;
  onBack?: () => void;
}) {
  const c = useConversation(convId);
  const { state } = c;
  const toast = useToast();
  const info = convInfo(state, convId)!;
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountedAt = useMemo(() => Date.now(), [convId]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => groupMessages(c.messages), [c.messages]);
  // Times appear where the conversation pauses (20+ min) rather than under every run.
  const timeIds = useMemo(() => {
    const ids = new Set<string>();
    c.messages.forEach((m, i) => {
      const n = c.messages[i + 1];
      if (!n || n.at - m.at > 20 * 60_000 || new Date(n.at).toDateString() !== new Date(m.at).toDateString()) ids.add(m.id);
    });
    return ids;
  }, [c.messages]);
  const last = c.messages[c.messages.length - 1];
  useStickToBottom(scrollRef, convId, c.messages.length, last?.authorId === ME);
  const loading = state.scenario === "loading";
  const readOnly = info.channel?.readOnly && info.space?.ownerId !== ME;
  const showNames = info.conv.kind !== "dm";

  const call = () => toast("Calls aren't simulated in this prototype.");

  let who;
  if (info.person) {
    const pres = effectivePresence(state, info.person);
    who = (
      <button type="button" className="os-head-who" onClick={onDetails}>
        <Avatar person={info.person} size={40} presence={info.person.unavailable ? null : pres} />
        <span className="os-head-text">
          <span className="os-head-title">{info.title}</span>
          <span className="os-head-sub">
            {info.person.unavailable ? "This account isn't available" : pres === "online" ? (info.person.note ?? "Active now") : PRESENCE_LABEL[pres]}
          </span>
        </span>
      </button>
    );
  } else if (info.members) {
    who = (
      <button type="button" className="os-head-who" onClick={onDetails}>
        <GroupAvatar people={info.members} size={40} />
        <span className="os-head-text">
          <span className="os-head-title">{info.title}</span>
          <span className="os-head-sub">{info.members.map((m) => firstName(m)).join(", ")} and you</span>
        </span>
      </button>
    );
  } else {
    who = (
      <button type="button" className="os-head-who" onClick={onDetails}>
        <span className="os-head-hash"><Hash size={20} aria-hidden="true" /></span>
        <span className="os-head-text">
          <span className="os-head-title">{info.title}</span>
          <span className="os-head-sub">{info.space!.name}{info.channel?.topic ? ` · ${info.channel.topic}` : ""}</span>
        </span>
      </button>
    );
  }

  return (
    <section className="os-conv" aria-label={info.title}>
      <header className="os-head">
        {onBack && (
          <button type="button" className="os-icon-btn" aria-label="Back" onClick={onBack}><ChevronLeft size={24} /></button>
        )}
        {who}
        <div className="os-head-actions">
          {info.conv.kind !== "channel" && !info.person?.unavailable && (
            <>
              <button type="button" className="os-icon-btn" aria-label="Voice call" title="Voice call" onClick={call}><Phone size={20} /></button>
              <button type="button" className="os-icon-btn os-hide-sm" aria-label="Video call" title="Video call" onClick={call}><Video size={20} /></button>
            </>
          )}
          <button type="button" className="os-icon-btn" aria-label={details ? "Hide details" : "Show details"} aria-pressed={details} title="Details" onClick={onDetails}>
            <Info size={20} />
          </button>
        </div>
      </header>
      {state.scenario === "offline" && (
        <p className="os-offline" role="status"><WifiOff size={16} aria-hidden="true" /> No connection. Messages you send will wait until you're back online.</p>
      )}

      <div className="os-scroll" ref={scrollRef}>
        {loading ? (
          <SkeletonMessages />
        ) : (
          <div className="os-msgs" key={convId}>
            <Intro info={info} empty={c.messages.length === 0} />
            {rows.map((r) =>
              r.type === "day" ? (
                <p key={r.key} className="os-day" role="separator"><span>{r.label}</span></p>
              ) : (
                <Bubble
                  key={r.key}
                  msg={r.msg}
                  first={r.first}
                  last={r.last}
                  showTime={timeIds.has(r.msg.id)}
                  isNew={!!r.msg.local && r.msg.at >= mountedAt}
                  c={c}
                  info={info}
                  showName={showNames}
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
        <div className="os-composer">
          <p className="os-readonly"><Lock size={16} aria-hidden="true" /> Only {info.space!.name}'s organisers post here. You can still react.</p>
        </div>
      ) : (
        <Composer key={convId} convId={convId} c={c} disabled={loading} placeholder={info.conv.kind === "channel" ? `Message #${info.title}` : info.members ? `Message ${info.title}` : `Message ${firstName(info.person)}`} />
      )}
      {c.ctx && (() => {
        const m = c.byId(c.ctx.id);
        return m ? <ContextMenu at={c.ctx} msg={m} mine={m.authorId === ME} h={c.h} close={() => c.setCtx(null)} /> : null;
      })()}
      {c.confirmEl}
    </section>
  );
}

function Intro({ info, empty }: { info: ConvInfo; empty: boolean }) {
  if (info.person) {
    const p = info.person;
    return (
      <div className="os-intro">
        <Avatar person={p} size={72} />
        <h3>{p.unavailable ? "Profile unavailable" : p.name}</h3>
        {!p.unavailable && <p className="os-intro-sub">@{p.username}{p.pronouns ? ` · ${p.pronouns}` : ""}</p>}
        <p>{empty ? `You and ${firstName(p)} haven't talked yet. Say hi — they'll see it next time they open Disband.` : `This is where your conversation with ${firstName(p)} begins.`}</p>
      </div>
    );
  }
  if (info.members) {
    return (
      <div className="os-intro">
        <GroupAvatar people={info.members} size={72} />
        <h3>{info.title}</h3>
        <p>You, {info.members.map((m) => firstName(m)).join(", ")}. Everything said here stays between the {info.members.length + 1} of you.</p>
      </div>
    );
  }
  return (
    <div className="os-intro">
      <span className="os-intro-hash"><Hash size={30} aria-hidden="true" /></span>
      <h3>Welcome to #{info.title}</h3>
      <p>{empty ? `It's quiet so far. ${info.channel?.topic ?? ""}` : `${info.channel?.topic ?? ""} You're in ${info.space!.name}.`}</p>
    </div>
  );
}

function Bubble({
  msg, first, last, showTime, isNew, c, info, showName, highlight, onHighlight, onProfile, onChannelRef,
}: {
  msg: Message; first: boolean; last: boolean; showTime: boolean; isNew: boolean; c: C; info: ConvInfo; showName: boolean; highlight: boolean;
  onHighlight: (id: string) => void; onProfile: (id: string, el: HTMLElement) => void; onChannelRef: (n: string) => void;
}) {
  const { state } = c;
  const author = state.people[msg.authorId];
  const mine = msg.authorId === ME;
  const reply = c.byId(msg.replyToId);
  const replyAuthor = reply ? state.people[reply.authorId] : undefined;
  const editing = c.editingId === msg.id;
  const mentionsMe = !mine && /@polar\b/i.test(msg.text);
  const role = info.space?.roles[msg.authorId];
  const [tapped, setTapped] = useState(false);

  return (
    <div
      className="os-msg"
      data-msg-id={msg.id}
      data-mine={mine || undefined}
      data-first={first || undefined}
      data-last={last || undefined}
      data-new={isNew || undefined}
      data-highlight={highlight || undefined}
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
      {!mine && (
        <div className="os-msg-av">
          {last && (
            <button type="button" aria-label={`${author.name}'s profile`} onClick={(e) => onProfile(author.id, e.currentTarget)}>
              <Avatar person={author} size={30} />
            </button>
          )}
        </div>
      )}
      <div className="os-msg-col">
        {first && showName && !mine && (
          <button type="button" className="os-msg-name" onClick={(e) => onProfile(author.id, e.currentTarget)}>
            {author.unavailable ? "Deleted account" : author.name}
            {role && role !== "Member" && info.conv.kind === "channel" && <span className="os-msg-role">{role}</span>}
          </button>
        )}
        {reply && (
          <button type="button" className="os-quote" onClick={() => onHighlight(reply.id)}>
            <span className="os-quote-label"><CornerUpLeft size={12} aria-hidden="true" /> {mine ? "You" : firstName(author)} replied to {replyAuthor?.id === ME ? "you" : firstName(replyAuthor)}</span>
            <span className="os-quote-text">{plainText(reply.text)}</span>
          </button>
        )}
        <div className="os-bubble-row">
          <div className="os-bubble" data-mention={mentionsMe || undefined} data-failed={msg.failed || undefined} title={fullTime(msg.at)}>
            {editing ? (
              <InlineEditor initial={msg.text} onSave={(t) => c.saveEdit(msg, t)} onCancel={() => c.setEditingId(null)} />
            ) : (
              msg.text && <div className="os-text"><MessageText text={msg.text} people={state.people} onMention={onProfile} onChannel={onChannelRef} /></div>
            )}
            <Attachments items={msg.attachments} linkPreviews={state.prefs.linkPreviews} />
          </div>
          {!editing && (
            <MessageActions msg={msg} mine={mine} h={c.h} quick={2} menuOpen={c.menuFor === msg.id} setMenuOpen={(o) => c.setMenuFor(o ? msg.id : null)} />
          )}
        </div>
        <Reactions msg={msg} people={state.people} onToggle={(e) => c.h.react(msg, e)} />
        {msg.failed ? (
          <p className="os-failed" role="status">
            <AlertCircle size={14} aria-hidden="true" /> Didn't send
            <button type="button" onClick={() => c.h.retry(msg)}>Retry</button>
            <button type="button" onClick={() => c.h.remove(msg)}>Remove</button>
          </p>
        ) : (
          (showTime || msg.editedAt) && (
            <p className="os-msg-foot">
              {showTime && <time dateTime={new Date(msg.at).toISOString()}>{naturalTime(msg.at)}</time>}
              {msg.editedAt && <span title={`Edited ${fullTime(msg.editedAt)}`}>{showTime ? " · " : ""}Edited</span>}
            </p>
          )
        )}
      </div>
    </div>
  );
}

function Composer({ convId, c, placeholder, disabled }: { convId: string; c: C; placeholder: string; disabled?: boolean }) {
  const toast = useToast();
  const comp = useComposer({ convId, onSend: c.send, onEditLast: c.editLast, onCancel: c.replyTo ? () => c.setReplyTo(null) : undefined, maxPx: 180 });
  const [emoji, setEmoji] = useState(false);
  const emojiRef = useRef<HTMLButtonElement>(null);
  const replyAuthor = c.replyTo ? c.state.people[c.replyTo.authorId] : undefined;
  return (
    <div className="os-composer">
      {c.replyTo && (
        <div className="os-replying">
          <CornerUpLeft size={15} aria-hidden="true" />
          <span className="os-replying-text">
            Replying to <b>{replyAuthor?.id === ME ? "yourself" : firstName(replyAuthor)}</b>
            <span>{plainText(c.replyTo.text)}</span>
          </span>
          <button type="button" className="os-icon-btn os-icon-btn--sm" aria-label="Cancel reply" onClick={() => c.setReplyTo(null)}><X size={16} /></button>
        </div>
      )}
      {comp.files.length > 0 && (
        <div className="os-files">
          {comp.files.map((f, i) => (
            <span key={i} className="os-file-chip">
              <Paperclip size={13} aria-hidden="true" />{f.kind === "file" ? f.name : ""}
              <button type="button" aria-label="Remove attachment" onClick={() => comp.removeFile(i)}><X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="os-compose-row">
        <button type="button" className="os-round-btn" aria-label="Attach files" title="Attach files" disabled={disabled} onClick={() => { toast("Files you pick stay in this tab — nothing is uploaded."); comp.fileRef.current?.click(); }}>
          <Paperclip size={19} />
        </button>
        <input ref={comp.fileRef} type="file" multiple hidden onChange={comp.onFiles} />
        <div className="os-field" data-disabled={disabled || undefined}>
          <textarea
            ref={comp.ref}
            data-composer
            className="os-input"
            rows={1}
            value={comp.value}
            disabled={disabled}
            placeholder={disabled ? "Loading conversation…" : placeholder}
            aria-label={placeholder}
            onChange={(e) => comp.setValue(e.target.value)}
            onKeyDown={comp.onKeyDown}
          />
          <button ref={emojiRef} type="button" className="os-icon-btn os-icon-btn--sm" aria-label="Emoji" title="Emoji" disabled={disabled} onClick={() => setEmoji((v) => !v)}>
            <Smile size={20} />
          </button>
        </div>
        <button type="button" className="os-send" aria-label="Send message" disabled={!comp.canSend || disabled} onClick={comp.submit} data-ready={comp.canSend || undefined}>
          <SendHorizontal key={comp.pulse} size={19} className={comp.pulse ? "os-send-icon" : undefined} />
        </button>
      </div>
      {emoji && (
        <Popover anchor={emojiRef} onClose={() => setEmoji(false)} label="Insert emoji">
          <EmojiPicker onPick={(e) => { comp.insert(e); setEmoji(false); }} />
        </Popover>
      )}
    </div>
  );
}

// ── Details (side panel on desktop, bottom sheet on phones) ──────────────

export function Details({
  convId, onClose, onProfile, onEditProfile, sheet,
}: {
  convId: string; onClose: () => void; onProfile: (id: string, el: HTMLElement, spaceId?: string) => void; onEditProfile: () => void; sheet: boolean;
}) {
  const { state, actions } = useChat();
  const info = convInfo(state, convId);
  if (!info) return null;
  const muted = state.muted.includes(convId);
  const files = (state.messages[convId] ?? []).flatMap((m) => (m.attachments ?? []).filter((a) => a.kind === "file").map((a) => ({ a, m })));
  const ids = info.person ? [] : info.members ? [ME, ...info.members.map((m) => m.id)] : info.space!.memberIds;

  return (
    <aside className="os-details" data-sheet={sheet || undefined} aria-label="Details">
      {sheet && <span className="os-sheet-handle" aria-hidden="true" />}
      <button type="button" className="os-icon-btn os-details-close" aria-label="Close details" onClick={onClose}><X size={20} /></button>
      <div className="os-details-scroll">
        {info.person ? (
          <ProfileCard personId={info.person.id} variant="panel" onEditProfile={onEditProfile} />
        ) : (
          <div className="os-det-head">
            {info.members ? <GroupAvatar people={info.members} size={64} /> : <span className="os-intro-hash"><Hash size={26} aria-hidden="true" /></span>}
            <h3>{info.members ? info.title : `#${info.title}`}</h3>
            <p>{info.channel?.topic ?? `${ids.length} people`}{info.space ? ` · ${info.space.name}` : ""}</p>
          </div>
        )}
        {ids.length > 0 && (
          <section className="os-det-section">
            <h4>People here <span>{ids.length}</span></h4>
            <div className="os-det-people">
              {ids.map((id) => {
                const p = state.people[id];
                const pres = effectivePresence(state, p);
                return (
                  <button key={id} type="button" className="os-person" onClick={(e) => onProfile(id, e.currentTarget, info.space?.id)}>
                    <Avatar person={p} size={36} presence={pres} />
                    <span className="os-person-text">
                      <span className="os-person-name">{id === ME ? `${p.name} (you)` : p.name}</span>
                      <span className="os-person-sub">{info.space?.roles[id] && info.space.roles[id] !== "Member" ? info.space.roles[id] : PRESENCE_LABEL[pres]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {files.length > 0 && (
          <section className="os-det-section">
            <h4>Shared files <span>{files.length}</span></h4>
            {files.map(({ a, m }, i) => (
              <div key={i} className="os-det-file">
                <Paperclip size={15} aria-hidden="true" />
                <span>
                  <span className="os-det-file-name">{a.kind === "file" ? a.name : ""}</span>
                  <span className="os-det-file-meta">From {m.authorId === ME ? "you" : firstName(state.people[m.authorId])} · {naturalTime(m.at)}</span>
                </span>
              </div>
            ))}
          </section>
        )}
        <section className="os-det-section">
          <div className="st-row">
            <div className="st-row-text">
              <span className="st-label">Mute this conversation</span>
              <span className="st-hint">{muted ? "No notifications until you unmute." : "Notifications follow your settings."}</span>
            </div>
            <button type="button" role="switch" aria-checked={muted} aria-label="Mute this conversation" className="sw" onClick={() => actions.mute(convId)}>
              <span className="sw-thumb" />
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
