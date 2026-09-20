"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";

interface NewPasswordFormProps {
  onSubmit: (password: string) => Promise<string | null>;
  submitLabel?: string;
  onSuccess?: () => void;
}

export function NewPasswordForm({
  onSubmit,
  submitLabel = "Update password",
  onSuccess,
}: NewPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const err = await onSubmit(password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }

    setSuccess("Password updated.");
    // Clear the fields but stay usable: the old version disabled the form
    // after success, so an expired-link retry left the user stuck.
    setPassword("");
    setConfirm("");
    onSuccess?.();
  }

  function passwordField(
    id: string,
    label: string,
    value: string,
    setValue: (v: string) => void,
    show: boolean,
    setShow: (v: boolean) => void,
  ) {
    return (
      <label className="block" htmlFor={id}>
        <span className="mb-1 block text-xs font-bold uppercase text-text-muted">{label}</span>
        <span className="relative block">
          <input
            id={id}
            required
            type={show ? "text" : "password"}
            minLength={6}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded bg-bg-accent px-3 py-2.5 pr-16 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={show}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[13px] font-medium text-text-muted transition-colors hover:text-text-normal"
          >
            {show ? "Hide" : "Show"}
          </button>
        </span>
      </label>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {passwordField("new-password", "New password", password, setPassword, showPassword, setShowPassword)}
      {passwordField("confirm-password", "Confirm password", confirm, setConfirm, showConfirm, setShowConfirm)}
      {error && <p role="alert" className="text-sm text-status-dnd">{error}</p>}
      {success && <p role="status" className="text-sm text-status-online">{success}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-white transition-all duration-150 ease-in-out hover:bg-brand-hover disabled:opacity-50"
      >
        {loading ? "Updating…" : submitLabel}
      </button>
    </form>
  );
}
