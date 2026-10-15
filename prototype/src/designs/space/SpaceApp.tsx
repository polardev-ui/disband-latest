import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./space.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check, ChevronDown, ChevronLeft, Hash, Lock, MessageSquare, PenLine, Plus, Search, Settings as SettingsIcon, UserPlus, Users,
  Volume2,
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
import { DetailsPlane, Stage } from "./SpaceConversation";

type Place = "home" | string;

export default function SpaceApp() {
  const { state, actions } = useChat();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const theme = useResolvedTheme(state.prefs.themes.space);
  const motion = useResolvedMotion(state.prefs.motion);
  const mobile = useMediaQuery("(max-width: 759px)");
  const wide = useMediaQuery("(min-width: 1220px)");

  const [place, setPlace] = useState<Place>("demo");
  const [convId, setConvId] = useState<string | null>("ch-general");
  const [lastIn, setLastIn] = useState<Record<string, string>>({ demo: "ch-general" });
  const [view, setView] = useState<"conv" | "friends">("conv");
  const [details, setDetails] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [profile, setProfile] = useState<{ id: string; el: HTMLElement; spaceId?: string } | null>(null);
  const [stageOpen, setStageOpen] = useState(false);
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
    if (place !== "home" && !state.spaces.includes(place)) setPlace("home");
  }, [place, state.spaces]);

  useModKey("k", () => setSearchOpen((v) => !v));
  usePlainKey("/", () => setSearchOpen(true));
  useModKey(",", () => setSettings("profile"));
  useEscape(() => setSearchOpen(false), searchOpen);

  const open = (id: string) => {
    const c = state.conversations[id];
    if (!c) return;
    setConvId(id);
    setView("conv");
    const p = c.kind === "channel" ? c.spaceId : "home";
    setPlace(p);
    setLastIn((l) => ({ ...l, [p]: id }));
    if (mobile) setStageOpen(true);
  };

  const goPlace = (p: Place) => {
    setPlace(p);
    if (mobile) return;
    const remembered = lastIn[p];
    if (p === "home") {
      const first = remembered && state.recent.includes(remembered) ? remembered : state.recent[0];
      if (first) open(first);
      else setView("friends");
    } else open(remembered ?? firstTextChannel(SPACES[p]));
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
      else if (hit.spaceId) goPlace(hit.spaceId);
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

  const showDetails = details && !!active && view === "conv";
  useEscape(() => setDetails(false), showDetails && !wide && !profile && !searchOpen && !settings);

  const stage =
    view === "friends" ? (
      <FriendsStage onMessage={message} onProfile={onProfile} onBack={mobile ? () => setStageOpen(false) : undefined} />
    ) : active ? (
      <Stage
        convId={active}
        highlight={highlight}
        onHighlight={setHighlight}
        onProfile={onProfile}
        onChannelRef={onChannelRef}
        details={showDetails}
        onToggleDetails={() => setDetails((v) => !v)}
        onBack={mobile ? () => { setStageOpen(false); setDetails(false); } : undefined}
      />
    ) : (
      <EmptyStage onFriends={() => { setView("friends"); setPlace("home"); }} onJoined={(id) => goPlace(id)} />
    );

  const nav = (
    <Nav
      place={place}
      active={view === "friends" ? "__friends" : active}
      onOpen={open}
      onFriends={() => { setView("friends"); setPlace("home"); if (mobile) setStageOpen(true); }}
      onSearch={() => setSearchOpen(true)}
      mobile={mobile}
    />
  );

  return (
    <div ref={setRoot} className="ds design-root" data-theme={theme} data-motion={motion} data-text={state.prefs.textSize}>
      <PortalRoot.Provider value={root}>
        {mobile ? (
          <div className="ds-m">
            {stageOpen && (view === "friends" || active) ? (
              <div className="ds-m-stage" key={`s-${view}-${active}`}>
                {stage}
                {showDetails && (
                  <div className="ds-sheet-scrim" onPointerDown={(e) => e.target === e.currentTarget && setDetails(false)}>
                    <DetailsPlane convId={active!} sheet onClose={() => setDetails(false)} onProfile={onProfile} onEditProfile={() => setSettings("profile")} />
                  </div>
                )}
              </div>
            ) : (
              <div className="ds-m-list">
                <header className="ds-m-head">
                  <img src="/logo.png" alt="" width={20} height={20} />
                  <span className="ds-m-title">Disband</span>
                  <button type="button" className="ds-icon-btn" aria-label="Search" onClick={() => setSearchOpen(true)}><Search size={19} /></button>
                  <button type="button" className="ds-icon-btn" aria-label="Settings" onClick={() => setSettings("profile")}><SettingsIcon size={19} /></button>
                </header>
                <div className="ds-m-strip" role="tablist" aria-label="Places">
                  <PlaceTile place="home" current={place === "home"} onClick={() => goPlace("home")} />
                  {state.spaces.map((id) => <PlaceTile key={id} place={id} current={place === id} onClick={() => goPlace(id)} />)}
                </div>
                {nav}
              </div>
            )}
          </div>
        ) : (
          <div className="ds-frame" data-details={(showDetails && wide) || undefined}>
            <Rail place={place} goPlace={goPlace} onSearch={() => setSearchOpen(true)} onSettings={() => setSettings("profile")} onProfile={onProfile} />
            {nav}
            <main className="ds-stage" key={view === "friends" ? "friends" : "conv"}>{stage}</main>
            <div className="ds-det-col">
              {showDetails && (
                <DetailsPlane convId={active!} onClose={() => setDetails(false)} onProfile={onProfile} onEditProfile={() => setSettings("profile")} />
              )}
            </div>
          </div>
        )}

        {profile && (
          <Popover anchor={profileAnchor} onClose={() => setProfile(null)} align="start" className="ds-profile-pop" label="Profile">
            <ProfileCard personId={profile.id} spaceId={profile.spaceId} onMessage={message} onEditProfile={() => { setProfile(null); setSettings("profile"); }} />
          </Popover>
        )}
        {searchOpen && (
          <div className="ds-scrim ds-scrim--glass" onPointerDown={(e) => e.target === e.currentTarget && setSearchOpen(false)}>
            <div className="ds-palette" role="dialog" aria-modal="true" aria-label="Search">
              <SearchPanel onPick={pick} onClose={() => setSearchOpen(false)} placeholder="Jump to a person, channel or message" returnLabel={active ? convInfo(state, active)?.title : undefined} />
            </div>
          </div>
        )}
        {settings && (
          <div className="ds-scrim" onPointerDown={(e) => e.target === e.currentTarget && setSettings(null)}>
            <div className="ds-settings" role="dialog" aria-modal="true" aria-label="Settings">
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
  return <Settings design="space" initial={initial} onClose={onClose} />;
}

// ── Rail ──────────────────────────────────────────────────────────────

function PlaceTile({ place, current, onClick, tip }: { place: Place; current: boolean; onClick: () => void; tip?: boolean }) {
  const { state } = useChat();
  if (place === "home") {
    const n = dmUnread(state) + state.incoming.length;
    return (
      <button type="button" role="tab" aria-selected={current} className="ds-tile ds-tile--home" aria-label={`Home${n ? `, ${n} new` : ""}`} data-tip={tip ? "Home" : undefined} onClick={onClick}>
        <MessageSquare size={19} />
        {n > 0 && <span className="ds-tile-badge">{n}</span>}
      </button>
    );
  }
  const s = SPACES[place];
  const u = spaceUnread(state, place);
  return (
    <button type="button" role="tab" aria-selected={current} className="ds-tile" aria-label={`${s.name}${u.mention ? ", mentioned" : u.count ? ", unread" : ""}`} data-tip={tip ? s.name : undefined} onClick={onClick}>
      <SpaceIcon space={s} size={42} />
      {u.mention ? <span className="ds-tile-badge ds-tile-badge--mention">@</span> : u.count > 0 ? <span className="ds-tile-dot" /> : null}
    </button>
  );
}

function Rail({ place, goPlace, onSearch, onSettings, onProfile }: { place: Place; goPlace: (p: Place) => void; onSearch: () => void; onSettings: () => void; onProfile: (id: string, el: HTMLElement) => void }) {
  const { state } = useChat();
  const toast = useToast();
  const me = state.people[ME];
  const [menu, setMenu] = useState(false);
  const meRef = useRef<HTMLButtonElement>(null);
  return (
    <nav className="ds-rail" aria-label="Places">
      <img className="ds-logo" src="/logo.png" alt="Disband" width={22} height={22} />
      <div className="ds-rail-list" role="tablist" aria-orientation="vertical">
        <PlaceTile place="home" current={place === "home"} onClick={() => goPlace("home")} tip />
        <span className="ds-rail-rule" aria-hidden="true" />
        {state.spaces.map((id) => <PlaceTile key={id} place={id} current={place === id} onClick={() => goPlace(id)} tip />)}
        <button type="button" className="ds-tile ds-tile--ghost" aria-label="Join a space" data-tip="Join a space" onClick={() => toast("Paste an invite from the Home view's welcome panel — or try demohq on a new account.")}>
          <Plus size={18} />
        </button>
      </div>
      <div className="ds-rail-foot">
        <button type="button" className="ds-icon-btn" aria-label="Search" data-tip="Search  ⌘K" onClick={onSearch}><Search size={18} /></button>
        <button type="button" className="ds-icon-btn" aria-label="Settings" data-tip="Settings" onClick={onSettings}><SettingsIcon size={18} /></button>
        <button ref={meRef} type="button" className="ds-me" aria-haspopup="menu" aria-expanded={menu} aria-label={`Your status: ${PRESENCE_LABEL[effectivePresence(state, me)]}`} onClick={() => setMenu((v) => !v)}>
          <Avatar person={me} size={32} presence={effectivePresence(state, me)} />
        </button>
        {menu && (
          <Popover anchor={meRef} onClose={() => setMenu(false)} align="start" className="menu-pop" label="Your status">
            <StatusMenu close={() => setMenu(false)} onView={() => { setMenu(false); onProfile(ME, meRef.current!); }} />
          </Popover>
        )}
      </div>
    </nav>
  );
}

function StatusMenu({ close, onView }: { close: () => void; onView: () => void }) {
  const { state, actions } = useChat();
  const me = state.people[ME];
  const current: Presence | "invisible" = state.prefs.appearOffline ? "invisible" : me.presence;
  const opts: { v: Presence | "invisible"; label: string }[] = [
    { v: "online", label: "Online" },
    { v: "idle", label: "Away" },
    { v: "dnd", label: "Do not disturb" },
    { v: "invisible", label: "Appear offline" },
  ];
  return (
    <div className="menu" role="menu">
      <button type="button" className="menu-item ds-menu-me" onClick={onView}>
        <Avatar person={me} size={28} />
        <span className="menu-item-text">{me.name}<span className="menu-item-hint">@{me.username}</span></span>
      </button>
      <span className="menu-sep" />
      {opts.map((o) => (
        <button key={o.v} type="button" role="menuitemradio" aria-checked={current === o.v} className="menu-item" onClick={() => {
          if (o.v === "invisible") actions.setPrefs({ appearOffline: true });
          else { actions.setPrefs({ appearOffline: false }); actions.setMe({ presence: o.v }); }
          close();
        }}>
          <span className="pc-dot" data-p={o.v === "invisible" ? "offline" : o.v} aria-hidden="true" />
          <span className="menu-item-text">{o.label}</span>
          {current === o.v && <Check size={14} className="menu-check" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

// ── Nav column ────────────────────────────────────────────────────────

function Nav({ place, active, onOpen, onFriends, onSearch, mobile }: { place: Place; active: string | null; onOpen: (id: string) => void; onFriends: () => void; onSearch: () => void; mobile: boolean }) {
  const { state } = useChat();
  return (
    <aside className="ds-nav" aria-label={place === "home" ? "Direct messages" : SPACES[place]?.name}>
      <div className="ds-nav-inner" key={place}>
        {place === "home" || !SPACES[place] ? (
          <HomeNav active={active} onOpen={onOpen} onFriends={onFriends} onSearch={onSearch} loading={state.scenario === "loading"} mobile={mobile} />
        ) : (
          <SpaceNav spaceId={place} active={active} onOpen={onOpen} loading={state.scenario === "loading"} />
        )}
      </div>
    </aside>
  );
}

function HomeNav({ active, onOpen, onFriends, onSearch, loading, mobile }: { active: string | null; onOpen: (id: string) => void; onFriends: () => void; onSearch: () => void; loading: boolean; mobile: boolean }) {
  const { state } = useChat();
  const items = recentConversations(state);
  return (
    <>
      {!mobile && (
        <header className="ds-nav-head">
          <h1 className="ds-nav-title">Messages</h1>
          <button type="button" className="ds-icon-btn ds-icon-btn--sm" aria-label="New message" data-tip="New message" onClick={onSearch}><PenLine size={16} /></button>
        </header>
      )}
      {!mobile && (
        <button type="button" className="ds-search" onClick={onSearch}>
          <Search size={15} aria-hidden="true" /><span>Search</span><kbd>⌘K</kbd>
        </button>
      )}
      <div className="ds-nav-list">
        <button type="button" className="ds-item ds-item--plain" aria-current={active === "__friends" ? "true" : undefined} onClick={onFriends}>
          <span className="ds-item-glyph"><Users size={17} aria-hidden="true" /></span>
          <span className="ds-item-name">Friends</span>
          {state.incoming.length > 0 && <span className="ds-count">{state.incoming.length}</span>}
        </button>
        <p className="ds-label ds-nav-label">Direct messages</p>
        {loading ? <SkeletonList rows={6} /> : items.length === 0 ? (
          <p className="ds-nav-empty">No conversations yet. Open Friends to add someone, or press <kbd>/</kbd> to search.</p>
        ) : (
          items.map((r) => {
            const p = r.info.person;
            return (
              <button key={r.info.id} type="button" className="ds-item" aria-current={active === r.info.id ? "true" : undefined} data-unread={r.unread > 0 || undefined} onClick={() => onOpen(r.info.id)}>
                {p ? <Avatar person={p} size={32} presence={effectivePresence(state, p)} /> : <GroupAvatar people={r.info.members!} size={32} />}
                <span className="ds-item-main">
                  <span className="ds-item-top">
                    <span className="ds-item-name">{r.info.title}</span>
                    {r.last && <time>{listTime(r.last.at)}</time>}
                  </span>
                  <span className="ds-item-sub">{previewText(state, r.last, { group: r.info.conv.kind === "group" })}</span>
                </span>
                {r.mention ? <span className="ds-count ds-count--mention" aria-label="Mentions you">@</span> : r.unread > 0 ? <span className={`ds-count${r.muted ? " ds-count--muted" : ""}`} aria-label={`${r.unread} unread`}>{r.unread}</span> : null}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

function SpaceNav({ spaceId, active, onOpen, loading }: { spaceId: string; active: string | null; onOpen: (id: string) => void; loading: boolean }) {
  const { state } = useChat();
  const toast = useToast();
  const s = SPACES[spaceId];
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const online = s.memberIds.filter((id) => effectivePresence(state, state.people[id]) !== "offline").length;
  return (
    <>
      <header className="ds-nav-head ds-nav-head--space">
        <button ref={ref} type="button" className="ds-space-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <span className="ds-nav-title">{s.name}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        {menu && (
          <Popover anchor={ref} onClose={() => setMenu(false)} align="start" className="menu-pop" label={`${s.name} menu`}>
            <div className="menu" role="menu">
              <button type="button" role="menuitem" className="menu-item" onClick={() => { setMenu(false); navigator.clipboard?.writeText(`https://disband.dev/invite/${s.inviteCode}`).catch(() => {}); toast("Invite link copied"); }}>
                <UserPlus size={15} /> Copy invite link
              </button>
            </div>
          </Popover>
        )}
      </header>
      <p className="ds-space-meta"><span className="ds-live-dot" aria-hidden="true" />{online} online <span aria-hidden="true">·</span> {s.memberIds.length} members</p>
      <div className="ds-nav-list">
        {loading ? <SkeletonList rows={6} /> : s.categories.map((cat) => {
          const isClosed = !!closed[cat.id];
          return (
            <section key={cat.id} className="ds-cat">
              <button type="button" className="ds-cat-head ds-label" aria-expanded={!isClosed} onClick={() => setClosed((c) => ({ ...c, [cat.id]: !isClosed }))}>
                <ChevronDown size={12} className="ds-cat-chev" aria-hidden="true" />{cat.name}
              </button>
              <div className="ds-cat-body" data-closed={isClosed || undefined}>
                <div className="ds-cat-inner">
                  {cat.channelIds.map((id) => {
                    const ch = CHANNELS[id];
                    if (ch.kind === "voice") {
                      return (
                        <div key={id} className="ds-voice">
                          <button type="button" className="ds-item ds-item--channel" onClick={() => toast("Voice channels aren't simulated in this prototype.")}>
                            <Volume2 size={16} aria-hidden="true" />
                            <span className="ds-item-name">{ch.name}</span>
                            {!!ch.inVoice?.length && <span className="ds-voice-n">{ch.inVoice.length}</span>}
                          </button>
                          {!!ch.inVoice?.length && (
                            <div className="ds-voice-people">
                              {ch.inVoice.map((pid) => (
                                <span key={pid} className="ds-voice-person"><Avatar person={state.people[pid]} size={20} />{state.people[pid].name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    const unread = state.unread[id] ?? 0;
                    return (
                      <button key={id} type="button" className="ds-item ds-item--channel" aria-current={active === id ? "true" : undefined} data-unread={unread > 0 || undefined} onClick={() => onOpen(id)}>
                        <Hash size={16} aria-hidden="true" />
                        <span className="ds-item-name">{ch.name}</span>
                        {ch.readOnly && <Lock size={12} className="ds-item-lock" aria-label="Read-only" />}
                        {state.mentions[id] ? <span className="ds-count ds-count--mention">@</span> : unread > 0 ? <span className="ds-count">{unread}</span> : null}
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

// ── Friends stage ─────────────────────────────────────────────────────

function FriendsStage({ onMessage, onProfile, onBack }: { onMessage: (id: string) => void; onProfile: (id: string, el: HTMLElement) => void; onBack?: () => void }) {
  const { state, actions } = useChat();
  const toast = useToast();
  const lists = useFriendLists();
  const add = useAddFriend();
  const [confirmEl, ask] = useConfirm();
  const [tab, setTab] = useState<"online" | "all" | "pending" | "blocked">(lists.incoming.length ? "pending" : "online");
  const [name, setName] = useState("");
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const tabs = [
    { id: "online" as const, label: "Online", n: lists.online.length },
    { id: "all" as const, label: "All", n: lists.all.length },
    { id: "pending" as const, label: "Pending", n: lists.incoming.length + lists.outgoing.length },
    { id: "blocked" as const, label: "Blocked", n: lists.blocked.length },
  ];
  const row = (p: Person, trailing: ReactNode, sub?: string) => (
    <div key={p.id} className="ds-friend" role="listitem">
      <button type="button" className="ds-friend-who" onClick={(e) => onProfile(p.id, e.currentTarget)}>
        <Avatar person={p} size={36} presence={effectivePresence(state, p)} />
        <span className="ds-friend-text">
          <span className="ds-friend-name">{p.name} <span className="ds-friend-handle">@{p.username}</span></span>
          <span className="ds-friend-sub">{sub ?? `${PRESENCE_LABEL[effectivePresence(state, p)]}${p.note && effectivePresence(state, p) !== "offline" ? ` — ${p.note}` : ""}`}</span>
        </span>
      </button>
      <span className="ds-friend-actions">{trailing}</span>
    </div>
  );
  const msgBtn = (p: Person) => <button type="button" className="ds-icon-btn" aria-label={`Message ${p.name}`} data-tip="Message" onClick={() => onMessage(p.id)}><MessageSquare size={17} /></button>;
  const empty = (title: string, body: string) => <div className="ds-empty"><p className="ds-empty-title">{title}</p><p>{body}</p></div>;

  let content: ReactNode;
  if (tab === "online" || tab === "all") {
    const src = tab === "online" ? lists.online : lists.all;
    content = src.length ? src.map((p) => row(p, msgBtn(p))) : empty(lists.all.length ? "Nobody's online" : "No friends yet", lists.all.length ? "Friends appear here when they're around." : "Add someone by username above. They'll get a request.");
  } else if (tab === "pending") {
    content = lists.incoming.length + lists.outgoing.length ? (
      <>
        {lists.incoming.map((p) => row(p, (
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { actions.friend("accept", p.id); toast(`You and ${p.name} are now friends`); }}>Accept</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.friend("decline", p.id)}>Ignore</button>
          </>
        ), "Incoming request"))}
        {lists.outgoing.map((p) => row(p, <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.friend("cancel", p.id)}>Cancel</button>, "Outgoing request"))}
      </>
    ) : empty("Nothing pending", "Requests you send and receive wait here.");
  } else {
    content = lists.blocked.length ? lists.blocked.map((p) => row(p, (
      <button type="button" className="btn btn--ghost btn--sm" onClick={async () => {
        if (await ask({ title: `Unblock ${p.name}?`, body: "They'll be able to message you and send friend requests again.", confirm: "Unblock" })) actions.friend("unblock", p.id);
      }}>Unblock</button>
    ), "Blocked")) : empty("No one blocked", "Blocked people can't message you or send requests.");
  }

  return (
    <section className="ds-stage-inner" aria-label="Friends">
      <header className="ds-head">
        {onBack && <button type="button" className="ds-icon-btn" aria-label="Back" onClick={onBack}><ChevronLeft size={22} /></button>}
        <div className="ds-head-who"><span className="ds-head-glyph"><Users size={17} aria-hidden="true" /></span><span className="ds-head-title">Friends</span></div>
        <div className="ds-seg-tabs" role="tablist" aria-label="Friend lists">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="ds-seg-tab" onClick={() => setTab(t.id)}>
              {t.label}<span className="ds-seg-n">{t.n}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="ds-scroll">
        <div className="ds-friends">
          <form className="ds-add" onSubmit={(e) => { e.preventDefault(); const r = add(name); setRes(r); if (r.ok) { setName(""); setTab("pending"); } }}>
            <label htmlFor="ds-add" className="ds-label">Add friend</label>
            <div className="ds-add-row">
              <span className="input-wrap"><span className="input-prefix">@</span><input id="ds-add" className="input" value={name} onChange={(e) => { setName(e.target.value); setRes(null); }} placeholder="username" autoComplete="off" /></span>
              <button type="submit" className="btn btn--primary" disabled={!name.trim()}>Send request</button>
            </div>
            <p className={`ds-add-res${res ? (res.ok ? " is-ok" : " is-error") : ""}`} role="status">{res?.text ?? "Sample usernames: marcushale, ren.ito"}</p>
          </form>
          <div className="ds-friend-list" role="list" key={tab}>{content}</div>
        </div>
      </div>
      {confirmEl}
    </section>
  );
}

// ── Empty stage ───────────────────────────────────────────────────────

function EmptyStage({ onFriends, onJoined }: { onFriends: () => void; onJoined: (id: string) => void }) {
  const { state } = useChat();
  const join = useJoinSpace();
  const [code, setCode] = useState("");
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  const isNew = state.recent.length === 0 && state.spaces.length === 0;
  if (state.scenario === "loading") return <section className="ds-stage-inner ds-empty-stage" aria-busy="true" />;
  if (!isNew) {
    return (
      <section className="ds-stage-inner ds-empty-stage">
        <div className="ds-empty">
          <p className="ds-empty-title">Nothing open</p>
          <p>Choose a conversation, or press <kbd>⌘K</kbd> to jump anywhere.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="ds-stage-inner ds-empty-stage">
      <div className="ds-welcome">
        <img src="/logo.png" alt="" width={32} height={32} className="ds-welcome-mark" />
        <h2>Your Disband is empty — for now</h2>
        <p>Start with one person or one space. Everything else follows.</p>
        <div className="ds-welcome-split">
          <div>
            <p className="ds-label">Friends</p>
            <p className="ds-welcome-text">Add someone you know by their username.</p>
            <button type="button" className="btn btn--ghost" onClick={onFriends}><UserPlus size={16} aria-hidden="true" /> Add a friend</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const r = join(code); setRes(r); if (r.ok && r.spaceId) onJoined(r.spaceId); }}>
            <label className="ds-label" htmlFor="ds-join">Join a space</label>
            <p className="ds-welcome-text">Paste an invite link or code.</p>
            <div className="ds-add-row">
              <input id="ds-join" className="input" value={code} onChange={(e) => { setCode(e.target.value); setRes(null); }} placeholder="demohq" autoComplete="off" />
              <button type="submit" className="btn btn--primary" disabled={!code.trim()}>Join</button>
            </div>
            <p className={`ds-add-res${res ? (res.ok ? " is-ok" : " is-error") : ""}`} role="status">{res?.text ?? ""}</p>
          </form>
        </div>
      </div>
    </section>
  );
}
