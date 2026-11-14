"use client";

/*
 The Disband Aero page. It opens in the main column from the "Disband Aero"
 row in the DM sidebar, the way a premium page sits inside the app rather
 than in a pop-up: a full-bleed hero with the price and the two ways to buy,
 then what each plan includes and how the three compare.

 Buying goes through the existing SubscriptionModal (embedded Stripe checkout
 and activation), started at the chosen plan and interval via `onCheckout`.
*/

import { websiteHref } from "@/lib/platform";
import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/hooks/useSubscription";
import { usePresence } from "@/hooks/usePresence";
import {
  PLANS,
  YEARLY_PRICE_CENTS,
  isGranting,
  yearlySavingsPercent,
  type BillingInterval,
} from "@/lib/subscription";
import { extractGiftCodes, giftUrl } from "@/lib/gifts";
import { AeroIcon } from "@/components/icons/AeroIcon";
import {
  IconCheck,
  IconGift,
  IconImage,
  IconPalette,
  IconSparkle,
  IconUpload,
  IconVideo,
  IconEmoji,
  IconCrown,
  IconDownload,
  IconBell,
  IconTrophy,
  IconStar,
} from "@/components/icons";
import { GiftModal } from "@/components/gift/GiftModal";
import { GiftCard } from "@/components/gift/GiftCard";
import { ClassicModal, classicBtn, classicInput } from "@/components/ui/ClassicModal";

export interface AeroCheckoutRequest {
  plan: "aero" | "lite";
  interval: BillingInterval;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** One perk card in the "Everything in Aero" grid. */
function Perk({ icon, title, body, badge }: { icon: React.ReactNode; title: string; body: string; badge?: string }) {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-border-subtle bg-bg-secondary-alt p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-5 text-header-primary">
          {title}
          {badge && (
            <span className="rounded-full bg-status-online/15 px-2 py-px text-[10px] font-bold uppercase tracking-[0.06em] text-status-online">
              {badge}
            </span>
          )}
        </p>
        <p className="mt-1 text-[13px] leading-[18px] text-text-muted">{body}</p>
      </div>
    </div>
  );
}

/** The emblem in the hero: the Aero wing on layered, softly lit rings. */
function AeroEmblem() {
  return (
    <div aria-hidden className="aero-emblem relative mx-auto h-[172px] w-[172px]">
      <span className="absolute inset-0 rounded-full border border-white/25" />
      <span className="aero-orbit absolute inset-[-14px] rounded-full border border-dashed border-white/20" />
      <span className="absolute inset-[18px] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.55),rgba(255,255,255,0.06)_60%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]" />
      <span className="absolute inset-0 flex items-center justify-center">
        <AeroIcon size={84} colour="#ffffff" highlight="#ffd8fb" className="drop-shadow-[0_10px_24px_rgba(20,10,80,0.45)]" />
      </span>
    </div>
  );
}

