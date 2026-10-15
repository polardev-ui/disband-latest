import "@fontsource-variable/figtree";
import "./social.css";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Check, ChevronDown, ChevronLeft, Hash, Lock, MessageCircle, MessagesSquare, Search, Settings as SettingsIcon, UserPlus, Users,
  UsersRound, Volume2,
} from "lucide-react";
import { Avatar, GroupAvatar, SpaceIcon } from "../../components/Avatar";
import { useConfirm } from "../../components/Confirm";
import { Popover, PortalRoot } from "../../components/Popover";
import { ProfileCard } from "../../components/ProfileCard";
import { SearchPanel } from "../../components/SearchPanel";
import { Settings, type SettingsSection } from "../../components/Settings";
import { SkeletonList } from "../../components/Skeleton";
import { ToastRegion, useToast } from "../../components/Toast";
import { useAddFriend, useFriendLists, useJoinSpace } from "../../components/useFriends";
import { CHANNELS, ME, SPACES } from "../../data/seed";
import type { Person, Presence } from "../../data/types";
import {
  useEscape, useHighlight, useMediaQuery, useModKey, useOutsideClick, usePlainKey, useResolvedMotion, useResolvedTheme,
} from "../../lib/hooks";
import {
  dmUnread, effectivePresence, firstName, firstTextChannel, listTime, PRESENCE_LABEL, previewText, recentConversations,
  spaceChannels, spaceUnread, type SearchHit,
} from "../../state/selectors";
import { useChat } from "../../state/store";
import { Conversation, Details } from "./SocialConversation";

type Tab = "chats" | "spaces" | "friends" | "you";

