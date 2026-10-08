"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { SkinProvider } from "@/components/theme/SkinProvider";
import { ContextMenuProvider } from "@/components/ui/ContextMenu";
import { AppProvider } from "@/contexts/AppContext";
import { ChatInput } from "@/components/discord/ChatInput";
import { UserPanel } from "@/components/discord/UserPanel";
import { SettingsModal } from "@/components/discord/SettingsModal";
import { ImageLightbox } from "@/components/discord/ImageLightbox";
import { VideoPlayer } from "@/components/discord/VideoPlayer";
import { AudioPlayer } from "@/components/discord/media/AudioPlayer";
import { UserProfileModal } from "@/components/modals/UserProfileModal";
import { GiftModal } from "@/components/gift/GiftModal";
import { GiftCard, type GiftRow } from "@/components/gift/GiftCard";
import { ClaimAnimation } from "@/components/gift/ClaimAnimation";
import type { Profile } from "@/lib/supabase/types";

/*
 Everything here runs on sample data. The one thing that is NOT a mock is
 "Continue to payment" in the gift purchase window: it calls the real gift
 API and opens real Stripe checkout, so close it before paying.
*/

const ME = "viewer-me";
const SAMPLES = "/dev-samples";
const IMAGES = ["03-chat.png", "01-servers.png", "hero-phone.png"];

const base = {
  avatar_url: null, banner_url: null, status: "online", preferred_status: null, theme: "dark",
  avatar_crop: null, show_owner_badge: false, show_staff_badge: false, show_og_badge: false,
  show_bounty_badge: false, created_at: "2026-09-12T12:00:00Z", updated_at: "2026-09-12T12:00:00Z",
} as const;

const PROFILES: Record<string, Profile> = {
  plain: {
    ...base, id: "p-plain", username: "polar", display_name: "polar", pronouns: "he/him",
    accent_color: null, accent_color_2: null, equipped_ring_effect: "ring-orbit",
    bio: 'Disband Owner | "Hello, Disband Support, how may I help?"', status_note: "breaking ankles on blooket",
  } as unknown as Profile,
  accent: {
    ...base, id: "p-accent", username: "mila", display_name: "Mila Oduya", pronouns: "she/her",
    accent_color: "#eb459e", accent_color_2: "#5865f2",
    bio: "Design lead. Ask me about type.\nTimezone: CET", status_note: null,
  } as unknown as Profile,
};

function gift(over: Partial<GiftRow>): GiftRow {
  return {
    code: "TESTCODE01", plan: "aero", months: 3, status: "paid", buyer_id: "someone-else",
    claimed_by: null, expires_at: "2027-10-08T00:00:00Z", ...over,
  };
}

const GIFT_STATES: { label: string; gift: GiftRow }[] = [
  { label: "Claimable (from someone)", gift: gift({}) },
  { label: "Yours, waiting", gift: gift({ buyer_id: ME, plan: "lite", months: 1 }) },
  { label: "Payment pending", gift: gift({ status: "pending", months: 12 }) },
  { label: "Claimed by you", gift: gift({ status: "claimed", claimed_by: ME, months: 6 }) },
  { label: "Claimed by someone else", gift: gift({ status: "claimed", claimed_by: "x" }) },
  { label: "Expired", gift: gift({ status: "expired", plan: "lite" }) },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-divider bg-bg-secondary p-5">
      <h2 className="text-[15px] font-semibold text-text-normal">{title}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 rounded-[10px] border border-divider bg-bg-accent px-3.5 text-[13.5px] font-medium text-text-normal transition-colors hover:bg-interactive-hover"
    >
      {children}
    </button>
  );
}

