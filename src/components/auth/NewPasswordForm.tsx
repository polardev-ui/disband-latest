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
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase text-text-muted">New password</span>
        <input
          required
          type="password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded bg-bg-accent px-3 py-2.5 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase text-text-muted">Confirm password</span>
        <input
          required
          type="password"
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded bg-bg-accent px-3 py-2.5 text-sm text-text-normal outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      {error && <p className="text-sm text-status-dnd">{error}</p>}
      {success && <p className="text-sm text-status-online">{success}</p>}
      <button
        type="submit"
        disabled={loading || !!success}
        className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-white transition-all duration-150 ease-in-out hover:bg-brand-hover disabled:opacity-50"
      >
        {loading ? "..." : submitLabel}
      </button>
    </form>
  );
}
