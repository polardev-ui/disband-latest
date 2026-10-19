"use client";

import { useCallback, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { requestEmailChange } from "@/lib/email-change";
import { safeImageUrl } from "@/lib/safe-url";
import { getAccentBackground, usesCustomAccent } from "@/lib/profileColor";
import { presenceStatusFor } from "@/lib/presence";
import { displayName } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { ClassicLabel, ClassicModal, classicBtn, classicInput } from "@/components/ui/ClassicModal";
import { MfaSettingsPanel } from "@/components/auth/MfaSettingsPanel";

/*
 Settings › My Account, after Discord's 2021–22 layout:

   ┌ banner ─────────────────────────────────────┐
   │ (avatar)  name                [Edit User Profile] │
   │ ┌ DISPLAY NAME / USERNAME / EMAIL / USER ID ┐ │
   │ └─────────────────────────────────── [Edit] ┘ │
   └─────────────────────────────────────────────┘
   Password and Authentication · [Change Password]
   TWO-FACTOR AUTHENTICATION
   ACCOUNT REMOVAL
*/

const HEADING = "text-[12px] font-bold uppercase leading-4 tracking-[0.02em] text-header-secondary";

/** "j••••••@gmail.com" style: the local part hidden, the domain kept. */
function maskEmail(email: string) {
  const at = email.indexOf("@");
  if (at < 1) return "*".repeat(email.length);
  return "*".repeat(at) + email.slice(at);
}

export function MyAccountPanel({
  onEditProfile,
  onDeleteAccount,
}: {
  onEditProfile: () => void;
  onDeleteAccount: () => void;
}) {
  const { profile, user, presenceMap, updatePassword, requestPasswordReset, cancelAccountDeletion } = useApp();
  const [revealEmail, setRevealEmail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyId = useCallback(async () => {
    if (!profile?.id) return;
    try {
      await navigator.clipboard.writeText(profile.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to the clipboard.");
    }
  }, [profile?.id]);

  if (!profile) return null;

  const banner = safeImageUrl(profile.banner_url);
  const bannerBg = usesCustomAccent(profile) ? getAccentBackground(profile) : profile.accent_color ?? "#5865f2";
  const email = user?.email ?? null;
  const isAnonymous = profile.account_type === "anonymous";
  const pendingDeletion = Boolean(profile.deletion_requested_at);

  async function signOutOthers() {
    setSigningOut(true);
    setError(null);
    const { error: err } = await getSupabaseClient().auth.signOut({ scope: "others" });
    setSigningOut(false);
    if (err) setError(err.message);
    else setSignedOut(true);
  }

  const rows: { label: string; value: React.ReactNode; action: React.ReactNode }[] = [
    {
      label: "Display Name",
      value: displayName(profile),
      action: (
        <button type="button" onClick={onEditProfile} className={`${classicBtn.grey} ${classicBtn.sm}`}>
          Edit
        </button>
      ),
    },
    {
      label: "Username",
      value: profile.username ?? "—",
      action: (
        <button type="button" onClick={onEditProfile} className={`${classicBtn.grey} ${classicBtn.sm}`}>
          Edit
        </button>
      ),
    },
    {
      label: "Email",
      value: email ? (
        <>
          {revealEmail ? email : maskEmail(email)}
          <button
            type="button"
            onClick={() => setRevealEmail((v) => !v)}
            className="ml-1 text-[14px] text-[#00a8fc] hover:underline"
          >
            {revealEmail ? "Hide" : "Reveal"}
          </button>
        </>
      ) : (
        <span className="text-text-muted">You haven&apos;t added an email.</span>
      ),
      action: email ? (
        <button type="button" onClick={() => setEmailOpen(true)} className={`${classicBtn.grey} ${classicBtn.sm}`}>
          Edit
        </button>
      ) : null,
    },
    {
      label: "User ID",
      value: <span className="font-mono text-[14px]">{profile.id}</span>,
      action: (
        <button type="button" onClick={() => void copyId()} className={`${classicBtn.grey} ${classicBtn.sm}`}>
          {copied ? "Copied" : "Copy"}
        </button>
      ),
    },
  ];

  return (
    <div className="max-w-[660px] pb-20">
      {/* Account card */}
      <section className="overflow-hidden rounded-lg bg-bg-tertiary">
        <div className="h-[100px]" style={{ background: bannerBg }}>
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="relative flex min-h-[72px] items-center gap-4 py-4 pl-[120px] pr-4">
          <span className="absolute left-4 top-[-24px] rounded-full bg-bg-tertiary p-[7px]">
            <span className="relative block">
              <Avatar profile={profile} size="xl" className="!h-20 !w-20 !text-2xl" />
              <StatusDot status={presenceStatusFor(profile, presenceMap)} size={16} ring="var(--bg-tertiary)" className="absolute bottom-0 right-0" />
            </span>
          </span>
          <p className="min-w-0 flex-1 truncate text-[20px] font-semibold leading-6 text-header-primary">
            {displayName(profile)}
            {profile.username && displayName(profile) !== profile.username && (
              <span className="ml-1.5 text-[16px] font-medium text-header-secondary">{profile.username}</span>
            )}
          </p>
          <button type="button" onClick={onEditProfile} className={`${classicBtn.brand} ${classicBtn.sm} shrink-0`}>
            Edit User Profile
          </button>
        </div>
        <div className="mx-4 mb-4 space-y-6 rounded-lg bg-bg-secondary p-4">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className={`${HEADING} mb-1`}>{r.label}</h3>
                <p className="truncate text-[16px] leading-5 text-header-primary">{r.value}</p>
              </div>
              {r.action && <div className="shrink-0">{r.action}</div>}
            </div>
          ))}
        </div>
      </section>

      <div className="my-10 h-px bg-[#3f4147]" />

      {/* Password and Authentication */}
      <section>
        <h2 className="mb-5 text-[20px] font-semibold leading-6 text-header-primary">Password and Authentication</h2>
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => setPasswordOpen(true)} className={`${classicBtn.brand} ${classicBtn.sm}`}>
            Change Password
          </button>
          {email && (
            <p className="text-[14px] text-header-secondary">
              Forgot it?{" "}
              <button
                type="button"
                disabled={resetSent}
                onClick={async () => {
                  setError(null);
                  const err = await requestPasswordReset(email);
                  if (err) setError(err);
                  else setResetSent(true);
                }}
                className="text-[#00a8fc] hover:underline disabled:text-status-online disabled:no-underline"
              >
                {resetSent ? "Reset link sent — check your inbox." : "Email me a reset link"}
              </button>
            </p>
          )}
        </div>

        <div className="mt-7">
          <MfaSettingsPanel />
        </div>
      </section>

      <div className="my-10 h-px bg-[#3f4147]" />

      {/* Devices */}
      <section>
        <h3 className={`${HEADING} mb-2`}>Devices</h3>
        <p className="mb-4 text-[14px] leading-[18px] text-header-secondary">
          Signed in somewhere you don&apos;t recognise? Log out everywhere else. You&apos;ll stay logged in here.
        </p>
        <button
          type="button"
          disabled={signingOut || signedOut}
          onClick={() => void signOutOthers()}
          className={`${classicBtn.danger} ${classicBtn.sm}`}
        >
          {signedOut ? "Logged Out Everywhere Else" : signingOut ? "Logging Out…" : "Log Out All Known Devices"}
        </button>
      </section>

      <div className="my-10 h-px bg-[#3f4147]" />

      {/* Account removal */}
      <section>
        <h3 className={`${HEADING} mb-2`}>Account Removal</h3>
        {pendingDeletion ? (
          <>
            <p className="mb-4 text-[14px] leading-[18px] text-header-secondary">
              Your account is scheduled for deletion on{" "}
              <span className="font-medium text-header-primary">
                {profile.deletion_purge_at ? new Date(profile.deletion_purge_at).toLocaleString() : "—"}
              </span>
              . You can cancel until{" "}
              {profile.deletion_cancel_until ? new Date(profile.deletion_cancel_until).toLocaleString() : "—"}.
            </p>
            <button
              type="button"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true);
                setError(null);
                const res = await cancelAccountDeletion();
                setCancelling(false);
                if (res.error) setError(res.error);
              }}
              className={`${classicBtn.brand} ${classicBtn.sm}`}
            >
              {cancelling ? "Cancelling…" : "Cancel Deletion"}
            </button>
          </>
        ) : (
          <>
            <p className="mb-4 text-[14px] leading-[18px] text-header-secondary">
              {isAnonymous
                ? "Deleting removes your profile and everything tied to it straight away."
                : "Deleting your account schedules it for removal in 14 days. For the first 24 hours you can log back in to cancel."}
            </p>
            <button type="button" onClick={onDeleteAccount} className={`${classicBtn.dangerOutline} ${classicBtn.sm}`}>
              Delete Account
            </button>
          </>
        )}
      </section>

      {error && <p className="mt-6 text-[14px] text-status-dnd">{error}</p>}

      <EmailModal open={emailOpen} current={email ?? ""} onClose={() => setEmailOpen(false)} />
      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} onSubmit={updatePassword} />
    </div>
  );
}

