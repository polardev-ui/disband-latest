"use client";

import { LoadingDots } from "@/components/ui/LoadingDots";

import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { usePresence } from "@/hooks/usePresence";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { IconClose, IconUpload, IconChevron, IconHash, IconSpeaker, IconShield } from "@/components/icons";
import { safeImageUrl } from "@/lib/safe-url";
import { useI18n } from "@/contexts/I18nContext";
import { apiJson } from "@/lib/api";
import { looksLikeTemplateLink, parseTemplateCode, type TemplatePreview } from "@/lib/discord-template";

interface CreateServerModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateServerModal({ open, onClose }: CreateServerModalProps) {
  const { t } = useI18n();
  const { createServer, joinServerByInvite, profile } = useApp();
  const [invite, setInvite] = useState("");
  const { upload, isUploading } = useMediaUpload();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"start" | "customize" | "join" | "template">("start");
  const [templateLink, setTemplateLink] = useState("");
  const [template, setTemplate] = useState<TemplatePreview | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setIconUrl(null);
    setBannerUrl(null);
    setError(null);
    setLoading(false);
    setInvite("");
    setTemplateLink("");
    setTemplate(null);
    setStep("start");
  }, [open]);

  useOverlayDismiss(onClose, open);
  const { mounted, exiting } = usePresence(open);

  if (!mounted) return null;

  async function handleIcon(file: File) {
    const res = await upload(file);
    if (res) setIconUrl(res.url);
  }

  async function handleBanner(file: File) {
    const res = await upload(file);
    if (res) setBannerUrl(res.url);
  }

  async function loadTemplate() {
    const code = parseTemplateCode(templateLink);
    if (!code) {
      setError(t("That doesn't look like a Discord template link. It should look like discord.new/AbCd1234."));
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiJson<TemplatePreview>(`/api/discord/template?code=${encodeURIComponent(code)}`);
    setLoading(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setTemplate(res);
    setName(res.serverName);
    if (res.description && !description) setDescription(res.description);
    setStep("customize");
  }

  async function join() {
    // A Discord template pasted here belongs in the template step.
    if (looksLikeTemplateLink(invite)) {
      setTemplateLink(invite.trim());
      setInvite("");
      setError(null);
      setStep("template");
      return;
    }
    const code = invite.trim().replace(/\/+$/, "").split("/").pop() ?? "";
    if (!code) return;
    setLoading(true);
    setError(null);
    const err = await joinServerByInvite(code);
    setLoading(false);
    if (err) setError(err);
    else onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "join") {
      await join();
      return;
    }
    if (step === "template") {
      await loadTemplate();
      return;
    }
    setLoading(true);
    setError(null);
    const err = await createServer({
      name: name.trim(),
      description: description.trim() || undefined,
      iconUrl: iconUrl ?? undefined,
      bannerUrl: bannerUrl ?? undefined,
      template: template?.template,
    });
    if (err) setError(err);
    else onClose();
    setLoading(false);
  }

  const footer = (left: React.ReactNode, right: React.ReactNode) => (
    <div className="flex items-center justify-between bg-bg-secondary p-4">
      {left}
      {right}
    </div>
  );
  const back = (
    <button type="button" onClick={() => { setError(null); setStep(step === "customize" && template ? "template" : "start"); }} className="text-[14px] font-medium text-header-primary hover:underline">
      {t("Back")}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label={t("Close")} className={`absolute inset-0 bg-overlay-scrim-strong overlay-fade${exiting ? " overlay-fade-out" : ""}`} onClick={onClose} />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={t("Create a space")}
        className={`modal-pop${exiting ? " modal-pop-out" : ""} relative w-full max-w-[440px] overflow-hidden rounded-xl border border-border-subtle bg-bg-primary text-center shadow-[var(--elevation-high)]`}
      >
        <button type="button" onClick={onClose} aria-label={t("Close")} className="absolute right-4 top-4 text-interactive-normal hover:text-interactive-active">
          <IconClose size={24} />
        </button>

        {step === "start" && (
          <div key="start" className="view-enter">
            <div className="px-4 pb-2 pt-6">
              <h2 className="text-[24px] font-bold leading-[30px] text-header-primary">{t("Create Your Space")}</h2>
              <p className="mx-auto mt-2 max-w-[360px] text-[16px] leading-5 text-header-secondary">
                {t("Your space is where you and your friends hang out. Make yours and start talking.")}
              </p>
            </div>
            <div className="px-4 pb-4 pt-4">
              <button
                type="button"
                onClick={() => {
                  if (!name && profile) setName(`${profile.display_name || profile.username || "My"}'s space`);
                  setStep("customize");
                }}
                className="flex w-full items-center gap-3 rounded-lg border border-[#4e505880] bg-transparent px-3 py-2 text-left transition-colors hover:bg-interactive-hover"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                  <IconHash size={24} />
                </span>
                <span className="flex-1 text-[16px] font-semibold text-header-primary">{t("Create My Own")}</span>
                <IconChevron size={18} className="-rotate-90 text-interactive-normal" />
              </button>
              <button
                type="button"
                onClick={() => { setError(null); setTemplate(null); setStep("template"); }}
                className="mt-2 flex w-full items-center gap-3 rounded-lg border border-[#4e505880] bg-transparent px-3 py-2 text-left transition-colors hover:bg-interactive-hover"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-white">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3v12" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M5 21h14" />
                  </svg>
                </span>
                <span className="flex-1">
                  <span className="block text-[16px] font-semibold text-header-primary">{t("Import a Discord Template")}</span>
                  <span className="block text-[13px] leading-4 text-text-muted">{t("Bring over roles, permissions and channels")}</span>
                </span>
                <IconChevron size={18} className="-rotate-90 text-interactive-normal" />
              </button>
              <ul className="mt-4 space-y-1.5 text-left text-[14px] text-header-secondary">
                <li className="flex items-center gap-2"><IconHash size={16} className="shrink-0" /> {t("#general and #welcome text channels")}</li>
                <li className="flex items-center gap-2"><IconSpeaker size={16} className="shrink-0" /> {t("A voice channel ready for calls")}</li>
                <li className="flex items-center gap-2"><IconShield size={16} className="shrink-0" /> {t("The @everyone role so anyone can chat")}</li>
              </ul>
            </div>
            <div className="bg-bg-secondary p-4">
              <h3 className="text-[20px] font-semibold leading-6 text-header-primary">{t("Have an invite already?")}</h3>
              <button
                type="button"
                onClick={() => { setError(null); setStep("join"); }}
                className="mt-2 h-[38px] w-full rounded-md bg-button-secondary text-[14px] font-medium text-white transition-colors hover:bg-button-secondary-hover"
              >
                {t("Join a Space")}
              </button>
            </div>
          </div>
        )}

        {step === "customize" && (
          <div key="customize" className="view-enter">
            <div className="px-4 pb-2 pt-6">
              <h2 className="text-[24px] font-bold leading-[30px] text-header-primary">{t("Customise Your Space")}</h2>
              <p className="mt-2 text-[16px] leading-5 text-header-secondary">
                {t("Give your new space a personality with a name and an icon. You can always change it later.")}
              </p>
            </div>
            <div className="px-4 pb-4 pt-2 text-left">
              <label className="mx-auto mb-4 flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-full border-2 border-dashed border-interactive-normal text-interactive-normal transition-colors hover:border-interactive-active hover:text-interactive-active">
                {safeImageUrl(iconUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={safeImageUrl(iconUrl)!} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <>
                    <IconUpload size={22} />
                    <span className="mt-0.5 text-[10px] font-bold uppercase">{t("Upload")}</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void handleIcon(e.target.files[0])} />
              </label>
              {template && (
                <div className="mb-4 flex items-center gap-3 rounded-lg bg-bg-secondary px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-white">
                    <IconHash size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-header-primary">{template.title}</span>
                    <span className="block text-[12px] text-text-muted">
                      {template.counts.roles} {template.counts.roles === 1 ? t("role") : t("roles")} · {template.counts.categories} {template.counts.categories === 1 ? t("category") : t("categories")} · {template.counts.channels} {template.counts.channels === 1 ? t("channel") : t("channels")}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setTemplate(null)}
                    aria-label={t("Don't use this template")}
                    className="flex h-6 w-6 items-center justify-center rounded text-interactive-normal hover:text-interactive-active"
                  >
                    <IconClose size={16} />
                  </button>
                </div>
              )}
              <label className="block">
                <span className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">{t("Space name")}</span>
                <input
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={32}
                  className="mt-2 h-10 w-full rounded-md border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal outline-none focus:border-[#00a8fc]"
                  placeholder={t("My awesome space")}
                />
              </label>
              <label className="mt-3 block">
                <span className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">{t("Description")}{" "}<span className="font-normal normal-case text-text-muted">{t("(optional)")}</span></span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={190}
                  className="mt-2 w-full resize-none rounded-md border border-transparent bg-bg-tertiary px-2.5 py-2 text-[16px] text-text-normal outline-none focus:border-[#00a8fc]"
                />
              </label>
              <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-md bg-bg-secondary px-3 py-2 transition-colors hover:bg-interactive-hover">
                <IconUpload size={18} className="text-interactive-normal" />
                <span className="flex-1 text-[14px] text-text-normal">{bannerUrl ? t("Change banner") : t("Add a banner (optional)")}</span>
                {safeImageUrl(bannerUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={safeImageUrl(bannerUrl)!} alt="" className="h-8 w-16 rounded-md object-cover" />
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void handleBanner(e.target.files[0])} />
              </label>
              {error && <p className="mt-3 text-[14px] text-status-dnd">{error}</p>}
            </div>
            {footer(
              back,
              <button
                type="submit"
                disabled={loading || isUploading || !name.trim()}
                className="h-[38px] rounded-md bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {loading ? <LoadingDots size={6} className="mx-auto" /> : t("Create")}
              </button>,
            )}
          </div>
        )}

        {step === "template" && (
          <div key="template" className="view-enter">
            <div className="px-4 pb-2 pt-6">
              <h2 className="text-[24px] font-bold leading-[30px] text-header-primary">{t("Import a Discord Template")}</h2>
              <p className="mx-auto mt-2 max-w-[360px] text-[14px] leading-[18px] text-header-secondary">
                {t("Paste a Discord server template link. We'll copy its roles, permissions, categories and channels into your new space.")}
              </p>
            </div>
            <div className="px-4 pb-4 pt-2 text-left">
              <label className="block">
                <span className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">
                  {t("Template link")}{" "}<span className="text-status-dnd">*</span>
                </span>
                <input
                  autoFocus
                  value={templateLink}
                  onChange={(e) => setTemplateLink(e.target.value)}
                  placeholder="https://discord.new/AbCd1234"
                  className="mt-2 h-10 w-full rounded-md border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc]"
                />
              </label>
              <p className="mt-4 text-[12px] font-bold uppercase leading-4 text-header-secondary">{t("What comes across")}</p>
              <ul className="mt-2 space-y-1.5 text-[14px] text-header-secondary">
                <li className="flex items-center gap-2"><IconShield size={16} className="shrink-0" /> {t("Roles, their colours, order and permissions")}</li>
                <li className="flex items-center gap-2"><IconHash size={16} className="shrink-0" /> {t("Categories, text, forum and announcement channels")}</li>
                <li className="flex items-center gap-2"><IconSpeaker size={16} className="shrink-0" /> {t("Voice and stage channels")}</li>
              </ul>
              <p className="mt-3 text-[12px] leading-4 text-text-muted">{t("Messages, members, emoji and bots aren't part of a template.")}</p>
              {error && <p className="mt-3 text-[14px] text-status-dnd">{error}</p>}
            </div>
            {footer(
              back,
              <button
                type="submit"
                disabled={loading || !templateLink.trim()}
                className="h-[38px] rounded-md bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {loading ? <LoadingDots size={6} className="mx-auto" /> : t("Next")}
              </button>,
            )}
          </div>
        )}

        {step === "join" && (
          <div key="join" className="view-enter">
            <div className="px-4 pb-2 pt-6">
              <h2 className="text-[24px] font-bold leading-[30px] text-header-primary">{t("Join a Space")}</h2>
              <p className="mt-2 text-[14px] leading-[18px] text-header-secondary">{t("Enter an invite below to join an existing space.")}</p>
            </div>
            <div className="px-4 pb-4 pt-2 text-left">
              <label className="block">
                <span className="text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary">
                  {t("Invite link")}{" "}<span className="text-status-dnd">*</span>
                </span>
                <input
                  autoFocus
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="https://disband.dev/server/hTKzmak"
                  className="mt-2 h-10 w-full rounded-md border border-transparent bg-bg-tertiary px-2.5 text-[16px] text-text-normal outline-none placeholder:text-text-muted focus:border-[#00a8fc]"
                />
              </label>
              <p className="mt-4 text-[12px] font-bold uppercase leading-4 text-header-secondary">{t("Invites should look like")}</p>
              <p className="mt-1 text-[14px] text-text-normal">hTKzmak · https://disband.dev/server/hTKzmak · my-cool-space</p>
              {error && <p className="mt-3 text-[14px] text-status-dnd">{error}</p>}
            </div>
            {footer(
              back,
              <button
                type="submit"
                disabled={loading || !invite.trim()}
                className="h-[38px] rounded-md bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {loading ? <LoadingDots size={6} className="mx-auto" /> : t("Join Space")}
              </button>,
            )}
          </div>
        )}
      </form>
    </div>
  );
}
