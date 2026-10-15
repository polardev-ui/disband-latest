import "@fontsource-variable/instrument-sans";
import "./quiet.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check, ChevronDown, ChevronLeft, Hash, Lock, MessageCircle, MessagesSquare, PenSquare, Plus, Search, Settings as SettingsIcon,
  UserPlus, Users, Volume2,
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
import { useEscape, useHighlight, useMediaQuery, useModKey, usePlainKey, useResolvedMotion, useResolvedTheme } from "../../lib/hooks";
import {
  convInfo, dmUnread, effectivePresence, firstTextChannel, listTime, PRESENCE_LABEL, previewText, recentConversations,
  spaceUnread, type SearchHit,
} from "../../state/selectors";
import { useChat } from "../../state/store";
import { Conversation, Details } from "./QuietConversation";

type Dest =
  | { kind: "chats" }
  | { kind: "friends" }
  | { kind: "space"; id: string }
  | { kind: "spaces" } // mobile: list of spaces
  | { kind: "you" }; // mobile: your profile

export default function QuietApp() {
  const { state, actions } = useChat();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const theme = useResolvedTheme(state.prefs.themes.quiet);
  const motion = useResolvedMotion(state.prefs.motion);
  const mobile = useMediaQuery("(max-width: 759px)");
  const wide = useMediaQuery("(min-width: 1200px)");

  const [dest, setDest] = useState<Dest>({ kind: "chats" });
  const [convId, setConvId] = useState<string | null>("dm-nova");
  const [lastChannel, setLastChannel] = useState<Record<string, string>>({});
  const [details, setDetails] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [profile, setProfile] = useState<{ id: string; el: HTMLElement; spaceId?: string } | null>(null);
  const [mobileChat, setMobileChat] = useState(false);
  const [highlight, setHighlight] = useHighlight();
  const [backTo, setBackTo] = useState<string | null>(null);
  const profileAnchor = useRef<HTMLElement | null>(null);
  profileAnchor.current = profile?.el ?? null;

  // A conversation only counts if it's still reachable (scenarios reset data).
  const active = useMemo(() => {
    if (!convId) return null;
    const c = state.conversations[convId];
    if (!c) return null;
    if (c.kind === "channel") return state.spaces.includes(c.spaceId) ? convId : null;
    return state.recent.includes(convId) ? convId : null;
  }, [convId, state]);

  useEffect(() => {
    if (dest.kind === "space" && !state.spaces.includes(dest.id)) setDest({ kind: "chats" });
  }, [dest, state.spaces]);

  useModKey("k", () => setSearchOpen((v) => !v));
  usePlainKey("/", () => setSearchOpen(true));
  useEscape(() => setSearchOpen(false), searchOpen);
  useModKey("\\", () => setCollapsed((v) => !v));
  useModKey(",", () => setSettings("profile"));

  const open = (id: string, opts: { fromSearch?: boolean } = {}) => {
    const c = state.conversations[id];
    if (!c) return;
    if (opts.fromSearch && active && active !== id) setBackTo(active);
    else if (!opts.fromSearch) setBackTo(null);
    setConvId(id);
    if (c.kind === "channel") {
      setDest({ kind: "space", id: c.spaceId });
      setLastChannel((l) => ({ ...l, [c.spaceId]: id }));
    } else if (dest.kind !== "chats") setDest({ kind: "chats" });
    if (mobile) setMobileChat(true);
  };

  const openSpace = (spaceId: string) => {
    setDest({ kind: "space", id: spaceId });
    if (!mobile) open(lastChannel[spaceId] ?? firstTextChannel(SPACES[spaceId]));
  };

  const message = (personId: string) => {
    setProfile(null);
    open(actions.openDm(personId));
  };

  const pick = (hit: SearchHit) => {
    setSearchOpen(false);
    if (hit.kind === "person") message(hit.person.id);
    else if (hit.kind === "place") {
      if (hit.convId) open(hit.convId, { fromSearch: true });
      else if (hit.spaceId) openSpace(hit.spaceId);
    } else {
      open(hit.msg.convId, { fromSearch: true });
      window.setTimeout(() => setHighlight(hit.msg.id), 60);
    }
  };

  const onChannelRef = (name: string) => {
    const ch = Object.values(CHANNELS).find((c) => c.name === name && state.spaces.includes(c.spaceId));
    if (ch) open(ch.id);
  };

  const onProfile = (id: string, el: HTMLElement, spaceId?: string) => setProfile({ id, el, spaceId });

  const showDetails = details && !!active && dest.kind !== "friends";
  const detailsOverlay = !wide;
  useEscape(() => setDetails(false), showDetails && detailsOverlay && !profile && !searchOpen && !settings);

  const sidebar = (
    <Sidebar
      dest={dest}
      active={active}
      onOpen={open}
      onFriends={() => { setDest({ kind: "friends" }); }}
      onSearch={() => setSearchOpen(true)}
      onBackToSpaces={() => setDest({ kind: "spaces" })}
      onOpenSpace={openSpace}
      onSettings={(s) => setSettings(s)}
      mobile={mobile}
    />
  );

  const main =
    dest.kind === "friends" ? (
      <Friends onMessage={message} onProfile={onProfile} />
    ) : active ? (
      <Conversation
        convId={active}
        highlight={highlight}
        onHighlight={setHighlight}
        onProfile={onProfile}
        onChannelRef={onChannelRef}
        details={showDetails}
        onToggleDetails={() => setDetails((v) => !v)}
        onToggleSidebar={mobile ? undefined : () => setCollapsed((v) => !v)}
        sidebarCollapsed={collapsed}
        onBack={mobile ? () => setMobileChat(false) : undefined}
        backTo={backTo && backTo !== active && convInfo(state, backTo) ? { label: convInfo(state, backTo)!.conv.kind === "channel" ? `#${convInfo(state, backTo)!.title}` : convInfo(state, backTo)!.title, go: () => { const b = backTo; setBackTo(null); open(b); } } : null}
      />
    ) : (
      <NoConversation onFriends={() => setDest({ kind: "friends" })} onJoined={(sid) => openSpace(sid)} />
    );

  return (
    <div
      ref={setRoot}
      className="qc design-root"
      data-theme={theme}
      data-motion={motion}
      data-text={state.prefs.textSize}
    >
      <PortalRoot.Provider value={root}>
        {mobile ? (
          <div className="qc-mobile">
            {mobileChat && active && dest.kind !== "friends" ? (
              <div className="qc-mobile-screen qc-mobile-screen--chat" key={`chat-${active}`}>
                {main}
                {showDetails && (
                  <Details convId={active} overlay onClose={() => setDetails(false)} onProfile={onProfile} onEditProfile={() => setSettings("profile")} />
                )}
              </div>
            ) : (
              <div className="qc-mobile-screen" key={dest.kind}>
                {dest.kind === "friends" ? main : sidebar}
                <MobileTabs dest={dest} setDest={(d) => { setMobileChat(false); setDetails(false); setDest(d); }} />
              </div>
            )}
          </div>
        ) : (
          <div className="qc-shell" data-collapsed={collapsed || undefined} data-details={(showDetails && !detailsOverlay) || undefined}>
            <Rail dest={dest} setDest={setDest} onOpenSpace={openSpace} onSearch={() => setSearchOpen(true)} onSettings={() => setSettings("profile")} onProfile={onProfile} />
            <div className="qc-side-wrap" aria-hidden={collapsed || undefined} inert={collapsed || undefined}>{sidebar}</div>
            <div className="qc-main-wrap">{main}</div>
            <div className="qc-det-wrap">
              {showDetails && (
                <Details convId={active!} overlay={detailsOverlay} onClose={() => setDetails(false)} onProfile={onProfile} onEditProfile={() => setSettings("profile")} />
              )}
            </div>
          </div>
        )}

        {profile && (
          <Popover anchor={profileAnchor} onClose={() => setProfile(null)} align="start" className="qc-profile-pop" label="Profile">
            <ProfileCard personId={profile.id} spaceId={profile.spaceId} onMessage={message} onEditProfile={() => { setProfile(null); setSettings("profile"); }} />
          </Popover>
        )}

        {searchOpen && (
          <div className="qc-scrim qc-scrim--search" onPointerDown={(e) => e.target === e.currentTarget && setSearchOpen(false)}>
            <div className="qc-search" role="dialog" aria-modal="true" aria-label="Search">
              <SearchPanel
                onPick={pick}
                onClose={() => setSearchOpen(false)}
                returnLabel={active ? convInfo(state, active)?.title : undefined}
              />
            </div>
          </div>
        )}

        {settings && (
          <div className="qc-scrim" onPointerDown={(e) => e.target === e.currentTarget && setSettings(null)}>
            <div className="qc-settings" role="dialog" aria-modal="true" aria-label="Settings">
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
  return <Settings design="quiet" initial={initial} onClose={onClose} />;
}

// ── Rail ──────────────────────────────────────────────────────────────

function Rail({
  dest, setDest, onOpenSpace, onSearch, onSettings, onProfile,
}: {
  dest: Dest; setDest: (d: Dest) => void; onOpenSpace: (id: string) => void; onSearch: () => void; onSettings: () => void;
  onProfile: (id: string, el: HTMLElement) => void;
}) {
  const { state } = useChat();
  const [status, setStatus] = useState(false);
  const meRef = useRef<HTMLButtonElement>(null);
  const me = state.people[ME];
  const dms = dmUnread(state);
  return (
    <nav className="qc-rail" aria-label="Primary">
      <img className="qc-logo" src="/logo.png" alt="Disband" width={22} height={22} />
      <div className="qc-rail-group">
        <button type="button" className="qc-rail-btn" aria-current={dest.kind === "chats" ? "page" : undefined} aria-label={`Chats${dms ? `, ${dms} unread` : ""}`} data-tip="Chats" onClick={() => setDest({ kind: "chats" })}>
          <MessagesSquare size={20} />
          {dms > 0 && <span className="qc-rail-badge">{dms}</span>}
        </button>
        <button type="button" className="qc-rail-btn" aria-current={dest.kind === "friends" ? "page" : undefined} aria-label={`Friends${state.incoming.length ? `, ${state.incoming.length} request` : ""}`} data-tip="Friends" onClick={() => setDest({ kind: "friends" })}>
          <Users size={20} />
          {state.incoming.length > 0 && <span className="qc-rail-badge">{state.incoming.length}</span>}
        </button>
      </div>
      <span className="qc-rail-rule" aria-hidden="true" />
      <div className="qc-rail-group qc-rail-spaces">
        {state.spaces.map((id) => {
          const s = SPACES[id];
          const u = spaceUnread(state, id);
          const current = dest.kind === "space" && dest.id === id;
          return (
            <button key={id} type="button" className="qc-rail-space" aria-current={current ? "page" : undefined} aria-label={`${s.name}${u.mention ? ", mentioned" : u.count ? ", unread" : ""}`} data-tip={s.name} onClick={() => onOpenSpace(id)}>
              <SpaceIcon space={s} size={40} />
              {u.mention ? <span className="qc-rail-badge">@</span> : u.count > 0 ? <span className="qc-rail-dot" /> : null}
            </button>
          );
        })}
        <button type="button" className="qc-rail-btn qc-rail-btn--add" aria-label="Join or create a space" data-tip="Join a space" onClick={() => setDest({ kind: "chats" })}>
          <Plus size={20} />
        </button>
      </div>
      <div className="qc-rail-bottom">
        <button type="button" className="qc-rail-btn" aria-label="Search (⌘K)" data-tip="Search  ⌘K" onClick={onSearch}>
          <Search size={20} />
        </button>
        <button type="button" className="qc-rail-btn" aria-label="Settings" data-tip="Settings  ⌘," onClick={onSettings}>
          <SettingsIcon size={20} />
        </button>
        <button ref={meRef} type="button" className="qc-rail-me" aria-label={`Your status: ${PRESENCE_LABEL[effectivePresence(state, me)]}`} aria-haspopup="menu" aria-expanded={status} onClick={() => setStatus((v) => !v)}>
          <Avatar person={me} size={32} presence={effectivePresence(state, me)} />
        </button>
        {status && (
          <Popover anchor={meRef} onClose={() => setStatus(false)} align="start" className="qc-status-pop" label="Your status">
            <StatusMenu close={() => setStatus(false)} onViewProfile={() => { setStatus(false); onProfile(ME, meRef.current!); }} />
          </Popover>
        )}
      </div>
    </nav>
  );
}

function StatusMenu({ close, onViewProfile }: { close: () => void; onViewProfile: () => void }) {
  const { state, actions } = useChat();
  const me = state.people[ME];
  const current: Presence | "invisible" = state.prefs.appearOffline ? "invisible" : me.presence;
  const options: { v: Presence | "invisible"; label: string; hint?: string }[] = [
    { v: "online", label: "Online" },
    { v: "idle", label: "Away" },
    { v: "dnd", label: "Do not disturb", hint: "Mutes notifications" },
    { v: "invisible", label: "Appear offline", hint: "You can still chat" },
  ];
  return (
    <div className="menu" role="menu">
      <button type="button" className="qc-status-head" onClick={onViewProfile}>
        <Avatar person={me} size={36} />
        <span>
          <span className="qc-status-name">{me.name}</span>
          <span className="qc-status-sub">@{me.username}</span>
        </span>
      </button>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="menuitemradio"
          aria-checked={current === o.v}
          className="menu-item"
          onClick={() => {
            if (o.v === "invisible") actions.setPrefs({ appearOffline: true });
            else {
              actions.setPrefs({ appearOffline: false });
              actions.setMe({ presence: o.v });
            }
            close();
          }}
        >
          <span className="pc-dot" data-p={o.v === "invisible" ? "offline" : o.v} aria-hidden="true" />
          <span className="menu-item-text">{o.label}{o.hint && <span className="menu-item-hint">{o.hint}</span>}</span>
          {current === o.v && <Check size={15} className="menu-check" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────

function Sidebar({
  dest, active, onOpen, onFriends, onSearch, onBackToSpaces, onOpenSpace, onSettings, mobile,
}: {
  dest: Dest; active: string | null; onOpen: (id: string) => void; onFriends: () => void; onSearch: () => void;
  onBackToSpaces: () => void; onOpenSpace: (id: string) => void; onSettings: (s: SettingsSection) => void;
  mobile: boolean;
}) {
  const { state } = useChat();
  const key = dest.kind === "space" ? `space-${dest.id}` : dest.kind;
  return (
    <aside className="qc-side" aria-label="Navigation">
      <div className="qc-side-inner" key={key}>
        {dest.kind === "space" ? (
          <SpaceNav spaceId={dest.id} active={active} onOpen={onOpen} onBack={mobile ? onBackToSpaces : undefined} />
        ) : dest.kind === "spaces" ? (
          <SpacesList onOpenSpace={onOpenSpace} />
        ) : dest.kind === "you" ? (
          <YouScreen onSettings={onSettings} />
        ) : (
          <ChatList active={active} onOpen={onOpen} onFriends={onFriends} onSearch={onSearch} loading={state.scenario === "loading"} />
        )}
      </div>
    </aside>
  );
}

function ChatList({ active, onOpen, onFriends, onSearch, loading }: { active: string | null; onOpen: (id: string) => void; onFriends: () => void; onSearch: () => void; loading: boolean }) {
  const { state } = useChat();
  const [filter, setFilter] = useState<"all" | "unread" | "groups">("all");
  const all = recentConversations(state);
  const items = all.filter((r) => (filter === "unread" ? r.unread > 0 || r.mention : filter === "groups" ? r.info.conv.kind === "group" : true));
  const unreadCount = all.filter((r) => r.unread > 0).length;

  return (
    <>
      <header className="qc-side-head">
        <h1 className="qc-side-title">Chats</h1>
        <button type="button" className="qc-icon-btn" aria-label="New message" data-tip="New message" onClick={onSearch}>
          <PenSquare size={18} />
        </button>
      </header>
      <button type="button" className="qc-search-trigger" onClick={onSearch}>
        <Search size={16} aria-hidden="true" />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="qc-filters" role="tablist" aria-label="Filter chats">
        {(["all", "unread", "groups"] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className="qc-filter" onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "unread" ? `Unread${unreadCount ? ` ${unreadCount}` : ""}` : "Groups"}
          </button>
        ))}
      </div>
      <div className="qc-list" role="list">
        {loading ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          all.length === 0 ? (
            <div className="qc-side-empty">
              <p className="qc-side-empty-title">No conversations yet</p>
              <p>When you message a friend, or someone messages you, it'll appear here.</p>
              <button type="button" className="btn btn--primary btn--sm" onClick={onFriends}><UserPlus size={15} aria-hidden="true" /> Add a friend</button>
            </div>
          ) : (
            <div className="qc-side-empty">
              <p className="qc-side-empty-title">{filter === "unread" ? "You're all caught up" : "No group chats"}</p>
              <p>{filter === "unread" ? "Nothing unread right now." : "Group chats with friends will show up here."}</p>
            </div>
          )
        ) : (
          items.map((r) => {
            const person = r.info.person;
            const pres = person ? effectivePresence(state, person) : null;
            return (
              <div role="listitem" key={r.info.id}>
                <button
                  type="button"
                  className="qc-row"
                  aria-current={active === r.info.id ? "true" : undefined}
                  data-unread={r.unread > 0 || undefined}
                  onClick={() => onOpen(r.info.id)}
                >
                  {person ? <Avatar person={person} size={36} presence={pres} /> : <GroupAvatar people={r.info.members!} size={36} />}
                  <span className="qc-row-main">
                    <span className="qc-row-top">
                      <span className="qc-row-name">{r.info.title}</span>
                      {r.last && <time className="qc-row-time">{listTime(r.last.at)}</time>}
                    </span>
                    <span className="qc-row-bottom">
                      <span className="qc-row-preview">{previewText(state, r.last, { group: r.info.conv.kind === "group" })}</span>
                      {r.mention ? (
                        <span className="qc-badge qc-badge--mention" aria-label="Mentions you">@</span>
                      ) : r.unread > 0 ? (
                        <span className={`qc-badge${r.muted ? " qc-badge--muted" : ""}`} aria-label={`${r.unread} unread`}>{r.unread}</span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function SpaceNav({ spaceId, active, onOpen, onBack }: { spaceId: string; active: string | null; onOpen: (id: string) => void; onBack?: () => void }) {
  const { state } = useChat();
  const toast = useToast();
  const space = SPACES[spaceId];
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const online = space.memberIds.filter((id) => effectivePresence(state, state.people[id]) !== "offline").length;
  return (
    <>
      <header className="qc-side-head qc-side-head--space">
        {onBack && (
          <button type="button" className="qc-icon-btn" aria-label="All spaces" onClick={onBack}><ChevronLeft size={20} /></button>
        )}
        <button ref={menuRef} type="button" className="qc-space-title" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <span>{space.name}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {menu && (
          <Popover anchor={menuRef} onClose={() => setMenu(false)} align="start" className="menu-pop" label={`${space.name} menu`}>
            <div className="menu" role="menu">
              <button type="button" role="menuitem" className="menu-item" onClick={() => { setMenu(false); navigator.clipboard?.writeText(`https://disband.dev/invite/${space.inviteCode}`).catch(() => {}); toast("Invite link copied"); }}>
                <UserPlus size={16} /> Copy invite link
              </button>
            </div>
          </Popover>
        )}
      </header>
      <p className="qc-space-meta">{space.memberIds.length} members · {online} online</p>
      <div className="qc-list qc-channels">
        {space.categories.map((cat) => {
          const isClosed = !!closed[cat.id];
          return (
            <section key={cat.id} className="qc-cat">
              <button type="button" className="qc-cat-head" aria-expanded={!isClosed} onClick={() => setClosed((c) => ({ ...c, [cat.id]: !isClosed }))}>
                <ChevronDown size={13} className="qc-cat-chev" aria-hidden="true" />
                <span>{cat.name}</span>
              </button>
              <div className="qc-cat-body" data-closed={isClosed || undefined}>
                <div className="qc-cat-inner">
                  {cat.channelIds.map((id) => {
                    const ch = CHANNELS[id];
                    if (ch.kind === "voice") {
                      return (
                        <div key={id}>
                          <button type="button" className="qc-ch" onClick={() => toast("Voice channels aren't simulated in this prototype.")}>
                            <Volume2 size={16} aria-hidden="true" />
                            <span className="qc-ch-name">{ch.name}</span>
                            {!!ch.inVoice?.length && <span className="qc-ch-count">{ch.inVoice.length} in voice</span>}
                          </button>
                          {!!ch.inVoice?.length && (
                            <div className="qc-voice">
                              {ch.inVoice.map((pid) => (
                                <span key={pid} className="qc-voice-person"><Avatar person={state.people[pid]} size={20} />{state.people[pid].name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    const unread = state.unread[id] ?? 0;
                    const mention = !!state.mentions[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        className="qc-ch"
                        aria-current={active === id ? "true" : undefined}
                        data-unread={unread > 0 || undefined}
                        onClick={() => onOpen(id)}
                      >
                        <Hash size={16} aria-hidden="true" />
                        <span className="qc-ch-name">{ch.name}</span>
                        {ch.readOnly && <Lock size={13} className="qc-ch-lock" aria-label="Read-only" />}
                        {mention ? <span className="qc-badge qc-badge--mention" aria-label="Mentions you">@</span> : unread > 0 ? <span className="qc-ch-dot" aria-label="Unread" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function SpacesList({ onOpenSpace }: { onOpenSpace: (id: string) => void }) {
  const { state } = useChat();
  return (
    <>
      <header className="qc-side-head"><h1 className="qc-side-title">Spaces</h1></header>
      <div className="qc-list">
        {state.spaces.length === 0 && (
          <div className="qc-side-empty">
            <p className="qc-side-empty-title">You're not in any spaces yet</p>
            <p>Spaces are where groups and communities talk in channels. Ask a friend for an invite link.</p>
            <JoinForm onJoined={onOpenSpace} />
          </div>
        )}
        {state.spaces.map((id) => {
          const s = SPACES[id];
          const u = spaceUnread(state, id);
          return (
            <button key={id} type="button" className="qc-row" onClick={() => onOpenSpace(id)} data-unread={u.count > 0 || undefined}>
              <SpaceIcon space={s} size={36} />
              <span className="qc-row-main">
                <span className="qc-row-top"><span className="qc-row-name">{s.name}</span></span>
                <span className="qc-row-bottom">
                  <span className="qc-row-preview">{u.count ? `${u.count} unread` : s.description}</span>
                  {u.mention && <span className="qc-badge qc-badge--mention">@</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function YouScreen({ onSettings }: { onSettings: (s: SettingsSection) => void }) {
  return (
    <>
      <header className="qc-side-head"><h1 className="qc-side-title">You</h1></header>
      <div className="qc-list qc-you">
        <ProfileCard personId={ME} variant="panel" onEditProfile={() => onSettings("profile")} />
        <div className="qc-you-links">
          {(["privacy", "notifications", "appearance", "accessibility"] as SettingsSection[]).map((s) => (
            <button key={s} type="button" className="qc-row qc-row--link" onClick={() => onSettings(s)}>
              {s === "privacy" ? "Privacy & safety" : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function MobileTabs({ dest, setDest }: { dest: Dest; setDest: (d: Dest) => void }) {
  const { state } = useChat();
  const dms = dmUnread(state);
  const tabs: { d: Dest; label: string; icon: typeof Users; badge?: number; on: boolean }[] = [
    { d: { kind: "chats" }, label: "Chats", icon: MessagesSquare, badge: dms, on: dest.kind === "chats" },
    { d: { kind: "spaces" }, label: "Spaces", icon: Hash, on: dest.kind === "spaces" || dest.kind === "space" },
    { d: { kind: "friends" }, label: "Friends", icon: Users, badge: state.incoming.length, on: dest.kind === "friends" },
    { d: { kind: "you" }, label: "You", icon: SettingsIcon, on: dest.kind === "you" },
  ];
  return (
    <nav className="qc-tabs" aria-label="Primary">
      {tabs.map((t) => (
        <button key={t.label} type="button" className="qc-tab" aria-current={t.on ? "page" : undefined} onClick={() => setDest(t.d)}>
          <span className="qc-tab-icon">
            <t.icon size={21} aria-hidden="true" />
            {!!t.badge && <span className="qc-rail-badge">{t.badge}</span>}
          </span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ── Friends ───────────────────────────────────────────────────────────

function Friends({ onMessage, onProfile }: { onMessage: (id: string) => void; onProfile: (id: string, el: HTMLElement) => void }) {
  const { actions } = useChat();
  const toast = useToast();
  const lists = useFriendLists();
  const add = useAddFriend();
  const [confirmEl, ask] = useConfirm();
  const [tab, setTab] = useState<"online" | "all" | "pending" | "blocked">(lists.incoming.length ? "pending" : "online");
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tabs = [
    { id: "online" as const, label: "Online", n: lists.online.length },
    { id: "all" as const, label: "All", n: lists.all.length },
    { id: "pending" as const, label: "Pending", n: lists.incoming.length + lists.outgoing.length },
    { id: "blocked" as const, label: "Blocked", n: lists.blocked.length },
  ];

  const row = (p: Person, actionsEl: ReactNode, sub?: string) => (
    <div key={p.id} className="qc-friend" role="listitem">
      <button type="button" className="qc-friend-who" onClick={(e) => onProfile(p.id, e.currentTarget)}>
        <Avatar person={p} size={36} presence={p.presence} />
        <span className="qc-friend-text">
          <span className="qc-friend-name">{p.name}</span>
          <span className="qc-friend-sub">{sub ?? `@${p.username}`}</span>
        </span>
      </button>
      <span className="qc-friend-actions">{actionsEl}</span>
    </div>
  );

  const msgBtn = (p: Person) => (
    <button type="button" className="qc-icon-btn" aria-label={`Message ${p.name}`} data-tip="Message" onClick={() => onMessage(p.id)}>
      <MessageCircle size={18} />
    </button>
  );

  let list: ReactNode;
  if (tab === "online" || tab === "all") {
    const src = tab === "online" ? lists.online : lists.all;
    list = src.length ? src.map((p) => row(p, msgBtn(p), `${PRESENCE_LABEL[p.presence]}${p.note && p.presence !== "offline" ? ` · ${p.note}` : ""}`)) : (
      <div className="qc-empty-inline">
        <p className="qc-empty-title">{lists.all.length ? "No friends online right now" : "No friends yet"}</p>
        <p>{lists.all.length ? "They'll show up here when they're around." : "Add someone by their username above. They'll get a request and can accept it."}</p>
      </div>
    );
  } else if (tab === "pending") {
    list = lists.incoming.length + lists.outgoing.length ? (
      <>
        {lists.incoming.map((p) => row(p, (
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { actions.friend("accept", p.id); toast(`You and ${p.name} are now friends`); }}>Accept</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.friend("decline", p.id)}>Decline</button>
          </>
        ), "Wants to be friends"))}
        {lists.outgoing.map((p) => row(p, (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.friend("cancel", p.id)}>Cancel request</button>
        ), "Request sent"))}
      </>
    ) : (
      <div className="qc-empty-inline"><p className="qc-empty-title">No pending requests</p><p>Requests you send or receive wait here.</p></div>
    );
  } else {
    list = lists.blocked.length ? lists.blocked.map((p) => row(p, (
      <button type="button" className="btn btn--ghost btn--sm" onClick={async () => {
        if (await ask({ title: `Unblock ${p.name}?`, body: "They'll be able to message you and send friend requests again.", confirm: "Unblock" })) actions.friend("unblock", p.id);
      }}>Unblock</button>
    ), "Blocked")) : (
      <div className="qc-empty-inline"><p className="qc-empty-title">You haven't blocked anyone</p><p>Blocked people can't message you or send requests.</p></div>
    );
  }

  return (
    <section className="qc-main qc-friends" aria-label="Friends">
      <header className="qc-head">
        <div className="qc-head-who qc-head-who--static">
          <Users size={18} className="qc-head-hash" aria-hidden="true" />
          <h2 className="qc-head-title">Friends</h2>
        </div>
        <div className="qc-tabs-inline" role="tablist" aria-label="Friend lists">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="qc-tab-inline" onClick={() => setTab(t.id)}>
              {t.label}{t.n ? <span className="qc-tab-n">{t.n}</span> : null}
            </button>
          ))}
        </div>
      </header>
      <div className="qc-scroll">
        <form
          className="qc-add"
          onSubmit={(e) => {
            e.preventDefault();
            const r = add(username);
            setResult(r);
            if (r.ok) {
              setUsername("");
              setTab("pending");
            }
          }}
        >
          <label htmlFor="qc-add-input" className="qc-add-label">Add a friend</label>
          <p className="qc-add-hint">You'll need their username. Try <button type="button" className="qc-link" onClick={() => { setUsername("marcushale"); inputRef.current?.focus(); }}>marcushale</button> or <button type="button" className="qc-link" onClick={() => { setUsername("ren.ito"); inputRef.current?.focus(); }}>ren.ito</button>.</p>
          <div className="qc-add-row">
            <span className="input-wrap">
              <span className="input-prefix">@</span>
              <input ref={inputRef} id="qc-add-input" className="input" value={username} onChange={(e) => { setUsername(e.target.value); setResult(null); }} placeholder="username" autoComplete="off" aria-describedby="qc-add-result" />
            </span>
            <button type="submit" className="btn btn--primary" disabled={!username.trim()}>Send request</button>
          </div>
          <p id="qc-add-result" className={`qc-add-result${result ? (result.ok ? " is-ok" : " is-error") : ""}`} role="status">{result?.text ?? ""}</p>
        </form>
        <div className="qc-friend-list" role="list" key={tab}>{list}</div>
      </div>
      {confirmEl}
    </section>
  );
}

// ── Empty main ────────────────────────────────────────────────────────

function NoConversation({ onFriends, onJoined }: { onFriends: () => void; onJoined: (spaceId: string) => void }) {
  const { state } = useChat();
  const isNew = state.recent.length === 0 && state.spaces.length === 0;
  if (state.scenario === "loading") return <section className="qc-main qc-nothing" aria-busy="true" />;
  if (!isNew) {
    return (
      <section className="qc-main qc-nothing">
        <div className="qc-nothing-inner">
          <p className="qc-nothing-title">No conversation open</p>
          <p>Pick one from the list, or press <kbd>⌘K</kbd> to find a person, channel or message.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="qc-main qc-nothing">
      <div className="qc-welcome">
        <img src="/logo.png" alt="" className="qc-welcome-mark" width={28} height={28} />
        <h2>Welcome to Disband, {state.people[ME].name}</h2>
        <p className="qc-welcome-lede">It's quiet in here. Two ways to get started:</p>
        <ol className="qc-welcome-steps">
          <li>
            <span className="qc-step-n">1</span>
            <div>
              <p className="qc-step-title">Add a friend</p>
              <p>Message people you know directly. You'll need their username.</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onFriends}><UserPlus size={15} aria-hidden="true" /> Find a friend</button>
            </div>
          </li>
          <li>
            <span className="qc-step-n">2</span>
            <div>
              <p className="qc-step-title">Join a space</p>
              <p>Spaces are shared places with channels for different topics. Paste an invite to join one.</p>
              <JoinForm onJoined={onJoined} />
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

function JoinForm({ onJoined }: { onJoined: (spaceId: string) => void }) {
  const join = useJoinSpace();
  const [code, setCode] = useState("");
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="qc-join"
      onSubmit={(e) => {
        e.preventDefault();
        const r = join(code);
        setRes(r);
        if (r.ok && r.spaceId) onJoined(r.spaceId);
      }}
    >
      <label className="vh" htmlFor="qc-join">Invite link or code</label>
      <div className="qc-add-row">
        <input id="qc-join" className="input" value={code} onChange={(e) => { setCode(e.target.value); setRes(null); }} placeholder="disband.dev/invite/demohq" autoComplete="off" />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!code.trim()}>Join</button>
      </div>
      <p className={`qc-add-result${res ? (res.ok ? " is-ok" : " is-error") : ""}`} role="status">{res?.text ?? "Sample codes: demohq, filmclub"}</p>
    </form>
  );
}

