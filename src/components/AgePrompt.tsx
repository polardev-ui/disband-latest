"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { ClassicModal, ClassicLabel, classicBtn, classicInput } from "@/components/ui/ClassicModal";

export function AgePrompt() {
  const { session, user, ready } = useApp();
  const [open, setOpen] = useState(false);
  const [birthdate, setBirthdate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !session || !user) return;
    const meta = (user.user_metadata ?? {}) as { birthdate?: string };
    if (!meta.birthdate) setOpen(true);
  }, [ready, session, user]);

  if (!open) return null;

  const save = async () => {
    if (!birthdate) {
      setError("Please enter your date of birth.");
      return;
    }
    const birth = new Date(birthdate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
    if (Number.isNaN(age) || age < 13) {
      setError("You must be at least 13 years old to use Disband.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await getSupabaseClient().auth.updateUser({
      data: { birthdate },
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
  };

  return (
    <ClassicModal open={open} onClose={() => {}} title="Confirm your age">
      <div className="space-y-4">
        <p className="text-[14px] leading-[18px] text-header-secondary">
          To keep Disband safe and compliant, please add your date of birth. This is stored privately
          and is never shown to other users. You only need to do this once.
        </p>
        <ClassicLabel>Date of birth</ClassicLabel>
        <input
          type="date"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className={classicInput}
        />
        {error && <p className="text-[14px] text-status-dnd">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={saving || !birthdate}
            onClick={() => void save()}
            className={`${classicBtn.brand} ${classicBtn.sm}`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ClassicModal>
  );
}
