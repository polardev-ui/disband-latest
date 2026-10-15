import { ME, SPACES } from "../data/seed";
import { useChat } from "../state/store";

export type AddResult = { ok: boolean; text: string };

/** Friend-request logic against the sample directory. */
export function useAddFriend() {
  const { state, actions } = useChat();
  return (raw: string): AddResult => {
    const username = raw.trim().replace(/^@/, "").toLowerCase();
    if (!username) return { ok: false, text: "Enter a username first." };
    const person = Object.values(state.people).find((p) => !p.unavailable && p.username.toLowerCase() === username);
    if (!person) return { ok: false, text: `No one goes by @${username}. Usernames are lowercase — check the spelling.` };
    if (person.id === ME) return { ok: false, text: "That's your own username." };
    if (state.friends.includes(person.id)) return { ok: false, text: `You're already friends with ${person.name}.` };
    if (state.blocked.includes(person.id)) return { ok: false, text: `You've blocked ${person.name}. Unblock them in Settings › Privacy first.` };
    if (state.outgoing.includes(person.id)) return { ok: false, text: `You already sent ${person.name} a request.` };
    if (state.incoming.includes(person.id)) {
      actions.friend("accept", person.id);
      return { ok: true, text: `${person.name} had already asked — you're now friends.` };
    }
    actions.request(person.id);
    return { ok: true, text: `Request sent to @${person.username}. You'll see it under Pending until they answer.` };
  };
}

export function useJoinSpace() {
  const { state, actions } = useChat();
  return (raw: string): AddResult & { spaceId?: string } => {
    const code = raw.trim().toLowerCase().replace(/^https?:\/\/[^/]+\/(invite\/)?/, "");
    if (!code) return { ok: false, text: "Paste an invite link or code." };
    const space = Object.values(SPACES).find((s) => s.inviteCode === code);
    if (!space) return { ok: false, text: "That invite doesn't match a space. It may have expired — ask for a new one." };
    if (state.spaces.includes(space.id)) return { ok: true, text: `You're already in ${space.name}.`, spaceId: space.id };
    actions.joinSpace(space.id);
    return { ok: true, text: `Joined ${space.name}.`, spaceId: space.id };
  };
}

export function useFriendLists() {
  const { state } = useChat();
  const people = (ids: string[]) => ids.map((id) => state.people[id]).filter(Boolean);
  const friends = people(state.friends).sort((a, b) => a.name.localeCompare(b.name));
  const presenceOf = (id: string) => (state.prefs.appearOffline && id === ME ? "offline" : state.scenario === "offline" ? "offline" : state.people[id].presence);
  return {
    online: friends.filter((p) => presenceOf(p.id) !== "offline"),
    all: friends,
    incoming: people(state.incoming),
    outgoing: people(state.outgoing),
    blocked: people(state.blocked),
  };
}
