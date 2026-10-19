"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { FieldLabel, InlineError, SettingRow, SettingsSection, Toggle, btn, settingsInputClass } from "./ui";
import type { SectionProps } from "./types";

const NAME_MAX = 100;
const DESCRIPTION_MAX = 300;

export function OverviewSection({ server, isOwner }: SectionProps) {
  const { updateServer } = useApp();
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? "");
  const [discoverable, setDiscoverable] = useState(!!server.discoverable);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Follow the server row when it changes underneath us (another admin, a
  // realtime update) — but only fields that aren't mid-edit.
  useEffect(() => {
    setName(server.name);
    setDescription(server.description ?? "");
    setDiscoverable(!!server.discoverable);
  }, [server.id, server.name, server.description, server.discoverable]);

  const dirty = name.trim() !== server.name || description.trim() !== (server.description ?? "").trim();

  async function save() {
    if (!name.trim()) {
      setError("Your space needs a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const err = await updateServer(server.id, { name: name.trim(), description: description.trim() || null });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  }

  async function toggleDiscovery(next: boolean) {
    setDiscoverable(next);
    setDiscoveryError(null);
    const err = await updateServer(server.id, { discoverable: next });
    if (err) {
      setDiscoverable(!next);
      setDiscoveryError(err);
    }
  }

  return (
    <div className="pb-20">
      <SettingsSection title="Identity" description="Shown in the sidebar, on invite previews and in Discover.">
        <div className="space-y-4 px-5 py-4">
          <div>
            <FieldLabel htmlFor="space-name" aside={`${name.length}/${NAME_MAX}`}>Space name</FieldLabel>
            <input
              id="space-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              disabled={!isOwner}
              className={`${settingsInputClass} disabled:opacity-60`}
            />
          </div>
          <div>
            <FieldLabel htmlFor="space-description" aside={`${description.length}/${DESCRIPTION_MAX}`}>Description</FieldLabel>
            <textarea
              id="space-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              disabled={!isOwner}
              rows={4}
              placeholder="What's this space about? Who's it for?"
              className={`${settingsInputClass} resize-none leading-relaxed disabled:opacity-60`}
            />
          </div>
          {!isOwner && <p className="text-[12.5px] text-text-muted">Only the owner can change these.</p>}
        </div>
      </SettingsSection>

      <SettingsSection title="Discovery">
        <SettingRow
          label="List in Discover"
          htmlFor="space-discoverable"
          description="Anyone can find this space by name and join without an invite. It shows under Popular by member count and under New by age."
        >
          <Toggle
            id="space-discoverable"
            label="List this space in Discover"
            checked={discoverable}
            disabled={!isOwner}
            onChange={(next) => void toggleDiscovery(next)}
          />
        </SettingRow>
        {discoveryError && <p className="border-t border-divider px-5 py-3 text-[13px] text-status-dnd">{discoveryError}</p>}
      </SettingsSection>

      <InlineError>{error}</InlineError>

      {isOwner && (dirty || saving || savedFlash) && (
        <div className="view-enter sticky bottom-0 -mx-8 mt-8 flex items-center justify-between gap-3 border-t border-divider bg-overlay-panel/95 px-8 py-3 backdrop-blur">
          <p className="text-[14px] text-text-muted">{savedFlash ? "Saved." : "You have unsaved changes."}</p>
          <div className="flex gap-2">
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setName(server.name);
                  setDescription(server.description ?? "");
                  setError(null);
                }}
                className={btn.ghost}
              >
                Reset
              </button>
            )}
            <button type="button" onClick={() => void save()} disabled={saving || !dirty} className={btn.primary}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
