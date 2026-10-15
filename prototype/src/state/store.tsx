import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import {
  CHANNELS, ME, PEOPLE, SEED_BLOCKED, SEED_FRIENDS, SEED_INCOMING, SEED_MENTIONS, SEED_OUTGOING,
  SEED_RECENT, SEED_SPACES, SEED_UNREAD, seedConversations, seedMessages,
} from "../data/seed";
import type {
  Attachment, Conversation, DesignKey, Message, MotionPref, Person, Scenario, ThemePref,
} from "../data/types";

// All state is local to this browser tab. Nothing here talks to Disband's
// backend; "sending" only appends to an in-memory list.

export interface Prefs {
  notify: "all" | "mentions" | "none";
  desktop: boolean;
  sounds: boolean;
  linkPreviews: boolean;
  appearOffline: boolean;
  motion: MotionPref;
  textSize: "default" | "large";
  themes: Record<DesignKey, ThemePref>;
}

export interface ChatState {
  scenario: Scenario;
  people: Record<string, Person>;
  conversations: Record<string, Conversation>;
  messages: Record<string, Message[]>;
  recent: string[];
  unread: Record<string, number>;
  mentions: Record<string, boolean>;
  friends: string[];
  incoming: string[];
  outgoing: string[];
  blocked: string[];
  spaces: string[];
  muted: string[];
  prefs: Prefs;
}

const DEFAULT_PREFS: Prefs = {
  notify: "mentions",
  desktop: true,
  sounds: true,
  linkPreviews: true,
  appearOffline: false,
  motion: "system",
  textSize: "default",
  themes: { quiet: "light", social: "light", space: "dark" },
};

function build(scenario: Scenario, prefs: Prefs = DEFAULT_PREFS): ChatState {
  const people = structuredClone(PEOPLE);
  const allConvs = seedConversations();
  const allMessages = seedMessages();
  if (scenario === "new") {
    // A brand-new account: nobody to talk to yet. Spaces can still be joined
    // with an invite code, so their channels exist but are not listed.
    const conversations: Record<string, Conversation> = {};
    const messages: Record<string, Message[]> = {};
    for (const c of Object.values(allConvs)) {
      if (c.kind === "channel") {
        conversations[c.id] = c;
        messages[c.id] = allMessages[c.id] ?? [];
      }
    }
    return {
      scenario, people, conversations, messages, recent: [], unread: {}, mentions: {},
      friends: [], incoming: [], outgoing: [], blocked: [], spaces: [], muted: [], prefs,
    };
  }
  return {
    scenario, people, conversations: allConvs, messages: allMessages,
    recent: [...SEED_RECENT], unread: { ...SEED_UNREAD }, mentions: { ...SEED_MENTIONS },
    friends: [...SEED_FRIENDS], incoming: [...SEED_INCOMING], outgoing: [...SEED_OUTGOING],
    blocked: [...SEED_BLOCKED], spaces: [...SEED_SPACES], muted: [], prefs,
  };
}

type FriendOp = "accept" | "decline" | "cancel" | "remove" | "block" | "unblock";

export type Action =
  | { type: "scenario"; scenario: Scenario }
  | { type: "send"; convId: string; id: string; text: string; at: number; replyToId?: string; attachments?: Attachment[] }
  | { type: "retry"; convId: string; id: string }
  | { type: "edit"; convId: string; id: string; text: string; at: number }
  | { type: "delete"; convId: string; id: string }
  | { type: "react"; convId: string; id: string; emoji: string }
  | { type: "read"; convId: string }
  | { type: "openDm"; personId: string }
  | { type: "friend"; op: FriendOp; personId: string }
  | { type: "request"; personId: string }
  | { type: "joinSpace"; spaceId: string }
  | { type: "mute"; convId: string }
  | { type: "me"; patch: Partial<Person> }
  | { type: "prefs"; patch: Partial<Prefs> }
  | { type: "theme"; design: DesignKey; theme: ThemePref };

const without = (list: string[], id: string) => list.filter((x) => x !== id);
const toFront = (list: string[], id: string) => [id, ...without(list, id)];

function patchMessage(state: ChatState, convId: string, id: string, fn: (m: Message) => Message | null): ChatState {
  const list = state.messages[convId] ?? [];
  const next: Message[] = [];
  for (const m of list) {
    if (m.id !== id) next.push(m);
    else {
      const r = fn(m);
      if (r) next.push(r);
    }
  }
  return { ...state, messages: { ...state.messages, [convId]: next } };
}

