"use client";

import { useEffect, useRef, useState } from "react";
import { uploadMedia } from "@/lib/media/uploadMedia";
import { getSupabaseClient } from "@/lib/supabase/client";
import { BUG_REPORT_EMAIL, BUG_REPORT_LIMITS } from "@/lib/bug-reports";
import { IconBounty, IconClose, IconUpload } from "@/components/icons";

interface AttachmentDraft {
  id: string;
  name: string;
  type: string;
  url: string | null; // set once uploaded
  error: string | null;
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-[#2b2d31] px-3.5 py-2.5 text-[15px] text-[#dbdee1] " +
  "outline-none transition-colors placeholder:text-[#72767d] focus:border-[#00a8fc]/60";

const labelClass = "mb-1.5 block text-[13px] font-semibold text-[#b5bac1]";

let nextId = 0;

export function BugReportForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await getSupabaseClient().auth.getUser();
        if (cancelled || !data.user) return;
        if (data.user.email) setEmail(data.user.email);
        const { data: profile } = await getSupabaseClient()
          .from("profiles")
          .select("display_name, username")
          .eq("id", data.user.id)
          .maybeSingle();
        if (cancelled) return;
        const p = profile as { display_name?: string | null; username?: string | null } | null;
        if (p?.display_name || p?.username) setName(p.display_name || p.username || "");
      } catch {
        // Not signed in — leave the fields empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (attachments.length >= BUG_REPORT_LIMITS.attachmentsMax) break;
      const id = `att-${++nextId}`;
      setAttachments((prev) => [
        ...prev,
        { id, name: file.name, type: file.type || "file", url: null, error: null },
      ]);
      try {
        const result = await uploadMedia(file, { maxUploadBytes: 25 * 1024 * 1024 });
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, url: result.url } : a)),
        );
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, error: err instanceof Error ? err.message : "Upload failed" }
              : a,
          ),
        );
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        reporterName: name.trim() || null,
        reporterEmail: email.trim() || null,
        title: title.trim(),
        description: description.trim(),
        steps: steps.trim(),
        attachments: attachments
          .filter((a) => a.url && !a.error)
          .map((a) => ({ url: a.url!, name: a.name, type: a.type })),
      };
      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not submit the report. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error while submitting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#23a55a]/30 bg-[#2b2d31] p-8 text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#23a55a]/15 text-[#23a55a]">
          <IconBounty size={32} />
        </span>
        <h2 className="text-xl font-bold text-white">Bug report sent</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-[#b5bac1]">
          Thanks for helping make Disband better. Our team has been emailed the details.
          If we fix your bug, your account gets the{" "}
          <span className="font-semibold text-[#43b581]">Bug Bounty Hunter</span> badge.
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setTitle("");
            setDescription("");
            setSteps("");
            setAttachments([]);
          }}
          className="mt-6 rounded-lg bg-[#5865f2] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
        >
          Report another bug
        </button>
      </div>
    );
  }

  const ready =
    title.trim().length >= BUG_REPORT_LIMITS.titleMin &&
    description.trim().length >= BUG_REPORT_LIMITS.descriptionMin &&
    email.trim().length > 0;

  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-[#43b581]/25 bg-[#43b581]/[0.07] p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#43b581]/15 text-[#43b581]">
          <IconBounty size={20} />
        </span>
        <div>
          <p className="text-[14px] font-semibold text-[#43b581]">Bug Bounty</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[#b5bac1]">
            Find a bug, tell us how to reproduce it, and if we fix it you&apos;ll earn the
            Bug Bounty Hunter badge on your profile. Reports go straight to{" "}
            <a href={`mailto:${BUG_REPORT_EMAIL}`} className="text-[#00a8fc] hover:underline">
              {BUG_REPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} placeholder="Optional" />
        </label>
        <label className="block">
          <span className={labelClass}>Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={BUG_REPORT_LIMITS.titleMax}
          required
          className={inputClass}
          placeholder="Short summary of the bug — e.g. 'Messages fail to send after reconnecting'"
        />
      </label>

      <label className="block">
        <span className={labelClass}>What's the bug?</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={BUG_REPORT_LIMITS.descriptionMax}
          required
          className={`${inputClass} resize-none`}
          placeholder="What happened? What did you expect to happen instead?"
        />
        <span className="mt-1 block text-right text-[11px] text-[#72767d]">
          {description.length}/{BUG_REPORT_LIMITS.descriptionMax}
        </span>
      </label>

      <label className="block">
        <span className={labelClass}>How can we reproduce it?</span>
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={4}
          maxLength={BUG_REPORT_LIMITS.stepsMax}
          className={`${inputClass} resize-none`}
          placeholder={"One step per line, e.g.\n1. Open a DM with a friend\n2. Send an image\n3. The preview never loads"}
        />
      </label>

      <div>
        <span className={labelClass}>Proof (image or video, optional)</span>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={attachments.length >= BUG_REPORT_LIMITS.attachmentsMax}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 bg-[#2b2d31] px-4 py-3 text-sm font-semibold text-[#b5bac1] transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconUpload size={16} />
          {attachments.length > 0
            ? `Add another (${attachments.length}/${BUG_REPORT_LIMITS.attachmentsMax})`
            : "Attach screenshots or a video"}
        </button>
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg bg-[#2b2d31] px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-[#dbdee1]">{a.name}</span>
                {a.error ? (
                  <span className="shrink-0 text-[12px] text-[#f23f43]">{a.error}</span>
                ) : a.url ? (
                  <span className="shrink-0 text-[12px] text-[#43b581]">Uploaded ✓</span>
                ) : (
                  <span className="shrink-0 text-[12px] text-[#949ba4]">Uploading…</span>
                )}
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="shrink-0 text-[#72767d] hover:text-white"
                  aria-label={`Remove ${a.name}`}
                >
                  <IconClose size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-[#f23f43]">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-[#72767d]">
          We only use your email to follow up about this report.
        </p>
        <button
          type="submit"
          disabled={!ready || submitting}
          className="rounded-lg bg-[#5865f2] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit bug report"}
        </button>
      </div>
    </form>
  );
}
