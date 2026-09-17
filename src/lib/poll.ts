"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

export interface Poll {
  id: string;
  question: string;
  options: string[];
  counts: number[];
  closed: boolean;
  authorId: string | null;

  myVote: number | null;
}

interface PollPayload {
  id?: string;
  question?: string;
  options?: string[] | null;
  counts?: number[] | null;
  closed?: boolean;
  author_id?: string | null;
  my_vote?: number | null;
}

function normalize(data: PollPayload | null): Poll {
  if (!data?.id) throw new Error("Poll not found");
  const options = data.options ?? [];
  const counts = data.counts ?? [];
  return {
    id: data.id,
    question: data.question ?? "",
    options,

    counts: options.map((_, i) => counts[i] ?? 0),
    closed: data.closed === true,
    authorId: data.author_id ?? null,
    myVote: typeof data.my_vote === "number" ? data.my_vote : null,
  };
}

export function totalVotes(poll: Poll): number {
  return poll.counts.reduce((sum, n) => sum + n, 0);
}

export async function createPoll(question: string, options: string[]): Promise<Poll> {
  const { data, error } = await getSupabaseClient().rpc("create_poll", {
    p_question: question,
    p_options: options,
  });
  if (error) throw new Error(error.message);
  return normalize(data as PollPayload);
}

export async function getPoll(id: string): Promise<Poll> {
  const { data, error } = await getSupabaseClient().rpc("get_poll", { p_poll: id });
  if (error) throw new Error(error.message);
  return normalize(data as PollPayload);
}

export async function votePoll(id: string, optionIndex: number): Promise<Poll> {
  const { data, error } = await getSupabaseClient().rpc("vote_poll", {
    p_poll: id,
    p_option: optionIndex,
  });
  if (error) throw new Error(error.message);
  return normalize(data as PollPayload);
}

export async function closePoll(id: string): Promise<Poll> {
  const { data, error } = await getSupabaseClient().rpc("close_poll", { p_poll: id });
  if (error) throw new Error(error.message);
  return normalize(data as PollPayload);
}