export function AeroPage({ onCheckout }: { onCheckout: (request: AeroCheckoutRequest) => void }) {
  const { user } = useApp();
  const { t } = useI18n();
  const { plan, subscription, loading, openPortal } = useSubscription(user?.id);
  const [focus, setFocus] = useState<"aero" | "lite">("aero");
  const [gifting, setGifting] = useState(false);
  const [giftLink, setGiftLink] = useState<string | null>(null);
  const [giftCopied, setGiftCopied] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemCode, setRedeemCode] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const { mounted: giftMounted, exiting: giftExiting } = usePresence(gifting);

  const tiers = useMemo(() => {
    const aero = PLANS.find((p) => p.id === "aero")!;
    const lite = PLANS.find((p) => p.id === "lite")!;
    return { aero, lite };
  }, []);
  const tier = tiers[focus];
  const monthly = tier.monthlyPrice;
  const yearly = YEARLY_PRICE_CENTS[focus];
  const savings = yearlySavingsPercent(monthly, yearly);
  const subscribed = isGranting(subscription?.status) && (plan === "aero" || plan === "lite");
  const onThisPlan = subscribed && plan === focus;

  const submitRedeem = () => {
    const raw = redeemInput.trim();
    // Accept a pasted gift link as well as the bare ten-character code.
    const fromLink = extractGiftCodes(raw)[0];
    const code = fromLink ?? (/^[a-zA-Z0-9]{10}$/.test(raw) ? raw : null);
    if (!code) {
      setRedeemError(t("That doesn't look like a gift code. Codes are 10 letters and numbers."));
      return;
    }
    setRedeemError(null);
    setRedeemCode(code);
  };

  const closeRedeem = () => {
    setRedeemOpen(false);
    setRedeemInput("");
    setRedeemCode(null);
    setRedeemError(null);
  };

  return (
    <main className="view-enter relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <div className="settings-scroll min-h-0 flex-1 overflow-y-auto">
        {/* Hero */}
        <section className="aero-hero relative overflow-hidden px-6 pb-28 pt-14 text-center text-white">
          <div className="relative z-[1] mx-auto max-w-[760px]">
            <AeroEmblem />
            <h1 className="mt-8 text-[44px] font-extrabold leading-[1.05] tracking-[-0.03em] drop-shadow-[0_4px_18px_rgba(10,6,60,0.35)] sm:text-[64px]">
              {focus === "aero" ? "Disband Aero" : "Disband Lite"}
            </h1>

            <div role="tablist" aria-label={t("Plan")} className="mx-auto mt-6 inline-flex rounded-full bg-black/25 p-1 ring-1 ring-white/15">
              {(["aero", "lite"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={focus === id}
                  onClick={() => setFocus(id)}
                  className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                    focus === id ? "bg-white text-[#2b2290]" : "text-white/80 hover:text-white"
                  }`}
                >
                  {id === "aero" ? "Aero" : "Lite"}
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-end justify-center gap-x-3 gap-y-1">
              <span className="text-[28px] font-extrabold tracking-[-0.02em]">{money(monthly)}<span className="text-[18px] font-bold text-white/80">/{t("mo")}</span></span>
              <span className="pb-1.5 text-[15px] font-medium text-white/70">{t("or")}</span>
              <span className="relative text-[28px] font-extrabold tracking-[-0.02em]">
                {savings > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-bold text-[#ffe08a]">
                    {t("Save {percent}%", { percent: savings })}
                  </span>
                )}
                {money(yearly)}<span className="text-[18px] font-bold text-white/80">/{t("yr")}</span>
              </span>
            </div>

            {loading ? (
              <div className="mt-8 flex justify-center" role="status" aria-label={t("Loading your plan")}>
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            ) : onThisPlan ? (
              <div className="mx-auto mt-8 max-w-md rounded-2xl bg-black/25 px-5 py-4 ring-1 ring-white/15">
                <p className="flex items-center justify-center gap-2 text-[16px] font-semibold">
                  <IconCheck size={18} /> {t("You're on {plan}", { plan: focus === "aero" ? "Aero" : "Lite" })}
                </p>
                {subscription?.current_period_end && (
                  <p className="mt-1 text-[13px] text-white/75">
                    {subscription.cancel_at_period_end ? t("Ends") : t("Renews")}{" "}
                    {new Date(subscription.current_period_end).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
                {subscription?.stripe_customer_id && (
                  <button
                    type="button"
                    onClick={() => void openPortal()}
                    className="mt-3 h-10 rounded-xl bg-white px-5 text-[14px] font-bold text-[#2b2290] transition-transform hover:-translate-y-px"
                  >
                    {t("Manage billing")}
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => onCheckout({ plan: focus, interval: "year" })}
                  className="group flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[16px] font-bold text-[#2b2290] shadow-[0_6px_0_rgba(20,12,90,0.25)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {t("Get yearly")}
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCheckout({ plan: focus, interval: "month" })}
                  className="flex h-12 items-center rounded-xl bg-[#1d1680]/70 px-6 text-[16px] font-bold text-white shadow-[0_6px_0_rgba(10,6,60,0.3)] ring-1 ring-white/15 transition-transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {t("Get monthly")}
                </button>
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[14px] font-semibold">
              <button type="button" onClick={() => setGifting(true)} className="flex items-center gap-1.5 text-white/90 hover:text-white">
                <IconGift size={16} /> {t("Gift Aero")}
              </button>
              <button type="button" onClick={() => setRedeemOpen(true)} className="flex items-center gap-1.5 text-white/90 hover:text-white">
                <IconSparkle size={16} /> {t("Redeem a gift code")}
              </button>
            </div>
            <p className="mt-5 text-[14px] text-white/80">
              {t("Just want to support Disband?")}{" "}
              <a href={websiteHref("/donate")} target="_blank" rel="noreferrer" className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                {t("Donate instead.")}
              </a>
            </p>
          </div>
          <svg aria-hidden viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-[-1px] z-[1] h-[80px] w-full">
            <path d="M0 64c160 34 320 48 480 34S800 30 960 30s320 34 480 50v40H0Z" fill="var(--bg-primary)" />
          </svg>
        </section>

        {/* Perks */}
        <section className="mx-auto max-w-[1040px] px-6 pb-6 pt-4">
          <h2 className="text-[26px] font-bold tracking-[-0.01em] text-header-primary">
            {focus === "aero" ? t("Everything in Aero") : t("Everything in Lite")}
          </h2>
          <p className="mt-1 text-[15px] text-text-muted">
            {focus === "aero"
              ? t("The full set: bigger uploads, sharper streams and every way to make Disband yours.")
              : t("The essentials for a little more room, at a little price.")}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {focus === "aero" ? (
              <>
                <Perk icon={<IconUpload />} title={t("500 MB uploads")} body={t("Send files ten times bigger than on Free.")} />
                <Perk icon={<IconVideo />} title={t("2K video and streams")} body={t("1440p camera and screen share at up to 120 fps.")} />
                <Perk icon={<IconImage />} title={t("Animated avatar and banner")} body={t("Bring your profile to life with GIFs.")} />
                <Perk icon={<IconPalette />} title={t("Custom accent colour")} body={t("Pick any colour and the whole app takes it on.")} badge={t("New")} />
                <Perk icon={<IconStar />} title={t("Chat wallpapers")} body={t("Set a backdrop behind every conversation.")} badge={t("New")} />
                <Perk icon={<IconBell />} title={t("Message reminders")} body={t("Ask Disband to bring a message back to you later.")} badge={t("New")} />
                <Perk icon={<IconEmoji />} title={t("Unlimited custom emoji")} body={t("Upload as many emoji to your spaces as you like.")} />
                <Perk icon={<IconCrown />} title={t("4 Catalysts a month")} body={t("Boost the spaces you love to unlock their perks.")} />
                <Perk icon={<IconSparkle />} title={t("Skins and exclusive themes")} body={t("Nine skins, four Aero themes and your own CSS.")} />
                <Perk icon={<IconDownload />} title={t("History export")} body={t("Take a copy of your messages with you.")} />
                <Perk icon={<IconTrophy />} title={t("Priority support")} body={t("Your tickets go to the front of the queue.")} />
                <Perk icon={<AeroIcon size={20} />} title={t("Aero badge")} body={t("Show your support on your profile.")} />
              </>
            ) : (
              <>
                <Perk icon={<IconUpload />} title={t("100 MB uploads")} body={t("Twice the room of Free for files and clips.")} />
                <Perk icon={<IconVideo />} title={t("1080p video")} body={t("Full HD camera and screen share.")} />
                <Perk icon={<IconPalette />} title={t("Custom accent colour")} body={t("Pick any colour and the whole app takes it on.")} badge={t("New")} />
                <Perk icon={<IconStar />} title={t("Chat wallpapers")} body={t("Set a backdrop behind every conversation.")} badge={t("New")} />
                <Perk icon={<IconBell />} title={t("Message reminders")} body={t("Ask Disband to bring a message back to you later.")} badge={t("New")} />
                <Perk icon={<IconEmoji />} title={t("10 custom emoji slots")} body={t("Add your own emoji to the spaces you run.")} />
                <Perk icon={<IconCrown />} title={t("1 Catalyst a month")} body={t("Boost a space you love.")} />
                <Perk icon={<AeroIcon size={20} lite />} title={t("Lite badge")} body={t("A badge on your profile.")} />
              </>
            )}
          </div>
        </section>

        {/* Compare */}
        <section className="mx-auto max-w-[1040px] px-6 pb-16 pt-8">
          <h2 className="text-[22px] font-bold text-header-primary">{t("Compare plans")}</h2>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border-subtle">
            <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-bg-secondary-alt text-text-muted">
                  <th className="px-4 py-3 font-semibold">{t("Perk")}</th>
                  <th className="px-4 py-3 font-semibold">Free</th>
                  <th className="px-4 py-3 font-semibold">Lite</th>
                  <th className="px-4 py-3 font-semibold text-brand">Aero</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [t("File uploads"), "50 MB", "100 MB", "500 MB"],
                  [t("Video quality"), "720p", "1080p", "1440p"],
                  [t("Custom emoji slots"), "—", "10", t("Unlimited")],
                  [t("Catalysts each month"), "—", "1", "4"],
                  [t("Custom accent colour"), "—", "✓", "✓"],
                  [t("Chat wallpapers"), "—", "✓", "✓"],
                  [t("Message reminders"), "—", "✓", "✓"],
                  [t("Animated avatar and banner"), "—", "—", "✓"],
                  [t("Skins and Aero themes"), "—", "—", "✓"],
                  [t("History export"), "—", "—", "✓"],
                ].map(([label, free, lite, aero]) => (
                  <tr key={label} className="border-t border-border-subtle">
                    <td className="px-4 py-3 font-medium text-header-primary">{label}</td>
                    <td className="px-4 py-3 text-text-muted">{free}</td>
                    <td className="px-4 py-3 text-text-normal">{lite}</td>
                    <td className="px-4 py-3 font-semibold text-header-primary">{aero}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[12px] leading-5 text-text-muted">
            {t("Prices in US dollars. Subscriptions renew until cancelled; cancel any time from Manage billing and keep your perks to the end of the period.")}
          </p>
        </section>
      </div>

      {giftMounted && (
        <GiftModal
          exiting={giftExiting}
          onClose={() => setGifting(false)}
          onPurchased={(code) => {
            setGifting(false);
            setGiftCopied(false);
            setGiftLink(giftUrl(code, window.location.origin));
          }}
        />
      )}

      <ClassicModal
        open={!!giftLink}
        onClose={() => setGiftLink(null)}
        title={t("Your gift is ready")}
        subtitle={t("Send this link to whoever you're gifting. It can be claimed once.")}
        footer={
          <button type="button" onClick={() => setGiftLink(null)} className={`${classicBtn.brand} ${classicBtn.md}`}>
            {t("Done")}
          </button>
        }
      >
        <div className="flex gap-2">
          <input readOnly value={giftLink ?? ""} aria-label={t("Gift link")} className={classicInput} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            onClick={async () => {
              if (!giftLink) return;
              try {
                await navigator.clipboard.writeText(giftLink);
                setGiftCopied(true);
              } catch {
                setGiftCopied(false);
              }
            }}
            className={`${classicBtn.grey} ${classicBtn.md} shrink-0`}
          >
            {giftCopied ? t("Copied") : t("Copy")}
          </button>
        </div>
      </ClassicModal>

      <ClassicModal
        open={redeemOpen}
        onClose={closeRedeem}
        title={t("Redeem a gift code")}
        subtitle={redeemCode ? undefined : t("Paste the gift link or the 10-character code.")}
        width={redeemCode ? 620 : 440}
        footer={
          redeemCode ? (
            <button type="button" onClick={closeRedeem} className={`${classicBtn.grey} ${classicBtn.md}`}>
              {t("Close")}
            </button>
          ) : (
            <>
              <button type="button" onClick={closeRedeem} className={`${classicBtn.grey} ${classicBtn.md}`}>
                {t("Cancel")}
              </button>
              <button type="button" onClick={submitRedeem} disabled={!redeemInput.trim()} className={`${classicBtn.brand} ${classicBtn.md}`}>
                {t("Continue")}
              </button>
            </>
          )
        }
      >
        {redeemCode ? (
          <GiftCard code={redeemCode} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRedeem();
            }}
          >
            <input
              autoFocus
              value={redeemInput}
              onChange={(e) => {
                setRedeemInput(e.target.value);
                setRedeemError(null);
              }}
              placeholder="https://disband.dev/gift/…"
              aria-label={t("Gift code")}
              className={classicInput}
            />
            {redeemError && <p className="mt-2 text-[13px] text-status-dnd">{redeemError}</p>}
          </form>
        )}
      </ClassicModal>

    </main>
  );
}