function EmailModal({ open, current, onClose }: { open: boolean; current: string; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    onClose();
    setValue("");
    setSent(false);
    setError(null);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!next) return;
    if (next.toLowerCase() === current.toLowerCase()) {
      setError("That's already your email.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await requestEmailChange(next);
    setBusy(false);
    if (err) setError(err);
    else setSent(true);
  }

  return (
    <ClassicModal
      open={open}
      onClose={close}
      title={sent ? "Check your inbox" : "Enter an email address"}
      subtitle={
        sent
          ? `We sent a confirmation link to ${current}. Once you click it, we'll send one to your new address.`
          : "Enter a new email address. Both your current and new email will need to confirm the change."
      }
      footer={
        sent ? (
          <button type="button" onClick={close} className={`${classicBtn.brand} ${classicBtn.md}`}>
            Okay
          </button>
        ) : (
          <>
            <button type="button" onClick={close} className={`${classicBtn.link} ${classicBtn.md}`}>
              Cancel
            </button>
            <button type="submit" form="classic-email-form" disabled={busy || !value.trim()} className={`${classicBtn.brand} ${classicBtn.md}`}>
              {busy ? "Sending…" : "Done"}
            </button>
          </>
        )
      }
    >
      {!sent && (
        <form id="classic-email-form" onSubmit={submit}>
          <ClassicLabel htmlFor="classic-email">Email</ClassicLabel>
          <input
            id="classic-email"
            type="email"
            autoFocus
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={classicInput}
          />
          {error && <p className="mt-2 text-[14px] text-status-dnd">{error}</p>}
        </form>
      )}
    </ClassicModal>
  );
}

function PasswordModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    onClose();
    setPassword("");
    setConfirm("");
    setDone(false);
    setError(null);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onSubmit(password);
    setBusy(false);
    if (err) setError(err);
    else setDone(true);
  }

  return (
    <ClassicModal
      open={open}
      onClose={close}
      title={done ? "Password updated" : "Update your password"}
      subtitle={done ? "Your new password is set." : "Enter a new password for your account."}
      footer={
        done ? (
          <button type="button" onClick={close} className={`${classicBtn.brand} ${classicBtn.md}`}>
            Okay
          </button>
        ) : (
          <>
            <button type="button" onClick={close} className={`${classicBtn.link} ${classicBtn.md}`}>
              Cancel
            </button>
            <button type="submit" form="classic-password-form" disabled={busy} className={`${classicBtn.brand} ${classicBtn.md}`}>
              {busy ? "Updating…" : "Done"}
            </button>
          </>
        )
      }
    >
      {!done && (
        <form id="classic-password-form" onSubmit={submit} className="space-y-5">
          <div>
            <ClassicLabel htmlFor="classic-new-password">New Password</ClassicLabel>
            <input
              id="classic-new-password"
              type="password"
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={classicInput}
            />
          </div>
          <div>
            <ClassicLabel htmlFor="classic-confirm-password">Confirm New Password</ClassicLabel>
            <input
              id="classic-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={classicInput}
            />
          </div>
          {error && <p role="alert" className="text-[14px] text-status-dnd">{error}</p>}
        </form>
      )}
    </ClassicModal>
  );
}