export default function SocialApp() {
  const { state, actions } = useChat();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const theme = useResolvedTheme(state.prefs.themes.social);
  const motion = useResolvedMotion(state.prefs.motion);
  const mobile = useMediaQuery("(max-width: 759px)");
  const wide = useMediaQuery("(min-width: 1180px)");

  const [tab, setTab] = useState<Tab>("chats");
  const [space, setSpace] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>("g-ramen");
  const [details, setDetails] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [profile, setProfile] = useState<{ id: string; el: HTMLElement; spaceId?: string } | null>(null);
  const [mobileChat, setMobileChat] = useState(false);
  const [highlight, setHighlight] = useHighlight();
  const profileAnchor = useRef<HTMLElement | null>(null);
  profileAnchor.current = profile?.el ?? null;

  const active = useMemo(() => {
    if (!convId) return null;
    const c = state.conversations[convId];
    if (!c) return null;
    if (c.kind === "channel") return state.spaces.includes(c.spaceId) ? convId : null;
    return state.recent.includes(convId) ? convId : null;
  }, [convId, state]);

  useEffect(() => {
    if (space && !state.spaces.includes(space)) setSpace(null);
  }, [space, state.spaces]);

  useModKey("k", () => setSearchOpen((v) => !v));
  usePlainKey("/", () => setSearchOpen(true));
  useModKey(",", () => setSettings("profile"));
  useEscape(() => setSearchOpen(false), searchOpen);

  const open = (id: string) => {
    const c = state.conversations[id];
    if (!c) return;
    setConvId(id);
    if (c.kind === "channel") {
      setTab("spaces");
      setSpace(c.spaceId);
    } else if (tab === "spaces") setTab("chats");
    if (mobile) setMobileChat(true);
  };

  const message = (personId: string) => {
    setProfile(null);
    open(actions.openDm(personId));
  };

  const pick = (hit: SearchHit) => {
    setSearchOpen(false);
    if (hit.kind === "person") message(hit.person.id);
    else if (hit.kind === "place") {
      if (hit.convId) open(hit.convId);
      else if (hit.spaceId) {
        setTab("spaces");
        setSpace(hit.spaceId);
        if (!mobile) open(firstTextChannel(SPACES[hit.spaceId]));
      }
    } else {
      open(hit.msg.convId);
      window.setTimeout(() => setHighlight(hit.msg.id), 60);
    }
  };

  const onChannelRef = (name: string) => {
    const ch = Object.values(CHANNELS).find((c) => c.name === name && state.spaces.includes(c.spaceId));
    if (ch) open(ch.id);
  };
  const onProfile = (id: string, el: HTMLElement, spaceId?: string) => setProfile({ id, el, spaceId });

  const showDetails = details && !!active;
  useEscape(() => setDetails(false), showDetails && !wide && !profile && !searchOpen && !settings);

  const conversation = active ? (
    <Conversation
      convId={active}
      highlight={highlight}
      onHighlight={setHighlight}
      onProfile={onProfile}
      onChannelRef={onChannelRef}
      details={showDetails}
      onDetails={() => setDetails((v) => !v)}
      onBack={mobile ? () => { setMobileChat(false); setDetails(false); } : undefined}
    />
  ) : null;

  const sideBody = (
    <SideBody
      tab={tab}
      space={space}
      setSpace={setSpace}
      active={active}
      onOpen={open}
      onMessage={message}
      onProfile={onProfile}
      setTab={setTab}
      onSettings={(s) => setSettings(s)}
      mobile={mobile}
    />
  );

  const search = (
    <SearchPanel onPick={pick} onClose={() => setSearchOpen(false)} placeholder="Find people, chats, messages" footer={!mobile} />
  );

  return (
    <div ref={setRoot} className="os design-root" data-theme={theme} data-motion={motion} data-text={state.prefs.textSize}>
      <PortalRoot.Provider value={root}>
        {mobile ? (
          <div className="os-mobile">
            {mobileChat && active ? (
              <div className="os-screen os-screen--chat" key={`c-${active}`}>
                {conversation}
                {showDetails && (
                  <div className="os-sheet-scrim" onPointerDown={(e) => e.target === e.currentTarget && setDetails(false)}>
                    <Details convId={active} sheet onClose={() => setDetails(false)} onProfile={onProfile} onEditProfile={() => setSettings("profile")} />
                  </div>
                )}
              </div>
            ) : (
              <div className="os-screen" key={`t-${tab}-${space ?? ""}`}>
                <header className="os-mtop">
                  <h1>{tab === "chats" ? "Chats" : tab === "spaces" ? (space ? SPACES[space].name : "Spaces") : tab === "friends" ? "Friends" : "You"}</h1>
                  <button type="button" className="os-icon-btn" aria-label="Search" onClick={() => setSearchOpen(true)}><Search size={21} /></button>
                </header>
                {sideBody}
                <BottomNav tab={tab} setTab={(t) => { setTab(t); setSpace(null); }} />
              </div>
            )}
            {searchOpen && <div className="os-msearch">{search}</div>}
          </div>
        ) : (
          <div className="os-shell" data-details={(showDetails && wide) || undefined}>
            <aside className="os-side" aria-label="Navigation">
              <SideTop onSettings={() => setSettings("profile")} onProfile={onProfile} />
              <SearchBox open={searchOpen} setOpen={setSearchOpen}>{search}</SearchBox>
              <Tabs tab={tab} setTab={(t) => { setTab(t); if (t !== "spaces") setSpace(null); }} />
              {sideBody}
            </aside>
            <main className="os-main">
              {conversation ?? <Welcome onFriends={() => setTab("friends")} onJoined={(id) => { setTab("spaces"); setSpace(id); open(firstTextChannel(SPACES[id])); }} onProfile={() => setSettings("profile")} />}
            </main>
            <div className="os-det-wrap">
              {showDetails && (
                <Details convId={active!} sheet={false} onClose={() => setDetails(false)} onProfile={onProfile} onEditProfile={() => setSettings("profile")} />
              )}
            </div>
          </div>
        )}

        {profile && (
          <Popover anchor={profileAnchor} onClose={() => setProfile(null)} align="start" className="os-profile-pop" label="Profile">
            <ProfileCard personId={profile.id} spaceId={profile.spaceId} onMessage={message} onEditProfile={() => { setProfile(null); setSettings("profile"); }} />
          </Popover>
        )}
        {settings && (
          <div className="os-scrim" onPointerDown={(e) => e.target === e.currentTarget && setSettings(null)}>
            <div className="os-settings" role="dialog" aria-modal="true" aria-label="Settings">
              <SettingsDialog initial={settings} onClose={() => setSettings(null)} />
            </div>
          </div>
        )}
        <ToastRegion />
      </PortalRoot.Provider>
    </div>
  );
}

