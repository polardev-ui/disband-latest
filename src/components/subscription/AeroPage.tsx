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

/** One perk: an icon, what you get, and a line on what it means. */
function Perk({ icon, title, body, badge }: { icon: React.ReactNode; title: string; body: string; badge?: string }) {
  return (
    <li className="flex gap-3 py-3.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-interactive-normal [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-5 text-header-primary">
          {title}
          {badge && <span className="ml-2 text-[12px] font-semibold text-brand">{badge}</span>}
        </p>
        <p className="mt-0.5 text-[14px] leading-5 text-text-muted">{body}</p>
      </div>
    </li>
  );
}

/** One way to pay: a selectable option with its price and what it works out at. */
function PriceOption({
  selected,
  onSelect,
  label,
  price,
  per,
  note,
  tag,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  price: string;
  per: string;
  note: string;
  tag?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex flex-1 items-start gap-3 rounded-lg border px-4 py-3.5 text-left transition-colors ${
        selected ? "border-brand bg-brand/[0.06]" : "border-border-subtle hover:border-border-strong"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-brand" : "border-interactive-normal/60"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-header-primary">{label}</span>
          {tag && <span className="text-[12px] font-semibold text-status-online">{tag}</span>}
        </span>
        <span className="mt-1 block text-[22px] font-bold leading-7 tracking-[-0.01em] text-header-primary tabular-nums">
          {price}
          <span className="text-[14px] font-medium text-text-muted">{per}</span>
        </span>
        <span className="mt-0.5 block text-[13px] text-text-muted">{note}</span>
      </span>
    </button>
  );
}

export function AeroPage({ onCheckout }: { onCheckout: (request: AeroCheckoutRequest) => void }) {
  const { user } = useApp();
  const { t } = useI18n();
  const { plan, subscription, loading, openPortal } = useSubscription(user?.id);
  const [focus, setFocus] = useState<"aero" | "lite">("aero");
  const [interval, setBillingInterval] = useState<BillingInterval>("year");
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
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg-primary">
      <div className="settings-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[880px] px-6 pb-4 pt-10 md:px-10">
          {/* Plan and price */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <AeroIcon size={26} lite={focus === "lite"} colour="var(--brand)" />
              <span className="text-[15px] font-semibold text-header-primary">Disband {focus === "aero" ? "Aero" : "Lite"}</span>
            </div>
            <div role="tablist" aria-label={t("Plan")} className="inline-flex rounded-lg bg-bg-tertiary p-1">
              {(["aero", "lite"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={focus === id}
                  onClick={() => setFocus(id)}
                  className={`h-8 rounded-md px-4 text-[13px] font-semibold transition-colors ${
                    focus === id ? "bg-bg-primary text-header-primary shadow-[var(--elevation-low)]" : "text-interactive-normal hover:text-interactive-active"
                  }`}
                >
                  {id === "aero" ? "Aero" : "Lite"}
                </button>
              ))}
            </div>
          </div>

          <h1 className="mt-8 max-w-[640px] text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-header-primary">
            {focus === "aero"
              ? t("Bigger uploads, sharper video, and Disband the way you like it.")
              : t("A little more room, for a little less.")}
          </h1>
          <p className="mt-3 max-w-[600px] text-[15px] leading-6 text-text-muted">
            {focus === "aero"
              ? t("500 MB uploads, 1440p calls and streams, animated profiles, skins and four Catalysts a month.")
              : t("100 MB uploads, 1080p video, your own accent colour and a Catalyst a month.")}
          </p>

          {loading ? (
            <div className="mt-8 flex h-[132px] items-center" role="status" aria-label={t("Loading your plan")}>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
            </div>
          ) : onThisPlan ? (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border-subtle bg-bg-secondary px-5 py-4">
              <div>
                <p className="flex items-center gap-2 text-[15px] font-semibold text-header-primary">
                  <IconCheck size={16} className="text-status-online" />
                  {t("You're on {plan}", { plan: focus === "aero" ? "Aero" : "Lite" })}
                </p>
                {subscription?.current_period_end && (
                  <p className="mt-0.5 text-[13px] text-text-muted">
                    {subscription.cancel_at_period_end ? t("Ends") : t("Renews")}{" "}
                    {new Date(subscription.current_period_end).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
              </div>
              {subscription?.stripe_customer_id && (
                <button
                  type="button"
                  onClick={() => void openPortal()}
                  className="h-9 rounded-md bg-button-secondary px-4 text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover"
                >
                  {t("Manage billing")}
                </button>
              )}
            </div>
          ) : (
            <>
              <div role="radiogroup" aria-label={t("Billing")} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <PriceOption
                  selected={interval === "year"}
                  onSelect={() => setBillingInterval("year")}
                  label={t("Yearly")}
                  price={money(yearly)}
                  per={` / ${t("year")}`}
                  note={t("{price} a month, billed once a year", { price: money(Math.round(yearly / 12)) })}
                  tag={savings > 0 ? t("Save {percent}%", { percent: savings }) : undefined}
                />
                <PriceOption
                  selected={interval === "month"}
                  onSelect={() => setBillingInterval("month")}
                  label={t("Monthly")}
                  price={money(monthly)}
                  per={` / ${t("month")}`}
                  note={t("Billed every month, cancel any time")}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                <button
                  type="button"
                  onClick={() => onCheckout({ plan: focus, interval })}
                  className="h-10 rounded-md bg-brand px-5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
                >
                  {t("Get {plan}", { plan: focus === "aero" ? "Aero" : "Lite" })}
                </button>
                <button type="button" onClick={() => setGifting(true)} className="flex items-center gap-1.5 text-[14px] font-medium text-text-link hover:underline">
                  <IconGift size={15} /> {t("Gift Aero")}
                </button>
                <button type="button" onClick={() => setRedeemOpen(true)} className="text-[14px] font-medium text-text-link hover:underline">
                  {t("Redeem a gift code")}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Perks */}
        <section className="mx-auto w-full max-w-[880px] px-6 pt-10 md:px-10">
          <h2 className="border-b border-border-subtle pb-3 text-[16px] font-semibold text-header-primary">
            {focus === "aero" ? t("Everything in Aero") : t("Everything in Lite")}
          </h2>
          <ul className="grid gap-x-10 sm:grid-cols-2 [&>li]:border-b [&>li]:border-border-subtle">
            {focus === "aero" ? (
              <>
                <Perk icon={<IconUpload />} title={t("500 MB uploads")} body={t("Send files ten times bigger than on Free.")} />
                <Perk icon={<IconVideo />} title={t("1440p video and streams")} body={t("Camera and screen share at up to 120 fps.")} />
                <Perk icon={<IconImage />} title={t("Animated avatar and banner")} body={t("Use a GIF for your picture and banner.")} />
                <Perk icon={<IconPalette />} title={t("Custom accent colour")} body={t("Pick any colour and the whole app takes it on.")} badge={t("New")} />
                <Perk icon={<IconStar />} title={t("Chat wallpapers")} body={t("Set a backdrop behind every conversation.")} badge={t("New")} />
                <Perk icon={<IconBell />} title={t("Message reminders")} body={t("Ask Disband to bring a message back to you later.")} badge={t("New")} />
                <Perk icon={<IconEmoji />} title={t("Unlimited custom emoji")} body={t("Upload as many emoji to your spaces as you like.")} />
                <Perk icon={<IconCrown />} title={t("4 Catalysts a month")} body={t("Boost the spaces you love to unlock their perks.")} />
                <Perk icon={<IconSparkle />} title={t("Skins and Aero themes")} body={t("Nine skins, four Aero themes and your own CSS.")} />
                <Perk icon={<IconDownload />} title={t("History export")} body={t("Take a copy of your messages with you.")} />
                <Perk icon={<IconTrophy />} title={t("Priority support")} body={t("Your tickets go to the front of the queue.")} />
                <Perk icon={<AeroIcon size={18} />} title={t("Aero badge")} body={t("Shown on your profile.")} />
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
                <Perk icon={<AeroIcon size={18} lite />} title={t("Lite badge")} body={t("Shown on your profile.")} />
              </>
            )}
          </ul>
        </section>

        {/* Compare */}
        <section className="mx-auto w-full max-w-[880px] px-6 pb-16 pt-12 md:px-10">
          <h2 className="text-[16px] font-semibold text-header-primary">{t("Compare plans")}</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="bg-bg-secondary text-[13px] text-text-muted">
                  <th className="px-4 py-2.5 font-medium" />
                  <th className="w-[18%] px-4 py-2.5 font-medium">Free</th>
                  <th className="w-[18%] px-4 py-2.5 font-medium">Lite</th>
                  <th className="w-[18%] px-4 py-2.5 font-semibold text-header-primary">Aero</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [t("File uploads"), "50 MB", "100 MB", "500 MB"],
                  [t("Video quality"), "720p", "1080p", "1440p"],
                  [t("Custom emoji slots"), "", "10", t("Unlimited")],
                  [t("Catalysts each month"), "", "1", "4"],
                  [t("Custom accent colour"), "", "yes", "yes"],
                  [t("Chat wallpapers"), "", "yes", "yes"],
                  [t("Message reminders"), "", "yes", "yes"],
                  [t("Animated avatar and banner"), "", "", "yes"],
                  [t("Skins and Aero themes"), "", "", "yes"],
                  [t("History export"), "", "", "yes"],
                ].map(([label, ...cells]) => (
                  <tr key={label} className="border-t border-border-subtle">
                    <td className="px-4 py-2.5 text-text-normal">{label}</td>
                    {cells.map((cell, i) => (
                      <td key={i} className={`px-4 py-2.5 tabular-nums ${i === 2 ? "font-medium text-header-primary" : "text-text-muted"}`}>
                        {cell === "yes" ? (
                          <IconCheck size={16} className={i === 2 ? "text-header-primary" : "text-text-muted"} />
                        ) : cell === "" ? (
                          <span aria-label={t("Not included")} className="text-text-muted/50">–</span>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[12px] leading-5 text-text-muted">
            {t("Prices in US dollars. Subscriptions renew until cancelled; cancel any time from Manage billing and keep your perks to the end of the period.")}{" "}
            {t("Just want to support Disband?")}{" "}
            <a href={websiteHref("/donate")} target="_blank" rel="noreferrer" className="font-medium text-text-link hover:underline">
              {t("Donate instead.")}
            </a>
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
