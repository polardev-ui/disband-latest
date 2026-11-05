"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { useVoiceSession } from "@/contexts/VoiceSessionContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { displayName } from "@/lib/utils";
import { requestNotificationPermissionFromGesture } from "@/lib/notifications";
import {
  disconnectFromStage,
  endStage,
  inviteToSpeak,
  moveToAudience,
  raiseHand,
  respondToInvite,
  setStageRequests,
  startStage,
} from "@/lib/stage";
import { Avatar } from "@/components/ui/Avatar";
import { CallStage, ParticipantMenu, type StageMember, type StageScreen } from "./CallStage";
import { CallButton } from "./CallUI";
import { StreamShareButton } from "./StreamMenu";
import {
  IconClose,
  IconHand,
  IconHeadphones,
  IconHeadphonesOff,
  IconMic,
  IconMicOff,
  IconMoveDown,
  IconPhoneOff,
  IconStage,
  IconVideo,
  IconVideoOff,
} from "@/components/icons";
import type { Channel, Profile, VoicePresence } from "@/lib/supabase/types";

/*
 A stage: speakers up top, the audience below, muted. Moderators (Manage
 Channels) open it with a topic, bring people up and move them back down.
 Who may do what is decided by the database (lib/stage.ts), and the voice
 server only forwards speakers, so this screen just offers the right buttons.
*/

type Row = VoicePresence & { profile?: Profile };
type StageState = Pick<Channel, "stage_topic" | "stage_started_at" | "stage_requests_enabled">;

const TOPIC_MAX = 120;