function SettingsDialog({ initial, onClose }: { initial: SettingsSection; onClose: () => void }) {
  useEscape(onClose);
  return <Settings design="social" initial={initial} onClose={onClose} />;
}

// ── Sidebar pieces ────────────────────────────────────────────────────

function SideTop({ onSettings, onProfile }: { onSettings: () => void; onProfile: (id: string, el: HTMLElement) => void }) {
  const { state } = useChat();
  const me = state.people[ME];
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <header className="os-side-top">
      <span className="os-brand"><img src="/logo.png" alt="" width={20} height={20} /> Disband</span>
      <button type="button" className="os-icon-btn" aria-label="Settings" title="Settings" onClick={onSettings}><SettingsIcon size={19} /></button>
      <button ref={ref} type="button" className="os-me" aria-haspopup="menu" aria-expanded={menu} aria-label={`Your status: ${PRESENCE_LABEL[effectivePresence(state, me)]}`} onClick={() => setMenu((v) => !v)}>
        <Avatar person={me} size={32} presence={effectivePresence(state, me)} />
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {menu && (
        <Popover anchor={ref} onClose={() => setMenu(false)} className="os-status-pop" label="Your status">
          <StatusMenu close={() => setMenu(false)} onView={() => { setMenu(false); onProfile(ME, ref.current!); }} />
        </Popover>
      )}
    </header>
  );
}

function StatusMenu({ close, onView }: { close: () => void; onView: () => void }) {
  const { state, actions } = useChat();
  const me = state.people[ME];
  const current: Presence | "invisible" = state.prefs.appearOffline ? "invisible" : me.presence;
  const [note, setNote] = useState(me.note ?? "");
  const opts: { v: Presence | "invisible"; label: string }[] = [
    { v: "online", label: "Online" },
    { v: "idle", label: "Away" },
    { v: "dnd", label: "Do not disturb" },
    { v: "invisible", label: "Appear offline" },
  ];
  return (
    <div className="menu os-status" role="menu">
      <form
        className="os-status-note"
        onSubmit={(e) => {
          e.preventDefault();
          actions.setMe({ note: note.trim() || undefined });
          close();
        }}
      >
        <label htmlFor="os-note" className="os-status-label">What are you up to?</label>
        <input id="os-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Add a status note" />
      </form>
      {opts.map((o) => (
        <button key={o.v} type="button" role="menuitemradio" aria-checked={current === o.v} className="menu-item" onClick={() => {
          if (o.v === "invisible") actions.setPrefs({ appearOffline: true });
          else { actions.setPrefs({ appearOffline: false }); actions.setMe({ presence: o.v }); }
          close();
        }}>
          <span className="pc-dot" data-p={o.v === "invisible" ? "offline" : o.v} aria-hidden="true" />
          <span className="menu-item-text">{o.label}</span>
          {current === o.v && <Check size={15} className="menu-check" aria-hidden="true" />}
        </button>
      ))}
      <button type="button" className="menu-item" onClick={onView}>View your profile</button>
    </div>
  );
}

function SearchBox({ open, setOpen, children }: { open: boolean; setOpen: (v: boolean) => void; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  useOutsideClick([wrap], () => setOpen(false), open);
  return (
    <div className="os-searchbox" ref={wrap}>
      {open ? (
        <div className="os-search-drop" role="dialog" aria-label="Search">{children}</div>
      ) : (
        <button type="button" className="os-search-trigger" onClick={() => setOpen(true)}>
          <Search size={17} aria-hidden="true" />
          <span>Find people, chats, messages</span>
          <kbd>/</kbd>
        </button>
      )}
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { state } = useChat();
  const dms = dmUnread(state);
  const spaceCount = state.spaces.reduce((n, id) => n + spaceUnread(state, id).count, 0);
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "chats", label: "Chats", n: dms },
    { id: "spaces", label: "Spaces", n: spaceCount },
    { id: "friends", label: "Friends", n: state.incoming.length },
  ];
  const idx = Math.max(0, tabs.findIndex((t) => t.id === tab));
  return (
    <div className="os-tabs" role="tablist" aria-label="Sections" style={{ "--i": idx } as CSSProperties}>
      <span className="os-tabs-thumb" aria-hidden="true" />
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="os-tab" onClick={() => setTab(t.id)}>
          {t.label}
          {!!t.n && <span className="os-tab-n" aria-label={`${t.n} new`}>{t.n}</span>}
        </button>
      ))}
    </div>
  );
}

