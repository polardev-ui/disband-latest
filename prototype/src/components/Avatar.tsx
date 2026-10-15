import type { CSSProperties } from "react";
import { UserRound } from "lucide-react";
import type { Person, Presence, Space } from "../data/types";
import { initials } from "../state/selectors";

// Shared markup; every design styles .av / .av-dot / .gav / .spi itself.

export function Avatar({
  person,
  size = 32,
  presence,
  className = "",
}: {
  person?: Person;
  size?: number;
  presence?: Presence | null;
  className?: string;
}) {
  const style = { "--av": person?.accent ?? "#6b7280", "--av-size": `${size}px` } as CSSProperties;
  return (
    <span className={`av ${className}`} style={style} data-unavailable={person?.unavailable || undefined} aria-hidden="true">
      {person && !person.unavailable ? (
        <span className="av-initials">{initials(person.name)}</span>
      ) : (
        <UserRound className="av-ghost" size={Math.round(size * 0.55)} />
      )}
      {presence && <span className="av-dot" data-p={presence} />}
    </span>
  );
}

export function GroupAvatar({ people, size = 32, className = "" }: { people: Person[]; size?: number; className?: string }) {
  const [a, b] = people;
  const style = { "--av-size": `${size}px` } as CSSProperties;
  return (
    <span className={`gav ${className}`} style={style} aria-hidden="true">
      <Avatar person={a} size={Math.round(size * 0.68)} className="gav-a" />
      <Avatar person={b} size={Math.round(size * 0.68)} className="gav-b" />
    </span>
  );
}

export function SpaceIcon({ space, size = 40, className = "" }: { space: Space; size?: number; className?: string }) {
  const style = { "--sp": space.color, "--sp-size": `${size}px` } as CSSProperties;
  return (
    <span className={`spi ${className}`} style={style} aria-hidden="true">
      {space.initials}
    </span>
  );
}
