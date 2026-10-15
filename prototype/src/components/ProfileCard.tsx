import { useRef, useState, type CSSProperties } from "react";
import { Check, Ellipsis, MessageCircle, UserPlus } from "lucide-react";
import { ME, SPACES } from "../data/seed";
import { effectivePresence, mutualSpaces, PRESENCE_LABEL } from "../state/selectors";
import { useChat } from "../state/store";
import { Avatar, SpaceIcon } from "./Avatar";
import { useConfirm } from "./Confirm";
import { Popover } from "./Popover";
import { useToast } from "./Toast";

export function ProfileCard({
  personId,
  spaceId,
  variant = "popover",
  onMessage,
  onEditProfile,
}: {
  personId: string;
  spaceId?: string;
  variant?: "popover" | "panel";
  onMessage?: (personId: string) => void;
  onEditProfile?: () => void;
}) {
  const { state, actions } = useChat();
  const toast = useToast();
  const [confirmEl, ask] = useConfirm();
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const person = state.people[personId];

  if (!person || person.unavailable) {
    return (
      <div className={`pc pc--${variant} pc--unavailable`}>
        <div className="pc-head">
          <Avatar person={person} size={variant === "panel" ? 64 : 48} />
          <div className="pc-names">
            <h3 className="pc-name">Profile unavailable</h3>
          </div>
        </div>
        <p className="pc-text">This account may have been deleted or suspended. Messages it sent before are still shown in conversations.</p>
      </div>
    );
  }

  const presence = effectivePresence(state, person);
  const isMe = personId === ME;
  const friend = state.friends.includes(personId);
  const incoming = state.incoming.includes(personId);
  const outgoing = state.outgoing.includes(personId);
  const blocked = state.blocked.includes(personId);
  const space = spaceId ? SPACES[spaceId] : undefined;
  const role = space?.roles[personId];
  const mutual = isMe ? [] : mutualSpaces(state, personId);

  return (
    <div className={`pc pc--${variant}`} style={{ "--av": person.accent } as CSSProperties}>
      <div className="pc-banner" aria-hidden="true" />
      <div className="pc-head">
        <Avatar person={person} size={variant === "panel" ? 72 : 56} presence={presence} />
        <div className="pc-names">
          <h3 className="pc-name">{person.name}</h3>
          <p className="pc-handle">@{person.username}{person.pronouns ? ` · ${person.pronouns}` : ""}</p>
        </div>
      </div>
      <p className="pc-presence">
        <span className="pc-dot" data-p={presence} aria-hidden="true" />
        <span>{PRESENCE_LABEL[presence]}{person.note && presence !== "offline" ? ` · ${person.note}` : ""}</span>
      </p>

      <div className="pc-actions">
        {isMe ? (
          <button type="button" className="btn btn--primary" onClick={onEditProfile}>Edit profile</button>
        ) : blocked ? (
          <button type="button" className="btn btn--ghost" onClick={() => actions.friend("unblock", personId)}>Unblock</button>
        ) : (
          <>
            {onMessage && (
              <button type="button" className="btn btn--primary" onClick={() => onMessage(personId)}>
                <MessageCircle size={16} aria-hidden="true" /> Message
              </button>
            )}
            {friend ? (
              <span className="pc-rel"><Check size={15} aria-hidden="true" /> Friends</span>
            ) : incoming ? (
              <button type="button" className="btn btn--ghost" onClick={() => { actions.friend("accept", personId); toast(`You and ${person.name} are now friends`); }}>
                Accept request
              </button>
            ) : outgoing ? (
              <span className="pc-rel">Request sent</span>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => { actions.request(personId); toast(`Friend request sent to @${person.username}`); }}>
                <UserPlus size={16} aria-hidden="true" /> Add friend
              </button>
            )}
            <button ref={moreRef} type="button" className="btn btn--icon" aria-label={`More options for ${person.name}`} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((v) => !v)}>
              <Ellipsis size={17} />
            </button>
            {more && (
              <Popover anchor={moreRef} onClose={() => setMore(false)} className="menu-pop" label="Profile options">
                <div className="menu" role="menu">
                  <button type="button" role="menuitem" className="menu-item" onClick={async () => { setMore(false); await navigator.clipboard?.writeText(person.username).catch(() => {}); toast("Username copied"); }}>
                    Copy username
                  </button>
                  {friend && (
                    <button type="button" role="menuitem" className="menu-item" onClick={async () => {
                      setMore(false);
                      if (await ask({ title: `Remove ${person.name} as a friend?`, body: "You can still talk in shared spaces. You'll need to send a new request to be friends again.", confirm: "Remove friend", danger: true })) {
                        actions.friend("remove", personId);
                        toast(`Removed ${person.name} from friends`);
                      }
                    }}>
                      Remove friend
                    </button>
                  )}
                  <button type="button" role="menuitem" className="menu-item menu-item--danger" onClick={async () => {
                    setMore(false);
                    if (await ask({ title: `Block ${person.name}?`, body: "They won't be able to message you or send friend requests. They aren't told that you blocked them.", confirm: "Block", danger: true })) {
                      actions.friend("block", personId);
                      toast(`Blocked ${person.name}`);
                    }
                  }}>
                    Block
                  </button>
                </div>
              </Popover>
            )}
          </>
        )}
      </div>

      <dl className="pc-facts">
        {person.bio && (
          <div className="pc-fact">
            <dt>About</dt>
            <dd>{person.bio}</dd>
          </div>
        )}
        {role && (
          <div className="pc-fact">
            <dt>Role in {space!.name}</dt>
            <dd>{role}</dd>
          </div>
        )}
        <div className="pc-fact">
          <dt>On Disband since</dt>
          <dd>{person.joined}</dd>
        </div>
        {mutual.length > 0 && (
          <div className="pc-fact">
            <dt>{mutual.length === 1 ? "1 space in common" : `${mutual.length} spaces in common`}</dt>
            <dd className="pc-spaces">
              {mutual.map((s) => (
                <span key={s.id} className="pc-space"><SpaceIcon space={s} size={18} />{s.name}</span>
              ))}
            </dd>
          </div>
        )}
      </dl>
      {confirmEl}
    </div>
  );
}