function SideBody({
  tab, space, setSpace, active, onOpen, onMessage, onProfile, setTab, onSettings, mobile,
}: {
  tab: Tab; space: string | null; setSpace: (s: string | null) => void; active: string | null; onOpen: (id: string) => void;
  onMessage: (id: string) => void; onProfile: (id: string, el: HTMLElement, spaceId?: string) => void; setTab: (t: Tab) => void;
  onSettings: (s: SettingsSection) => void; mobile: boolean;
}) {
  const { state } = useChat();
  const loading = state.scenario === "loading";
  return (
    <div className="os-side-body" key={`${tab}-${space ?? ""}`} data-dir={space ? "in" : "out"}>
      {loading ? (
        <SkeletonList />
      ) : tab === "chats" ? (
        <ChatsTab active={active} onOpen={onOpen} onMessage={onMessage} onFriends={() => setTab("friends")} />
      ) : tab === "spaces" ? (
        space ? <SpaceChannels spaceId={space} active={active} onOpen={onOpen} onBack={() => setSpace(null)} /> : <SpacesTab onPick={(id) => { setSpace(id); if (!mobile) onOpen(firstTextChannel(SPACES[id])); }} />
      ) : tab === "friends" ? (
        <FriendsTab onMessage={onMessage} onProfile={onProfile} />
      ) : (
        <YouTab onSettings={onSettings} />
      )}
    </div>
  );
}

