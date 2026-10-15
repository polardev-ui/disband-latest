import { useState } from "react";
import { Accessibility, Bell, Paintbrush, Shield, UserRound, X } from "lucide-react";
import type { DesignKey, MotionPref, ThemePref } from "../data/types";
import { ME } from "../data/seed";
import { useChat } from "../state/store";
import { Avatar } from "./Avatar";
import { Segmented, Switch } from "./Controls";
import { useToast } from "./Toast";

export type SettingsSection = "profile" | "privacy" | "notifications" | "appearance" | "accessibility";

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Bell }[] = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "privacy", label: "Privacy & safety", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Paintbrush },
  { id: "accessibility", label: "Accessibility", icon: Accessibility },
];

export function Settings({ design, onClose, initial = "profile" }: { design: DesignKey; onClose: () => void; initial?: SettingsSection }) {
  const [section, setSection] = useState<SettingsSection>(initial);
  return (
    <div className="st">
      <nav className="st-nav" aria-label="Settings sections">
        <p className="st-nav-title">Settings</p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="st-nav-item"
            aria-current={section === s.id ? "page" : undefined}
            onClick={() => setSection(s.id)}
          >
            <s.icon size={17} aria-hidden="true" />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
      <div className="st-body">
        <header className="st-head">
          <h2 className="st-h">{SECTIONS.find((s) => s.id === section)!.label}</h2>
          <button type="button" className="st-close" aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <p className="st-note">Changes here only affect this prototype, not your Disband account.</p>
        <div className="st-content" key={section}>
          {section === "profile" && <ProfileSection />}
          {section === "privacy" && <PrivacySection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "appearance" && <AppearanceSection design={design} />}
          {section === "accessibility" && <AccessibilitySection />}
        </div>
      </div>
    </div>
  );
}

function ProfileSection() {
  const { state, actions } = useChat();
  const toast = useToast();
  const me = state.people[ME];
  const [form, setForm] = useState({ name: me.name, username: me.username, pronouns: me.pronouns ?? "", bio: me.bio ?? "", note: me.note ?? "" });
  const dirty = form.name !== me.name || form.username !== me.username || form.pronouns !== (me.pronouns ?? "") || form.bio !== (me.bio ?? "") || form.note !== (me.note ?? "");
  const usernameOk = /^[a-z0-9_.]{2,32}$/.test(form.username);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="st-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!usernameOk || !form.name.trim()) return;
        actions.setMe({ name: form.name.trim(), username: form.username, pronouns: form.pronouns.trim() || undefined, bio: form.bio.trim() || undefined, note: form.note.trim() || undefined });
        toast("Profile updated in this prototype");
      }}
    >
      <div className="st-profile-preview">
        <Avatar person={{ ...me, name: form.name || me.name }} size={56} />
        <div>
          <p className="st-profile-name">{form.name || "Your name"}</p>
          <p className="st-hint">@{form.username}{form.pronouns ? ` · ${form.pronouns}` : ""}</p>
        </div>
      </div>
      <label className="field">
        <span className="field-label">Display name</span>
        <input className="input" value={form.name} onChange={set("name")} maxLength={32} required />
      </label>
      <label className="field">
        <span className="field-label">Username</span>
        <span className="input-wrap">
          <span className="input-prefix">@</span>
          <input className="input" value={form.username} onChange={set("username")} maxLength={32} aria-invalid={!usernameOk} aria-describedby="un-hint" />
        </span>
        <span className={`field-hint${usernameOk ? "" : " field-hint--error"}`} id="un-hint">
          {usernameOk ? "Friends use this to add you. Lowercase letters, numbers, dots and underscores." : "Use 2–32 lowercase letters, numbers, dots or underscores."}
        </span>
      </label>
      <label className="field">
        <span className="field-label">Pronouns</span>
        <input className="input" value={form.pronouns} onChange={set("pronouns")} maxLength={40} placeholder="Optional" />
      </label>
      <label className="field">
        <span className="field-label">About me</span>
        <textarea className="input textarea" value={form.bio} onChange={set("bio")} maxLength={190} rows={3} />
        <span className="field-hint">{190 - form.bio.length} characters left</span>
      </label>
      <label className="field">
        <span className="field-label">Status note</span>
        <input className="input" value={form.note} onChange={set("note")} maxLength={80} placeholder="What are you up to?" />
      </label>
      <div className="st-form-actions">
        <button type="button" className="btn btn--ghost" disabled={!dirty} onClick={() => setForm({ name: me.name, username: me.username, pronouns: me.pronouns ?? "", bio: me.bio ?? "", note: me.note ?? "" })}>
          Reset
        </button>
        <button type="submit" className="btn btn--primary" disabled={!dirty || !usernameOk || !form.name.trim()}>
          Save changes
        </button>
      </div>
    </form>
  );
}