function Bench() {
  const [sent, setSent] = useState<string[]>([]);
  const [giftModal, setGiftModal] = useState(false);
  const [claim, setClaim] = useState<{ plan: "aero" | "lite"; months: number } | null>(null);
  const [imageAt, setImageAt] = useState<number | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [profile, setProfile] = useState<{ key: string; self: boolean } | null>(null);
  const [settings, setSettings] = useState(false);
  const [cardKey, setCardKey] = useState(0);

  // The viewer only shows https: or blob: images, so serve the samples as blobs.
  useEffect(() => {
    let urls: string[] = [];
    void Promise.all(
      IMAGES.map((f) => fetch(`${SAMPLES}/${f}`).then((r) => r.blob()).then((b) => URL.createObjectURL(b))),
    ).then((u) => {
      urls = u;
      setImageUrls(u);
    });
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-normal">
      <div className="mx-auto max-w-[1100px] px-6 pb-40 pt-10">
        <header className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Dev only</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">UI test bench</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-text-muted">
            Sample data, no sign-in. Everything is local except <b className="text-text-normal">Continue to payment</b> in
            the gift window, which opens real Stripe checkout — close it before paying. Media samples live in
            <code className="mx-1 rounded bg-bg-accent px-1">public/dev-samples</code>(git-ignored).
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Gifting" hint="Purchase window and the claim moment.">
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => setGiftModal(true)}>Open gift purchase</Btn>
              <Btn onClick={() => setClaim({ plan: "aero", months: 1 })}>Claim · Aero 1 mo</Btn>
              <Btn onClick={() => setClaim({ plan: "aero", months: 3 })}>Claim · Aero 3 mo</Btn>
              <Btn onClick={() => setClaim({ plan: "aero", months: 12 })}>Claim · Aero 1 yr</Btn>
              <Btn onClick={() => setClaim({ plan: "lite", months: 6 })}>Claim · Lite 6 mo</Btn>
            </div>
          </Section>

          <Section title="Profiles & settings" hint="Profile card variants, your own card, and Settings.">
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => setProfile({ key: "plain", self: false })}>Profile · default</Btn>
              <Btn onClick={() => setProfile({ key: "accent", self: false })}>Profile · custom accent</Btn>
              <Btn onClick={() => setProfile({ key: "plain", self: true })}>Profile · yourself</Btn>
              <Btn onClick={() => setSettings(true)}>Open settings</Btn>
            </div>
            <p className="mt-3 text-[12.5px] text-text-muted">Signed out here, so Settings shows empty account fields.</p>
          </Section>

          <div className="lg:col-span-2">
            <Section
              title="Gift cards in chat"
              hint="Every state a gift link can be in. Claim on the first one plays the animation."
            >
              <div className="mb-3">
                <Btn onClick={() => setCardKey((k) => k + 1)}>Reset cards</Btn>
              </div>
              <div key={cardKey} className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                {GIFT_STATES.map((s) => (
                  <div key={s.label}>
                    <p className="text-[12px] text-text-muted">{s.label}</p>
                    <GiftCard code={s.gift.code} preview={{ gift: s.gift, buyerName: "polar", viewerId: ME }} />
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <Section title="Audio" hint="Real waveform, speed, mute, download. Only one clip plays at a time.">
            <AudioPlayer src={`${SAMPLES}/sample-audio.mp3`} fileName="hostage.mp3" sizeLabel="235 KB" />
          </Section>

          <Section title="Video" hint="Space/K, ←/→, ↑/↓, M, F. Double-click for fullscreen. Right-click for the menu.">
            <VideoPlayer src={`${SAMPLES}/sample-video.mp4`} fileName="sample-video.mp4" />
          </Section>

          <div className="lg:col-span-2">
            <Section
              title="Image viewer"
              hint="Click a thumbnail. ←/→ or the side buttons step through; click the image to zoom; right-click for the menu. Copy/Save fail here because these are local blobs — real attachments are https."
            >
              <div className="flex gap-3">
                {imageUrls.map((u, i) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setImageAt(i)}
                    className="h-32 w-24 overflow-hidden rounded-xl border border-divider"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </div>

      {/* Bottom bar: user panel + composer, aligned the way the app lays them out. */}
      <div className="fixed inset-x-0 bottom-0 flex border-t border-divider bg-bg-primary">
        <aside className="w-60 shrink-0 border-r border-divider bg-bg-secondary pt-2">
          <UserPanel onOpenSettings={() => setSettings(true)} />
        </aside>
        <main className="min-w-0 flex-1 pt-2">
          {sent.length > 0 && (
            <p className="truncate px-3 pb-1 text-[12px] text-text-muted">
              Last sent: <span className="text-text-normal">{sent[sent.length - 1]}</span>
            </p>
          )}
          <ChatInput
            placeholder="Message #general — try +, the gift button, emoji, GIF"
            allowPolls
            allowGifts
            onSend={async (content, opts) => {
              setSent((s) => [...s, content || opts?.attachment?.type || "(attachment)"]);
              return null;
            }}
          />
        </main>
      </div>

      {giftModal && <GiftModal onClose={() => setGiftModal(false)} onPurchased={() => setGiftModal(false)} />}
      {claim && (
        <ClaimAnimation plan={claim.plan} months={claim.months} fromName="polar" onClose={() => setClaim(null)} />
      )}
      {imageAt !== null && imageUrls[imageAt] && (
        <ImageLightbox
          open
          onClose={() => setImageAt(null)}
          src={imageUrls[imageAt]}
          fileName={IMAGES[imageAt]}
          author={PROFILES.plain}
          createdAt={new Date(Date.now() - 3_600_000).toISOString()}
          position={{ index: imageAt, total: imageUrls.length }}
          onPrev={() => setImageAt((i) => (i === null ? i : Math.max(0, i - 1)))}
          onNext={() => setImageAt((i) => (i === null ? i : Math.min(imageUrls.length - 1, i + 1)))}
        />
      )}
      <UserProfileModal
        profile={profile ? PROFILES[profile.key] : null}
        open={!!profile}
        onClose={() => setProfile(null)}
        isSelf={profile?.self}
        isFriend={!profile?.self}
        onMessage={() => setProfile(null)}
        onVoiceCall={() => setProfile(null)}
        onRemoveFriend={() => setProfile(null)}
        onBlock={() => setProfile(null)}
        onOpenSettings={() => setSettings(true)}
      />
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

export function UiTestBench() {
  return (
    <ThemeProvider>
      <AppProvider>
        <SkinProvider userId={null}>
          <ContextMenuProvider>
            <Bench />
          </ContextMenuProvider>
        </SkinProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
