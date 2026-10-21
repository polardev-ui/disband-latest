"use client";

import { useEffect, useMemo, useState } from "react";
import { useOverlayDismiss } from "@/hooks/useOverlayDismiss";
import { apiFetch } from "@/lib/api";
import { displayName } from "@/lib/utils";
import { IconCheck, IconClose, IconShield } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import type { ChatMessageData } from "@/components/discord/ChatMessage";
import type { Profile } from "@/lib/supabase/types";
import {
  MAX_REPORT_DETAILS,
  REPORT_REASON_LABELS,
  reportReasonsFor,
  type ReportReason,
  type ReportSurface,
  type ReportTargetType,
} from "@/lib/reports";

export type ReportTarget =
  | {
      kind: "message";
      surface: Extract<ReportSurface, "channel" | "dm" | "group">;
      message: ChatMessageData;
    }
  | {
      kind: "profile";
      profile: Profile;
    };

interface ReportModalProps {
  target: ReportTarget | null;
  onClose: () => void;
}

function targetIdentity(target: ReportTarget | null) {
  if (!target) return "";
  return target.kind === "message" ? target.message.id : target.profile.id;
}

function messagePreview(message: ChatMessageData): string {
  const content = message.content?.trim();
  if (content) return content;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const names = attachments
    .map((attachment) => attachment?.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
  if (names.length > 0) return names.join(", ");
  if (message.attachment_type) return `[${message.attachment_type}]`;
  return "No text";
}

export function ReportModal({ target, onClose }: ReportModalProps) {
  const open = target !== null;
  useOverlayDismiss(onClose, open);

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const identity = targetIdentity(target);
  useEffect(() => {
    setReason(null);
    setDetails("");
    setError(null);
    setSubmitting(false);
    setSubmitted(false);
  }, [identity, open]);

  const targetType: ReportTargetType = target?.kind === "profile" ? "profile" : "message";
  const reasons = useMemo(() => reportReasonsFor(targetType), [targetType]);

  const author = target?.kind === "message" ? target.message.author : target?.profile;
  const name = author ? displayName(author) : "this user";
  const preview = target?.kind === "message" ? messagePreview(target.message) : "Report this profile";
  const heading = target?.kind === "profile" ? "Report profile" : "Report message";

  if (!target) return null;

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);

    const payload =
      target?.kind === "profile"
        ? {
            targetType: "profile",
            surface: "profile",
            targetId: target.profile.id,
            reason,
            details,
          }
        : {
            targetType: "message",
            surface: target?.surface,
            targetId: target?.message.id,
            reason,
            details,
          };

    try {
      const response = await apiFetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not send the report. Try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Couldn't reach Disband. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-overlay-scrim-strong overlay-fade"
        onClick={onClose}
        aria-label="Close report"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className="modal-pop relative flex max-h-[calc(100vh-3rem)] w-full max-w-[460px] flex-col overflow-hidden rounded-lg bg-bg-secondary-alt text-text-normal shadow-[var(--elevation-high)]"
      >
        <div className="flex items-center justify-between border-b border-divider px-5 py-4">
          <div className="flex items-center gap-2.5">
            <IconShield size={18} className="shrink-0 text-text-muted" />
            <h2 id="report-modal-title" className="text-[17px] font-semibold leading-6 text-header-primary">
              {heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report"
            className="flex h-8 w-8 items-center justify-center rounded-[3px] text-text-muted transition-colors hover:bg-interactive-hover hover:text-text-normal"
          >
            <IconClose size={16} />
          </button>
        </div>

        {submitted ? (
          <div className="px-5 py-7">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-button-green/15 text-button-green">
              <IconCheck size={24} />
            </div>
            <h3 className="mt-4 text-center text-[18px] font-semibold text-header-primary">
              Report submitted
            </h3>
            <p className="mx-auto mt-2 max-w-[340px] text-center text-[14px] leading-relaxed text-text-muted">
              Thank you. Sentinel reviews reports every hour, and anything that needs context goes to a person.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 flex h-9 w-full items-center justify-center rounded-[3px] bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="channel-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="flex items-start gap-3 rounded-[3px] border border-divider bg-bg-tertiary px-3 py-2.5">
                {author && (
                  <Avatar profile={author} size="sm" className="!h-8 !w-8 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-header-primary">{name}</p>
                  <p className="mt-0.5 line-clamp-2 break-words text-[13px] leading-[18px] text-text-muted">
                    {preview}
                  </p>
                </div>
              </div>

              <p className="mb-2 mt-4 text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
                What would you like to report?
              </p>
              <div role="radiogroup" aria-label="Report reason" className="space-y-1">
                {reasons.map((option) => {
                  const selected = reason === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-[3px] border px-3 py-2.5 transition-colors ${
                        selected
                          ? "border-brand bg-brand/10"
                          : "border-transparent bg-bg-tertiary hover:bg-interactive-hover"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={option.id}
                        checked={selected}
                        onChange={() => setReason(option.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected ? "border-brand" : "border-text-muted/70"
                        }`}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium leading-[18px] text-text-normal">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[13px] leading-[17px] text-text-muted">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 flex items-center justify-between text-[12px] font-bold uppercase tracking-[0.02em] text-header-secondary">
                  <span>More details (optional)</span>
                  <span className="font-medium normal-case tracking-normal text-text-muted">
                    {details.length}/{MAX_REPORT_DETAILS}
                  </span>
                </span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value.slice(0, MAX_REPORT_DETAILS))}
                  rows={3}
                  maxLength={MAX_REPORT_DETAILS}
                  placeholder="Add context that helps us understand what happened."
                  className="block w-full resize-none rounded-[3px] border border-transparent bg-bg-tertiary px-3 py-2.5 text-[14px] leading-[19px] text-text-normal outline-none transition-[border-color] placeholder:text-text-muted/80 focus:border-brand"
                />
              </label>

              {error && (
                <p role="alert" className="mt-3 text-[13px] leading-[18px] text-status-dnd">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-divider bg-bg-secondary px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-9 items-center justify-center rounded-[3px] px-4 text-[14px] font-medium text-text-normal transition-colors hover:bg-interactive-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!reason || submitting}
                className="inline-flex h-9 items-center justify-center rounded-[3px] bg-brand px-4 text-[14px] font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