function ActiveNow({ onMessage }: { onMessage: (id: string) => void }) {
  const lists = useFriendLists();
  const { state } = useChat();
  const online = lists.online.filter((p) => effectivePresence(state, p) === "online");
  if (!online.length) return null;
  return (
    <section className="os-active" aria-labelledby="os-active-h">
      <h2 id="os-active-h" className="os-section-h">Active now</h2>
      <div className="os-active-row">
        {online.map((p) => (
          <button key={p.id} type="button" className="os-active-person" onClick={() => onMessage(p.id)} title={p.note ? `${p.name} — ${p.note}` : p.name}>
            <Avatar person={p} size={48} presence="online" />
            <span>{firstName(p)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChatsTab({ active, onOpen, onMessage, onFriends }: { active: string | null; onOpen: (id: string) => void; onMessage: (id: string) => void; onFriends: () => void }) {
  const { state } = useChat();
  const items = recentConversations(state);
  return (
    <>
      <ActiveNow onMessage={onMessage} />
      <section className="os-recent" aria-labelledby="os-recent-h">
        <h2 id="os-recent-h" className="os-section-h">Recent</h2>
        {items.length === 0 ? (
          <div className="os-empty">
            <UsersRound size={28} aria-hidden="true" />
            <p className="os-empty-title">No chats yet</p>
            <p>Once you add friends, your conversations with them land here.</p>
            <button type="button" className="btn btn--primary btn--sm" onClick={onFriends}><UserPlus size={16} aria-hidden="true" /> Find friends</button>
          </div>
        ) : (
          <ul className="os-list">
            {items.map((r) => {
              const p = r.info.person;
              const pres = p ? effectivePresence(state, p) : null;
              return (
                <li key={r.info.id}>
                  <button type="button" className="os-chat" aria-current={active === r.info.id ? "true" : undefined} data-unread={r.unread > 0 || undefined} onClick={() => onOpen(r.info.id)}>
                    {p ? <Avatar person={p} size={44} presence={pres} /> : <GroupAvatar people={r.info.members!} size={44} />}
                    <span className="os-chat-main">
                      <span className="os-chat-top">
                        <span className="os-chat-name">{r.info.title}</span>
                        {r.last && <time>{listTime(r.last.at)}</time>}
                      </span>
                      <span className="os-chat-bottom">
                        <span className="os-chat-preview">{previewText(state, r.last, { group: r.info.conv.kind === "group" })}</span>
                        {r.mention ? <span className="os-count os-count--mention" aria-label="Mentions you">@</span> : r.unread > 0 ? <span className={`os-count${r.muted ? " os-count--muted" : ""}`} aria-label={`${r.unread} unread`}>{r.unread}</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function SpacesTab({ onPick }: { onPick: (id: string) => void }) {
  const { state } = useChat();
  return (
    <section className="os-recent">
      {state.spaces.length === 0 ? (
        <div className="os-empty">
          <Hash size={28} aria-hidden="true" />
          <p className="os-empty-title">No spaces yet</p>
          <p>Spaces are shared places for a group — a club, a team, a server of friends. Paste an invite to join one.</p>
          <JoinForm onJoined={onPick} />
        </div>
      ) : (
        <ul className="os-list">
          {state.spaces.map((id) => {
            const s = SPACES[id];
            const u = spaceUnread(state, id);
            const voice = spaceChannels(s).filter((c) => c.kind === "voice" && c.inVoice?.length);
            const busiest = spaceChannels(s).filter((c) => (state.unread[c.id] ?? 0) > 0).sort((a, b) => (state.unread[b.id] ?? 0) - (state.unread[a.id] ?? 0))[0];
            const activity = [
              busiest ? `${state.unread[busiest.id]} new in #${busiest.name}` : null,
              voice[0] ? `${voice[0].inVoice!.map((pid) => firstName(state.people[pid])).join(" & ")} in ${voice[0].name}` : null,
            ].filter(Boolean).join(" · ");
            return (
              <li key={id}>
                <button type="button" className="os-chat" data-unread={u.count > 0 || undefined} onClick={() => onPick(id)}>
                  <SpaceIcon space={s} size={44} />
                  <span className="os-chat-main">
                    <span className="os-chat-top"><span className="os-chat-name">{s.name}</span></span>
                    <span className="os-chat-bottom">
                      <span className="os-chat-preview">{activity || s.description}</span>
                      {u.mention && <span className="os-count os-count--mention" aria-label="Mentions you">@</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SpaceChannels({ spaceId, active, onOpen, onBack }: { spaceId: string; active: string | null; onOpen: (id: string) => void; onBack: () => void }) {
  const { state } = useChat();
  const toast = useToast();
  const s = SPACES[spaceId];
  const online = s.memberIds.filter((id) => effectivePresence(state, state.people[id]) !== "offline").length;
  return (
    <section className="os-space">
      <button type="button" className="os-back" onClick={onBack}><ChevronLeft size={18} aria-hidden="true" /> All spaces</button>
      <div className="os-space-head">
        <SpaceIcon space={s} size={48} />
        <div>
          <h2>{s.name}</h2>
          <p>{s.memberIds.length} members · <span className="os-online-dot" aria-hidden="true" />{online} online</p>
        </div>
      </div>
      {s.categories.map((cat) => (
        <div key={cat.id} className="os-cat">
          <h3 className="os-section-h">{cat.name}</h3>
          {cat.channelIds.map((id) => {
            const ch = CHANNELS[id];
            if (ch.kind === "voice") {
              const here = ch.inVoice ?? [];
              return (
                <button key={id} type="button" className="os-channel os-channel--voice" onClick={() => toast("Voice channels aren't simulated in this prototype.")}>
                  <Volume2 size={18} aria-hidden="true" />
                  <span className="os-channel-name">{ch.name}</span>
                  {here.length > 0 ? (
                    <span className="os-voice-faces" title={`${here.map((p) => state.people[p].name).join(", ")} ${here.length === 1 ? "is" : "are"} here`}>
                      {here.map((p) => <Avatar key={p} person={state.people[p]} size={22} />)}
                    </span>
                  ) : (
                    <span className="os-channel-meta">Empty</span>
                  )}
                </button>
              );
            }
            const unread = state.unread[id] ?? 0;
            return (
              <button key={id} type="button" className="os-channel" aria-current={active === id ? "true" : undefined} data-unread={unread > 0 || undefined} onClick={() => onOpen(id)}>
                <Hash size={18} aria-hidden="true" />
                <span className="os-channel-name">{ch.name}</span>
                {ch.readOnly && <Lock size={13} aria-label="Read-only" className="os-channel-lock" />}
                {state.mentions[id] ? <span className="os-count os-count--mention">@</span> : unread > 0 ? <span className="os-count">{unread}</span> : null}
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function FriendsTab({ onMessage, onProfile }: { onMessage: (id: string) => void; onProfile: (id: string, el: HTMLElement) => void }) {
  const { state, actions } = useChat();
  const toast = useToast();
  const lists = useFriendLists();
  const add = useAddFriend();
  const [confirmEl, ask] = useConfirm();
  const [name, setName] = useState("");
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const offline = lists.all.filter((p) => !lists.online.includes(p));

  const person = (p: Person, trailing: ReactNode, sub?: string) => (
    <li key={p.id} className="os-friend">
      <button type="button" className="os-friend-who" onClick={(e) => onProfile(p.id, e.currentTarget)}>
        <Avatar person={p} size={40} presence={effectivePresence(state, p)} />
        <span className="os-chat-main">
          <span className="os-chat-name">{p.name}</span>
          <span className="os-chat-preview">{sub ?? (p.note && effectivePresence(state, p) !== "offline" ? p.note : PRESENCE_LABEL[effectivePresence(state, p)])}</span>
        </span>
      </button>
      <span className="os-friend-actions">{trailing}</span>
    </li>
  );

  return (
    <div className="os-friends">
      <form className="os-addfriend" onSubmit={(e) => { e.preventDefault(); const r = add(name); setRes(r); if (r.ok) setName(""); }}>
        <label htmlFor="os-add" className="os-section-h">Add a friend</label>
        <div className="os-addfriend-row">
          <span className="input-wrap">
            <span className="input-prefix">@</span>
            <input id="os-add" className="input" value={name} onChange={(e) => { setName(e.target.value); setRes(null); }} placeholder="their username" autoComplete="off" />
          </span>
          <button type="submit" className="btn btn--primary btn--sm" disabled={!name.trim()}>Add</button>
        </div>
        <p className={`os-add-res${res ? (res.ok ? " is-ok" : " is-error") : ""}`} role="status">{res?.text ?? "Try marcushale or ren.ito"}</p>
      </form>

      {(lists.incoming.length > 0 || lists.outgoing.length > 0) && (
        <section>
          <h2 className="os-section-h">Requests</h2>
          <ul className="os-list">
            {lists.incoming.map((p) => person(p, (
              <>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => { actions.friend("accept", p.id); toast(`You and ${firstName(p)} are friends now`); }}>Accept</button>
                <button type="button" className="btn btn--ghost btn--sm" aria-label={`Decline ${p.name}`} onClick={() => actions.friend("decline", p.id)}>Decline</button>
              </>
            ), "Wants to be your friend"))}
            {lists.outgoing.map((p) => person(p, (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.friend("cancel", p.id)}>Cancel</button>
            ), "Waiting for them to accept"))}
          </ul>
        </section>
      )}

      {lists.all.length === 0 ? (
        <div className="os-empty">
          <UsersRound size={28} aria-hidden="true" />
          <p className="os-empty-title">Your friends list is empty</p>
          <p>Add someone by username above. When they accept, you'll see when they're around.</p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="os-section-h">Online <span>{lists.online.length}</span></h2>
            <ul className="os-list">
              {lists.online.map((p) => person(p, (
                <button type="button" className="os-icon-btn" aria-label={`Message ${p.name}`} title="Message" onClick={() => onMessage(p.id)}><MessageCircle size={19} /></button>
              )))}
            </ul>
          </section>
          {offline.length > 0 && (
            <section>
              <h2 className="os-section-h">Offline <span>{offline.length}</span></h2>
              <ul className="os-list">
                {offline.map((p) => person(p, (
                  <button type="button" className="os-icon-btn" aria-label={`Message ${p.name}`} title="Message" onClick={() => onMessage(p.id)}><MessageCircle size={19} /></button>
                )))}
              </ul>
            </section>
          )}
        </>
      )}
      {lists.blocked.length > 0 && (
        <details className="os-blocked">
          <summary>Blocked ({lists.blocked.length})</summary>
          <ul className="os-list">
            {lists.blocked.map((p) => person(p, (
              <button type="button" className="btn btn--ghost btn--sm" onClick={async () => {
                if (await ask({ title: `Unblock ${p.name}?`, body: "They'll be able to message you and send friend requests again.", confirm: "Unblock" })) actions.friend("unblock", p.id);
              }}>Unblock</button>
            ), "Blocked"))}
          </ul>
        </details>
      )}
      {confirmEl}
    </div>
  );
}

function YouTab({ onSettings }: { onSettings: (s: SettingsSection) => void }) {
  return (
    <div className="os-you">
      <ProfileCard personId={ME} variant="panel" onEditProfile={() => onSettings("profile")} />
      <ul className="os-list os-you-links">
        {(["privacy", "notifications", "appearance", "accessibility"] as SettingsSection[]).map((s) => (
          <li key={s}>
            <button type="button" className="os-chat os-chat--link" onClick={() => onSettings(s)}>
              {s === "privacy" ? "Privacy & safety" : s[0].toUpperCase() + s.slice(1)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { state } = useChat();
  const items: { id: Tab; label: string; icon: typeof Users; n?: number }[] = [
    { id: "chats", label: "Chats", icon: MessagesSquare, n: dmUnread(state) },
    { id: "spaces", label: "Spaces", icon: Hash },
    { id: "friends", label: "Friends", icon: Users, n: state.incoming.length },
    { id: "you", label: "You", icon: SettingsIcon },
  ];
  return (
    <nav className="os-bottom" aria-label="Sections">
      {items.map((i) => (
        <button key={i.id} type="button" className="os-bottom-item" aria-current={tab === i.id ? "page" : undefined} onClick={() => setTab(i.id)}>
          <span className="os-bottom-icon"><i.icon size={22} aria-hidden="true" />{!!i.n && <span className="os-count os-count--tiny">{i.n}</span>}</span>
          {i.label}
        </button>
      ))}
    </nav>
  );
}

// ── Welcome (new account) ─────────────────────────────────────────────

function Welcome({ onFriends, onJoined, onProfile }: { onFriends: () => void; onJoined: (id: string) => void; onProfile: () => void }) {
  const { state } = useChat();
  const me = state.people[ME];
  const isNew = state.recent.length === 0 && state.spaces.length === 0;
  if (state.scenario === "loading") return <div className="os-nothing" aria-busy="true" />;
  if (!isNew) {
    return (
      <div className="os-nothing">
        <MessagesSquare size={32} aria-hidden="true" />
        <p className="os-empty-title">Pick up where you left off</p>
        <p>Choose a chat on the left, or press <kbd>/</kbd> to find someone.</p>
      </div>
    );
  }
  return (
    <div className="os-welcome">
      <Avatar person={me} size={64} />
      <h2>Welcome, {firstName(me)}</h2>
      <p className="os-welcome-lede">Disband is better with your people. Here's how to bring them in.</p>
      <ol className="os-steps">
        <li>
          <span className="os-step-n">1</span>
          <div>
            <p className="os-step-title">Add a friend</p>
            <p>Know someone here? Send a request by username and you can message them once they accept.</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onFriends}><UserPlus size={16} aria-hidden="true" /> Add a friend</button>
          </div>
        </li>
        <li>
          <span className="os-step-n">2</span>
          <div>
            <p className="os-step-title">Join a space</p>
            <p>Got an invite? Paste it here.</p>
            <JoinForm onJoined={onJoined} />
          </div>
        </li>
        <li>
          <span className="os-step-n">3</span>
          <div>
            <p className="os-step-title">Make your profile yours</p>
            <p>A status note and a line about you help friends recognise you.</p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onProfile}>Edit profile</button>
          </div>
        </li>
      </ol>
    </div>
  );
}

function JoinForm({ onJoined }: { onJoined: (id: string) => void }) {
  const join = useJoinSpace();
  const [code, setCode] = useState("");
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const id = useId();
  return (
    <form className="os-join" onSubmit={(e) => { e.preventDefault(); const r = join(code); setRes(r); if (r.ok && r.spaceId) onJoined(r.spaceId); }}>
      <label className="vh" htmlFor={id}>Invite link or code</label>
      <div className="os-addfriend-row">
        <input id={id} className="input" value={code} onChange={(e) => { setCode(e.target.value); setRes(null); }} placeholder="Invite link or code" autoComplete="off" />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!code.trim()}>Join</button>
      </div>
      <p className={`os-add-res${res ? (res.ok ? " is-ok" : " is-error") : ""}`} role="status">{res?.text ?? "Sample invites: demohq, filmclub"}</p>
    </form>
  );
}