function reducer(state: ChatState, a: Action): ChatState {
  switch (a.type) {
    case "scenario":
      return build(a.scenario, state.prefs);
    case "send": {
      const msg: Message = {
        id: a.id, convId: a.convId, authorId: ME, text: a.text, at: a.at, replyToId: a.replyToId,
        attachments: a.attachments, reactions: [], local: true, failed: state.scenario === "offline",
      };
      const conv = state.conversations[a.convId];
      const recent = conv && conv.kind !== "channel" ? toFront(state.recent, a.convId) : state.recent;
      return {
        ...state,
        recent,
        messages: { ...state.messages, [a.convId]: [...(state.messages[a.convId] ?? []), msg] },
        unread: { ...state.unread, [a.convId]: 0 },
        mentions: { ...state.mentions, [a.convId]: false },
      };
    }
    case "retry":
      if (state.scenario === "offline") return state;
      return patchMessage(state, a.convId, a.id, (m) => ({ ...m, failed: false }));
    case "edit":
      return patchMessage(state, a.convId, a.id, (m) => (m.text === a.text ? m : { ...m, text: a.text, editedAt: a.at }));
    case "delete":
      return patchMessage(state, a.convId, a.id, () => null);
    case "react":
      return patchMessage(state, a.convId, a.id, (m) => {
        const existing = m.reactions.find((r) => r.emoji === a.emoji);
        let reactions;
        if (!existing) reactions = [...m.reactions, { emoji: a.emoji, userIds: [ME] }];
        else if (existing.userIds.includes(ME)) {
          reactions = m.reactions
            .map((r) => (r.emoji === a.emoji ? { ...r, userIds: without(r.userIds, ME) } : r))
            .filter((r) => r.userIds.length > 0);
        } else reactions = m.reactions.map((r) => (r.emoji === a.emoji ? { ...r, userIds: [...r.userIds, ME] } : r));
        return { ...m, reactions };
      });
    case "read":
      if (!state.unread[a.convId] && !state.mentions[a.convId]) return state;
      return { ...state, unread: { ...state.unread, [a.convId]: 0 }, mentions: { ...state.mentions, [a.convId]: false } };
    case "openDm": {
      const id = `dm-${a.personId}`;
      const conversations = state.conversations[id]
        ? state.conversations
        : { ...state.conversations, [id]: { id, kind: "dm" as const, personId: a.personId } };
      const recent = state.recent.includes(id) ? state.recent : [id, ...state.recent];
      return { ...state, conversations, recent };
    }
    case "friend": {
      const p = a.personId;
      switch (a.op) {
        case "accept":
          return { ...state, incoming: without(state.incoming, p), friends: [...without(state.friends, p), p] };
        case "decline":
          return { ...state, incoming: without(state.incoming, p) };
        case "cancel":
          return { ...state, outgoing: without(state.outgoing, p) };
        case "remove":
          return { ...state, friends: without(state.friends, p) };
        case "block":
          return {
            ...state, friends: without(state.friends, p), incoming: without(state.incoming, p),
            outgoing: without(state.outgoing, p), blocked: [...without(state.blocked, p), p],
          };
        case "unblock":
          return { ...state, blocked: without(state.blocked, p) };
      }
      return state;
    }
    case "request":
      return { ...state, outgoing: [...without(state.outgoing, a.personId), a.personId] };
    case "joinSpace":
      return state.spaces.includes(a.spaceId) ? state : { ...state, spaces: [...state.spaces, a.spaceId] };
    case "mute":
      return { ...state, muted: state.muted.includes(a.convId) ? without(state.muted, a.convId) : [...state.muted, a.convId] };
    case "me":
      return { ...state, people: { ...state.people, [ME]: { ...state.people[ME], ...a.patch } } };
    case "prefs":
      return { ...state, prefs: { ...state.prefs, ...a.patch } };
    case "theme":
      return { ...state, prefs: { ...state.prefs, themes: { ...state.prefs.themes, [a.design]: a.theme } } };
  }
}

let seq = 0;
const localId = () => `local-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function makeActions(dispatch: (a: Action) => void) {
  return {
    send(convId: string, text: string, opts: { replyToId?: string; attachments?: Attachment[] } = {}) {
      const id = localId();
      dispatch({ type: "send", convId, id, text, at: Date.now(), ...opts });
      return id;
    },
    retry: (convId: string, id: string) => dispatch({ type: "retry", convId, id }),
    edit: (convId: string, id: string, text: string) => dispatch({ type: "edit", convId, id, text, at: Date.now() }),
    remove: (convId: string, id: string) => dispatch({ type: "delete", convId, id }),
    react: (convId: string, id: string, emoji: string) => dispatch({ type: "react", convId, id, emoji }),
    read: (convId: string) => dispatch({ type: "read", convId }),
    openDm: (personId: string) => {
      dispatch({ type: "openDm", personId });
      return `dm-${personId}`;
    },
    friend: (op: FriendOp, personId: string) => dispatch({ type: "friend", op, personId }),
    request: (personId: string) => dispatch({ type: "request", personId }),
    joinSpace: (spaceId: string) => dispatch({ type: "joinSpace", spaceId }),
    mute: (convId: string) => dispatch({ type: "mute", convId }),
    setMe: (patch: Partial<Person>) => dispatch({ type: "me", patch }),
    setPrefs: (patch: Partial<Prefs>) => dispatch({ type: "prefs", patch }),
    setTheme: (design: DesignKey, theme: ThemePref) => dispatch({ type: "theme", design, theme }),
    setScenario: (scenario: Scenario) => dispatch({ type: "scenario", scenario }),
  };
}

export type Actions = ReturnType<typeof makeActions>;

const Ctx = createContext<{ state: ChatState; actions: Actions } | null>(null);

export function ChatProvider({ children, scenario = "normal" }: { children: ReactNode; scenario?: Scenario }) {
  const [state, dispatch] = useReducer(reducer, scenario, (s) => build(s));
  const actions = useMemo(() => makeActions(dispatch), []);
  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChat outside ChatProvider");
  return v;
}

export { CHANNELS, ME };
