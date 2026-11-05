"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

/*
 Stage actions. Each is a database function that checks who may do it
 (migration 0212), so the UI only decides what to offer. Each returns an
 error message, or null when it worked.
*/

async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await getSupabaseClient().rpc(fn, args);
  return error ? error.message : null;
}

export const startStage = (channelId: string, topic: string) =>
  call("stage_start", { p_channel_id: channelId, p_topic: topic });

export const endStage = (channelId: string) =>
  call("stage_end", { p_channel_id: channelId });

export const raiseHand = (channelId: string, raised: boolean) =>
  call("stage_raise_hand", { p_channel_id: channelId, p_raised: raised });

/** Invite someone up; inviting yourself (as a moderator) puts you straight on stage. */
export const inviteToSpeak = (channelId: string, userId: string) =>
  call("stage_invite", { p_channel_id: channelId, p_user_id: userId });

export const respondToInvite = (channelId: string, accept: boolean) =>
  call("stage_respond_invite", { p_channel_id: channelId, p_accept: accept });

/** Yourself, or (moderators) anyone. Also dismisses a raised hand. */
export const moveToAudience = (channelId: string, userId: string) =>
  call("stage_move_to_audience", { p_channel_id: channelId, p_user_id: userId });

export const disconnectFromStage = (channelId: string, userId: string) =>
  call("stage_disconnect", { p_channel_id: channelId, p_user_id: userId });

export const setStageRequests = (channelId: string, enabled: boolean) =>
  call("stage_set_requests", { p_channel_id: channelId, p_enabled: enabled });

export async function isStageModerator(channelId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc("is_stage_moderator", {
    p_channel_id: channelId,
    p_user_id: userId,
  });
  return !error && data === true;
}