export function StagePanel({ channel }: { channel: Channel }) {
  const { t } = useI18n();
  const {
    user, voicePresence, loadVoicePresence, micMuted, deafened, setMicMuted, setDeafened, hasServerPermission,
  } = useApp();
  const session = useVoiceSession();
  const inThisChannel = session.connectedChannelId === channel.id;
  const joined = session.joined && inThisChannel;
  const isModerator = hasServerPermission("manage_channels");

  const [stage, setStage] = useState<StageState>({
    stage_topic: channel.stage_topic ?? null,
    stage_started_at: channel.stage_started_at ?? null,
    stage_requests_enabled: channel.stage_requests_enabled ?? true,
  });
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [editingTopic, setEditingTopic] = useState(false);
  // "Continue without starting": a moderator sets up before opening.
  const [skipStart, setSkipStart] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [menu, setMenu] = useState<{ member: StageMember; x: number; y: number } | null>(null);

  // The stage's own row, live: topic, open or not, requests on or off.
  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();
    const read = async () => {
      const { data } = await supabase
        .from("channels")
        .select("stage_topic, stage_started_at, stage_requests_enabled")
        .eq("id", channel.id)
        .maybeSingle();
      if (active && data) setStage(data as StageState);
    };
    void read();
    const sub = supabase
      .channel(`stage:${channel.id}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "channels", filter: `id=eq.${channel.id}` }, (change) => {
        if (active) setStage(change.new as StageState);
      })
      .subscribe();
    return () => {
      active = false;
      void sub.unsubscribe();
    };
  }, [channel.id]);

  useEffect(() => {
    void loadVoicePresence(channel.id);
    if (!inThisChannel) session.peek(channel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, inThisChannel]);

  useEffect(() => {
    if (joined || session.error) setJoining(false);
  }, [joined, session.error]);

  const rows: Row[] = inThisChannel ? session.participants : voicePresence;
  const me = rows.find((r) => r.user_id === user?.id);
  const speakers = rows.filter((r) => r.stage_speaker);
  const audience = rows.filter((r) => !r.stage_speaker);
  const hands = audience
    .filter((r) => r.stage_hand_raised_at)
    .sort((a, b) => (a.stage_hand_raised_at ?? "").localeCompare(b.stage_hand_raised_at ?? ""));
  const amSpeaker = !!me?.stage_speaker;
  const open = !!stage.stage_topic;

  const run = async (fn: () => Promise<string | null>) => {
    setError(null);
    const err = await fn();
    if (err) setError(err);
    return !err;
  };

  const join = () => {
    setJoining(true);
    setError(null);
    void requestNotificationPermissionFromGesture();
    void session.connect(channel.id, channel.name);
  };

  const submitTopic = async () => {
    const topic = topicDraft.trim();
    if (!topic) return;
    if (await run(() => startStage(channel.id, topic))) {
      setEditingTopic(false);
      // Whoever opens the stage starts on it.
      if (!amSpeaker && user) void run(() => inviteToSpeak(channel.id, user.id));
    }
  };

  const nameOf = (r: Row) => (r.profile ? displayName(r.profile) : t("Member"));

  // Right-click actions a moderator gets on someone (and anyone gets on themselves).
  const extrasFor = (r: Row): StageMember["menuExtras"] => {
    const self = r.user_id === user?.id;
    const items: NonNullable<StageMember["menuExtras"]> = [];
    if (r.stage_speaker && (self || isModerator)) {
      items.push({ label: t("Move to Audience"), onSelect: () => void run(() => moveToAudience(channel.id, r.user_id)) });
    }
    if (!r.stage_speaker && isModerator) {
      items.push({
        label: self ? t("Become a Speaker") : t("Invite to Speak"),
        onSelect: () => void run(() => inviteToSpeak(channel.id, r.user_id)),
      });
    }
    if (isModerator && !self) {
      items.push({ label: t("Disconnect from Stage"), danger: true, onSelect: () => void run(() => disconnectFromStage(channel.id, r.user_id)) });
    }
    return items;
  };

  const speakerMembers: StageMember[] = speakers.map((r) => {
    const self = r.user_id === user?.id;
    return {
      id: r.user_id,
      profile: r.profile,
      label: nameOf(r) + (self ? ` ${t("(you)")}` : ""),
      stream: inThisChannel ? (self ? session.localStream : session.remoteStreams.get(r.user_id)) ?? null : null,
      mirrored: self,
      muted: self ? micMuted : !!(r.muted || r.deafened),
      menuExtras: extrasFor(r),
    };
  });

  const screens: StageScreen[] = inThisChannel
    ? speakers.flatMap((r) => {
        const self = r.user_id === user?.id;
        const stream = self ? session.localScreen : session.remoteScreens.get(r.user_id);
        if (!stream) return [];
        return [{
          id: `screen:${r.user_id}`,
          profile: r.profile,
          label: self ? t("Your screen") : t("{name}'s screen", { name: nameOf(r) }),
          stream,
          audio: self ? null : session.remoteScreenAudio.get(r.user_id) ?? null,
          local: self,
        }];
      })
    : [];

  const waiting = joined && !open && !(isModerator && skipStart);

  return (
    <main className="call-enter flex min-w-0 flex-1 bg-bg-primary">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-divider px-4">
          <IconStage size={20} className={`shrink-0 ${open ? "text-status-online" : "text-text-muted"}`} />
          <h1 className="min-w-0 truncate text-[16px] font-semibold text-header-primary">
            {open ? stage.stage_topic : channel.name}
          </h1>
          {open && <span className="hidden shrink-0 text-[13px] text-header-secondary sm:inline">{channel.name}</span>}
          <div className="ml-auto flex shrink-0 items-center gap-3 text-[12px] text-header-secondary">
            <span className="hidden items-center gap-1 sm:flex"><IconMic size={14} /> {t("{count} speaking", { count: speakers.length })}</span>
            <span className="hidden items-center gap-1 sm:flex"><IconHeadphones size={14} /> {t("{count} listening", { count: audience.length })}</span>
            {isModerator && open && (
              <>
                <button type="button" onClick={() => { setTopicDraft(stage.stage_topic ?? ""); setEditingTopic(true); }}
                  className="rounded-[4px] px-2 py-1 font-medium text-interactive-normal hover:bg-interactive-hover hover:text-interactive-active">
                  {t("Edit Topic")}
                </button>
                <button type="button" onClick={() => void run(() => endStage(channel.id))}
                  className="rounded-[4px] px-2 py-1 font-medium text-status-dnd hover:bg-status-dnd/15">
                  {t("End Stage")}
                </button>
              </>
            )}
          </div>
        </header>

        {joined && me?.stage_invited && (
          <div className="flex shrink-0 items-center justify-center gap-3 bg-status-online px-4 py-2 text-[14px] font-medium text-white">
            {t("You've been invited to speak.")}
            <button type="button" onClick={() => void run(() => respondToInvite(channel.id, true))}
              className="rounded-[3px] bg-white px-3 py-0.5 text-[13px] font-semibold text-[#1a6334] hover:bg-white/90">
              {t("Accept")}
            </button>
            <button type="button" onClick={() => void run(() => respondToInvite(channel.id, false))}
              className="rounded-[3px] bg-black/20 px-3 py-0.5 text-[13px] font-semibold hover:bg-black/30">
              {t("Decline")}
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-4">
          {!joined ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span className={`mb-4 flex h-20 w-20 items-center justify-center rounded-full ${open ? "bg-status-online/15 text-status-online" : "bg-bg-secondary text-text-muted"}`}>
                <IconStage size={36} />
              </span>
              <h2 className="max-w-lg text-[20px] font-bold leading-6 text-header-primary">{open ? stage.stage_topic : channel.name}</h2>
              <p className="mt-1.5 text-[14px] text-header-secondary">
                {open
                  ? t("{speakers} speaking · {listeners} listening", { speakers: speakers.length, listeners: audience.length })
                  : t("This stage hasn't started yet.")}
              </p>
              <button
                type="button"
                disabled={joining}
                onClick={join}
                className="mt-5 flex h-11 items-center gap-2 rounded-full bg-button-green px-6 text-[15px] font-medium text-white transition-colors hover:bg-button-green-hover disabled:cursor-wait disabled:opacity-60"
              >
                <IconHeadphones size={18} />
                {joining ? t("Joining…") : t("Join Stage")}
              </button>
              <p className="mt-3 text-[12px] text-text-muted">{t("You'll join the audience, muted.")}</p>
            </div>
          ) : waiting || (isModerator && editingTopic) ? (
            <div className="flex flex-1 flex-col items-center justify-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bg-secondary text-text-muted">
                <IconStage size={30} />
              </span>
              <h2 className="text-[20px] font-bold text-header-primary">
                {editingTopic ? t("Edit the topic") : t("Waiting for the Stage to start.")}
              </h2>
              {isModerator ? (
                <div className="mt-5 w-full max-w-md">
                  <p className="mb-3 text-center text-[14px] text-header-secondary">{t("What will you be talking about today?")}</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitTopic();
                    }}
                    className="rounded-lg bg-bg-secondary p-3"
                  >
                    <input
                      autoFocus
                      value={topicDraft}
                      maxLength={TOPIC_MAX}
                      onChange={(e) => setTopicDraft(e.target.value)}
                      placeholder={t("Topic")}
                      className="h-10 w-full rounded-[4px] bg-bg-tertiary px-3 text-[15px] text-text-normal outline-none placeholder:text-text-muted focus:ring-2 focus:ring-brand"
                    />
                    <div className="mt-3 flex items-center justify-end gap-2">
                      {editingTopic ? (
                        <button type="button" onClick={() => setEditingTopic(false)}
                          className="h-9 rounded-[4px] px-4 text-[14px] font-medium text-text-normal hover:underline">
                          {t("Cancel")}
                        </button>
                      ) : (
                        <button type="button" onClick={() => setSkipStart(true)}
                          className="h-9 rounded-[4px] px-4 text-[14px] font-medium text-text-normal hover:underline">
                          {t("Continue without starting")}
                        </button>
                      )}
                      <button type="submit" disabled={!topicDraft.trim()}
                        className="h-9 rounded-[4px] bg-button-green px-4 text-[14px] font-medium text-white hover:bg-button-green-hover disabled:opacity-50">
                        {editingTopic ? t("Save") : t("Start the Stage")}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <p className="mt-2 text-[14px] text-header-secondary">
                  {t("{count} waiting", { count: rows.length })}
                </p>
              )}
            </div>
          ) : (
            <div className="flex w-full max-w-5xl flex-1 flex-col gap-5 py-4">
              <section className="flex min-h-[220px] flex-col">
                <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
                  <IconMic size={14} /> {t("Speakers — {count}", { count: speakers.length })}
                </h3>
                {speakers.length > 0 ? (
                  <CallStage members={speakerMembers} screens={screens} deafened={deafened} />
                ) : (
                  <p className="flex flex-1 items-center justify-center rounded-lg bg-bg-secondary/60 text-[14px] text-text-muted">
                    {t("Nobody is on stage yet.")}
                  </p>
                )}
              </section>
              <section>
                <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
                  <IconHeadphones size={14} /> {t("Audience — {count}", { count: audience.length })}
                </h3>
                <div className="flex flex-wrap gap-x-4 gap-y-4">
                  {audience.map((r) => {
                    const member: StageMember = { id: r.user_id, profile: r.profile, label: nameOf(r), menuExtras: extrasFor(r) };
                    return (
                      <button
                        key={r.user_id}
                        type="button"
                        onClick={(e) => setMenu({ member, x: e.clientX, y: e.clientY })}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ member, x: e.clientX, y: e.clientY });
                        }}
                        className="flex w-20 flex-col items-center gap-1.5 rounded-lg p-1 hover:bg-interactive-hover"
                      >
                        <span className="relative">
                          <Avatar size="lg" profile={r.profile ?? { display_name: nameOf(r), avatar_url: null }} className="h-14 w-14" />
                          {r.stage_hand_raised_at && (
                            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-bg-floating text-[#f0b232] shadow" title={t("Requested to speak")}>
                              <IconHand size={14} />
                            </span>
                          )}
                        </span>
                        <span className="max-w-full truncate text-[12px] text-header-secondary">{nameOf(r)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {(error || session.error) && (
            <p role="alert" className="mt-2 max-w-md rounded-[4px] bg-status-dnd/15 px-3 py-2 text-center text-[14px] text-status-dnd">
              {error ?? session.error}
            </p>
          )}

          {joined && (
            <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-3 pb-2">
              {amSpeaker ? (
                <>
                  <CallButton label={session.cameraEnabled ? t("Turn Off Camera") : t("Turn On Camera")} on={session.cameraEnabled}
                    onClick={() => void session.toggleCamera().catch(() => setError(t("Couldn't access the camera.")))}>
                    {session.cameraEnabled ? <IconVideo size={24} /> : <IconVideoOff size={24} />}
                  </CallButton>
                  <StreamShareButton sharing={session.screenEnabled}
                    onToggle={() => session.toggleScreenShare().catch(() => setError(t("Couldn't start screen sharing.")))} />
                  <CallButton label={micMuted ? t("Unmute") : t("Mute")} warn={micMuted} onClick={() => setMicMuted(!micMuted)}>
                    {micMuted ? <IconMicOff size={24} /> : <IconMic size={24} />}
                  </CallButton>
                  <CallButton label={t("Move to Audience")} onClick={() => user && void run(() => moveToAudience(channel.id, user.id))}>
                    <IconMoveDown size={22} />
                  </CallButton>
                </>
              ) : isModerator ? (
                <CallButton label={t("Become a Speaker")} onClick={() => user && void run(() => inviteToSpeak(channel.id, user.id))}>
                  <IconMic size={24} />
                </CallButton>
              ) : (
                <CallButton
                  label={me?.stage_hand_raised_at ? t("Lower Hand") : stage.stage_requests_enabled ? t("Request to Speak") : t("Requests to speak are off")}
                  on={!!me?.stage_hand_raised_at}
                  onClick={() => {
                    if (!stage.stage_requests_enabled && !me?.stage_hand_raised_at) return;
                    void run(() => raiseHand(channel.id, !me?.stage_hand_raised_at));
                  }}
                >
                  <IconHand size={24} />
                </CallButton>
              )}
              <CallButton label={deafened ? t("Undeafen") : t("Deafen")} warn={deafened} onClick={() => setDeafened(!deafened)}>
                {deafened ? <IconHeadphonesOff size={24} /> : <IconHeadphones size={24} />}
              </CallButton>
              {isModerator && (
                <button
                  type="button"
                  onClick={() => setShowRequests((v) => !v)}
                  className={`relative flex h-14 items-center gap-2 rounded-full px-5 text-[14px] font-medium transition-colors ${
                    showRequests ? "bg-white text-[#313338]" : "bg-[#2b2d31] text-white hover:bg-[#404249]"
                  }`}
                >
                  <IconHand size={20} />
                  {t("Requests")}
                  {hands.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-dnd px-1.5 text-[12px] font-bold text-white">{hands.length}</span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => void session.disconnect()}
                className="flex h-14 items-center gap-2 rounded-full bg-status-dnd px-5 text-[14px] font-medium text-white transition-colors hover:bg-button-danger-hover"
              >
                <IconPhoneOff size={20} />
                {t("Leave Quietly")}
              </button>
            </div>
          )}
        </div>
      </div>

      {joined && isModerator && showRequests && (
        <aside className="flex w-[300px] shrink-0 flex-col border-l border-divider bg-bg-secondary">
          <div className="flex h-12 items-center gap-2 border-b border-divider px-4">
            <IconHand size={18} className="text-text-muted" />
            <h2 className="flex-1 text-[15px] font-semibold text-header-primary">{t("Requests to Speak")}</h2>
            <button type="button" aria-label={t("Close")} onClick={() => setShowRequests(false)} className="text-interactive-normal hover:text-interactive-active">
              <IconClose size={18} />
            </button>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[14px] text-text-normal">
            {t("Allow requests to speak")}
            <input
              type="checkbox"
              checked={!!stage.stage_requests_enabled}
              onChange={(e) => void run(() => setStageRequests(channel.id, e.target.checked))}
              className="h-4 w-4 accent-[var(--status-online)]"
            />
          </label>
          <p className="px-4 pb-2 text-[12px] font-bold uppercase text-header-secondary">{t("Requests — {count}", { count: hands.length })}</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {hands.length === 0 && <p className="px-2 text-[13px] text-text-muted">{t("No raised hands right now.")}</p>}
            {hands.map((r) => (
              <div key={r.user_id} className="flex items-center gap-2.5 rounded-[4px] px-2 py-1.5 hover:bg-interactive-hover">
                <Avatar size="sm" profile={r.profile ?? { display_name: nameOf(r), avatar_url: null }} className="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate text-[14px] text-text-normal">{nameOf(r)}</span>
                <button type="button" title={t("Invite to Speak")} onClick={() => void run(() => inviteToSpeak(channel.id, r.user_id))}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-tertiary text-status-online hover:bg-status-online hover:text-white">
                  <IconMic size={15} />
                </button>
                <button type="button" title={t("Dismiss")} onClick={() => void run(() => moveToAudience(channel.id, r.user_id))}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-tertiary text-interactive-normal hover:bg-status-dnd hover:text-white">
                  <IconClose size={15} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      {menu && <ParticipantMenu member={menu.member} at={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)} />}
    </main>
  );
}