function PrivacySection() {
  const { state, actions } = useChat();
  const p = state.prefs;
  return (
    <>
      <div className="st-group">
        <Switch
          label="Appear offline"
          hint="You'll look offline to everyone. You can still read and send messages."
          checked={p.appearOffline}
          onChange={(v) => actions.setPrefs({ appearOffline: v })}
        />
        <Switch
          label="Show link previews"
          hint="Previews fetch a page's title and summary. Turn this off to keep links as plain text."
          checked={p.linkPreviews}
          onChange={(v) => actions.setPrefs({ linkPreviews: v })}
        />
        <div className="st-row">
          <div className="st-row-text">
            <span className="st-label">Two-factor authentication</span>
            <span className="st-hint">Asks for a code from your authenticator app when you sign in. Managed in the real app.</span>
          </div>
          <span className="st-status">On</span>
        </div>
      </div>
      <h3 className="st-sub">Blocked people</h3>
      <div className="st-group">
        {state.blocked.length === 0 && <p className="st-empty">You haven't blocked anyone.</p>}
        {state.blocked.map((id) => {
          const person = state.people[id];
          return (
            <div key={id} className="st-row">
              <div className="st-person">
                <Avatar person={person} size={28} />
                <span className="st-row-text">
                  <span className="st-label">{person.name}</span>
                  <span className="st-hint">@{person.username}</span>
                </span>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => actions.friend("unblock", id)}>
                Unblock
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function NotificationsSection() {
  const { state, actions } = useChat();
  const p = state.prefs;
  return (
    <div className="st-group">
      <Segmented
        label="Notify me about"
        value={p.notify}
        onChange={(v) => actions.setPrefs({ notify: v })}
        options={[
          { value: "all", label: "Everything" },
          { value: "mentions", label: "Mentions only" },
          { value: "none", label: "Nothing" },
        ]}
      />
      <Switch label="Desktop notifications" hint="When Disband isn't the window you're using." checked={p.desktop} onChange={(v) => actions.setPrefs({ desktop: v })} />
      <Switch label="Message sounds" checked={p.sounds} onChange={(v) => actions.setPrefs({ sounds: v })} />
    </div>
  );
}

function AppearanceSection({ design }: { design: DesignKey }) {
  const { state, actions } = useChat();
  return (
    <div className="st-group">
      <Segmented<ThemePref>
        label="Theme"
        hint="System follows your device's light or dark setting."
        value={state.prefs.themes[design]}
        onChange={(v) => actions.setTheme(design, v)}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </div>
  );
}

function AccessibilitySection() {
  const { state, actions } = useChat();
  const p = state.prefs;
  return (
    <div className="st-group">
      <Segmented<MotionPref>
        label="Motion"
        hint="Reduced keeps fades and drops slides and scaling."
        value={p.motion}
        onChange={(v) => actions.setPrefs({ motion: v })}
        options={[
          { value: "system", label: "Match system" },
          { value: "full", label: "Full" },
          { value: "reduced", label: "Reduced" },
        ]}
      />
      <Segmented
        label="Message text"
        value={p.textSize}
        onChange={(v) => actions.setPrefs({ textSize: v })}
        options={[
          { value: "default", label: "Default" },
          { value: "large", label: "Large" },
        ]}
      />
    </div>
  );
}
