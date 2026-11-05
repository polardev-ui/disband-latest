"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { SettingRow, SettingsSection, Toggle } from "./SettingsPrimitives";
import { useI18n } from "@/contexts/I18nContext";

/** Who can reach you. Message requests are migration 0193. */
export function PrivacyPanel() {
  const { t } = useI18n();
  const { profile, updateProfile } = useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowRequests = profile?.allow_message_requests !== false;

  async function setAllowRequests(next: boolean) {
    setSaving(true);
    setError(null);
    const err = await updateProfile({ allow_message_requests: next });
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <div>
      <SettingsSection
        title={t("Direct Messages")}
        description={t("Friends can always message you. This controls everyone else.")}
      >
        <SettingRow
          label={t("Allow message requests")}
          description={t("People who share a space with you can send you a message. It lands in Message Requests, not your DMs, until you reply or accept. The official Disband space doesn't count as a shared space.")}
          htmlFor="privacy-message-requests"
        >
          <Toggle
            id="privacy-message-requests"
            label={t("Allow message requests")}
            checked={allowRequests}
            disabled={saving || !profile}
            onChange={(next) => void setAllowRequests(next)}
          />
        </SettingRow>
      </SettingsSection>
      {error && <p className="mt-2 text-[14px] text-status-dnd">{error}</p>}
    </div>
  );
}
