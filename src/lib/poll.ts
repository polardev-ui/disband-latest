const POLL_API = "https://api.wsgpolar.me";

export interface PollOption {
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  closed: boolean;
}

/**
 * Wire format returned by the poll service.
 *
 * Options come back as plain strings with a parallel `counts` array rather than
 * as objects, so everything below normalises into {@link PollOption} before it
 * reaches the UI. Object-shaped options are tolerated too, in case the service
 * changes.
 */
interface ApiPoll {
  id?: string;
  question?: string;
  options?: (string | { text?: string; label?: string; votes?: number })[];
  counts?: number[];
  votes?: number[];
  closed?: boolean;
}

function normalizePoll(data: ApiPoll): Poll {
  const counts = data.counts ?? data.votes ?? [];
  const options = (data.options ?? []).map((opt, i) => {
    if (typeof opt === "string") {
      return { text: opt, votes: counts[i] ?? 0 };
    }
    return {
      text: opt.text ?? opt.label ?? "",
      votes: opt.votes ?? counts[i] ?? 0,
    };
  });

  return {
    id: data.id ?? "",
    question: data.question ?? "",
    options,
    closed: data.closed === true,
  };
}

export async function createPoll(question: string, options: string[]): Promise<Poll> {
  const res = await fetch(`${POLL_API}/v1/polls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, options }),
  });
  if (!res.ok) throw new Error("Poll creation failed");
  const data = (await res.json()) as ApiPoll;
  if (!data?.id) throw new Error("Poll creation returned no id");
  return normalizePoll(data);
}

export async function getPoll(id: string): Promise<Poll> {
  const res = await fetch(`${POLL_API}/v1/polls/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Poll fetch failed");
  const data = (await res.json()) as ApiPoll;
  if (!data?.id) throw new Error("Poll not found");
  return normalizePoll(data);
}

/** Returns the updated poll so callers don't need a follow-up fetch. */
export async function votePoll(id: string, optionIndex: number): Promise<Poll | null> {
  const res = await fetch(`${POLL_API}/v1/polls/${encodeURIComponent(id)}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ option: optionIndex }),
  });
  if (!res.ok) throw new Error("Vote failed");
  const data = (await res.json().catch(() => null)) as ApiPoll | null;
  return data?.id ? normalizePoll(data) : null;
}
