"use client";

import { useEffect, useRef, useState } from "react";
import { useSkin } from "@/components/theme/SkinProvider";
import { SKINS, type SkinId } from "@/lib/theme/skins";
import { isValidIconName, MAX_CUSTOM_CSS_BYTES } from "@/lib/theme/custom-css";
import { uploadMedia } from "@/lib/media/uploadMedia";
import { IconClose } from "@/components/icons";

/**
 * Themes: the Aero-only skins, custom CSS, and uploaded icons.
 *
 * Everything here is saved to the account rather than the device, so a skin
 * set up on a desktop is already on when the same person opens the web app.
 */
export function ThemesPanel() {
  const skin = useSkin();
  const [draftCss, setDraftCss] = useState(skin.customCss);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [iconName, setIconName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The row arrives after the first render, so the editor has to pick it up —
  // but not while it is being typed in, or every keystroke would be reverted.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setDraftCss(skin.customCss);
  }, [skin.customCss]);

  const locked = !skin.entitled;

  async function commit(patch: Parameters<typeof skin.save>[0], message: string) {
    setSaving(true);
    setError(null);
    setStatus(null);
    try { const err = await skin.save(patch); if(err)setError(err);else setStatus(message); }
    catch(e){setError(e instanceof Error?e.message:"Could not save theme.");}
    finally{setSaving(false);}
  }

  async function addIcon(file: File) {
    const name = iconName.trim().toLowerCase();
    if (!isValidIconName(name)) {
      setError("Icon names can use lowercase letters, numbers and dashes, up to 40 characters.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await uploadMedia(file, { maxUploadBytes: 2 * 1024 * 1024 });
      await commit(
        { icons: { ...skin.icons, [name]: result.url } },
        `Uploaded --icon-${name}.`,
      );
      setIconName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that icon.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-normal">Themes</h3>
          <span className="rounded bg-super/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-super">
            Aero
          </span>
        </div>
        <p className="text-sm text-text-muted">
          Skins change the shape of Disband, not just its colours — corners,
          typefaces and the way every button is drawn. They apply on web and
          desktop and follow your account between them.
        </p>
      </section>

      {locked && (
        <p className="rounded-md border border-super/30 bg-super/[0.08] px-3.5 py-2.5 text-[13px] leading-relaxed text-super">
          Themes are part of Disband <span className="font-bold">Aero</span>.
          {skin.lapsed
            ? " Your theme is still saved — resubscribe and it comes back exactly as you left it."
            : " Subscribe to use a skin, write custom CSS and upload your own icons."}
        </p>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Skin</p>
          {skin.preset && !locked && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void commit({ enabled: !skin.enabled }, skin.enabled ? "Skin turned off." : "Skin turned on.")}
              className="text-xs font-semibold text-text-muted hover:text-text-normal"
            >
              {skin.enabled ? "Turn off" : "Turn on"}
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SkinCard
            label="None"
            description="The standard Disband look."
            swatch={["#1e1f22", "#2b2d31", "#313338", "#5865f2"]}
            selected={!skin.preset}
            locked={locked}
            onSelect={() => void commit({ preset: null }, "Skin removed.")}
            onPreview={() => skin.preview(null)}
            onEndPreview={skin.endPreview}
          />
          {SKINS.map((s) => (
            <SkinCard
              key={s.id}
              label={s.label}
              description={s.description}
              swatch={s.swatch}
              font={s.sample.font}
              radius={s.sample.radius}
              selected={skin.preset === s.id}
              locked={locked}
              onSelect={() => void commit({ preset: s.id, enabled: true }, `${s.label} applied.`)}
              onPreview={() => skin.preview(s.id as SkinId)}
              onEndPreview={skin.endPreview}
            />
          ))}
        </div>
        {!locked && (
          <p className="mt-2 text-xs text-text-muted">
            Hover a skin to try it. Nothing is saved until you click.
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">Custom CSS</p>
          <a
            href="/docs/themes"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-text-link hover:underline"
          >
            Theming guide &amp; template →
          </a>
        </div>
        <textarea
          value={draftCss}
          disabled={locked}
          spellCheck={false}
          onChange={(e) => {
            touched.current = true;
            setDraftCss(e.target.value.slice(0, MAX_CUSTOM_CSS_BYTES));
          }}
          rows={12}
          placeholder={"/* Try: */\nbutton {\n  border-radius: 0;\n}"}
          className="w-full resize-y rounded-md border border-divider bg-bg-tertiary p-3 font-mono text-[13px] leading-relaxed text-text-normal outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={locked || saving}
            onClick={() => {
              touched.current = false;
              void commit({ customCss: draftCss }, "Custom CSS saved.");
            }}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save CSS"}
          </button>
          <span className="text-xs text-text-muted">
            {draftCss.length.toLocaleString()} / {MAX_CUSTOM_CSS_BYTES.toLocaleString()}
          </span>
        </div>

        {skin.removedNotes.length > 0 && (
          <div className="mt-3 rounded-md border border-status-idle/30 bg-status-idle/[0.08] px-3.5 py-2.5 text-[13px] text-status-idle">
            <p className="font-semibold">Some of that CSS was removed before saving:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {skin.removedNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section>
        <p className="mb-1 text-sm font-semibold">Custom icons</p>
        <p className="mb-3 text-sm text-text-muted">
          Upload an image and reference it from your CSS as{" "}
          <code className="rounded bg-bg-tertiary px-1 py-0.5 font-mono text-xs">var(--icon-name)</code>.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={iconName}
            disabled={locked}
            onChange={(e) => setIconName(e.target.value)}
            placeholder="icon name"
            className="w-44 rounded-md border border-divider bg-bg-tertiary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void addIcon(file);
            }}
          />
          <button
            type="button"
            disabled={locked || uploading || !iconName.trim()}
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-divider px-4 py-2 text-sm font-semibold text-text-normal hover:bg-interactive-hover disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload icon"}
          </button>
        </div>

        {Object.keys(skin.icons).length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {Object.entries(skin.icons).map(([name, url]) => (
              <li
                key={name}
                className="flex items-center gap-3 rounded-md border border-divider bg-bg-secondary px-3 py-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-6 w-6 shrink-0 object-contain" />
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-text-normal">
                  var(--icon-{name})
                </code>
                <button
                  type="button"
                  disabled={locked || saving}
                  aria-label={`Remove ${name}`}
                  onClick={() => {
                    const next = { ...skin.icons };
                    delete next[name];
                    void commit({ icons: next }, `Removed --icon-${name}.`);
                  }}
                  className="shrink-0 text-text-muted hover:text-status-dnd disabled:opacity-50"
                >
                  <IconClose size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {status && <p className="text-sm text-status-online">{status}</p>}
      {error && <p className="text-sm text-status-dnd">{error}</p>}
    </div>
  );
}

function SkinCard({
  label, description, swatch, font, radius, selected, locked,
  onSelect, onPreview, onEndPreview,
}: {
  label: string;
  description: string;
  swatch: readonly string[];
  font?: string;
  radius?: string;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onEndPreview: () => void;
}) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onSelect}
      onMouseEnter={() => { if (!locked) onPreview(); }}
      onMouseLeave={() => { if (!locked) onEndPreview(); }}
      onFocus={() => { if (!locked) onPreview(); }}
      onBlur={() => { if (!locked) onEndPreview(); }}
      className={`overflow-hidden rounded-lg border-2 text-left transition-all duration-150 ${
        selected ? "border-brand" : "border-transparent hover:border-interactive-hover"
      } ${locked ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <div className="flex h-32 p-3" style={{background:swatch[0],fontFamily:font}} aria-hidden="true">
        <div className="flex w-7 flex-col items-center gap-2 pt-2">{[0,1,2].map(i=><span key={i} className="h-3.5 w-3.5" style={{background:i===0?swatch[3]:swatch[2],borderRadius:radius||"50%"}}/>)}</div>
        <div className="w-20 p-2" style={{background:swatch[1],borderRadius:radius||"4px"}}><div className="mb-3 h-1.5 w-12 bg-white/40"/>{[0,1,2,3].map(i=><div key={i} className="my-2 h-1 w-10 bg-white/20"/>)}</div>
        <div className="min-w-0 flex-1 p-3" style={{background:swatch[2],borderRadius:radius||"4px"}}><div className="mb-4 h-1.5 w-16 bg-white/50"/>{[0,1].map(i=><div key={i} className="mb-3 flex gap-2"><span className="h-4 w-4 shrink-0" style={{background:swatch[3],borderRadius:radius||"50%"}}/><div className="flex-1"><div className="mb-1 h-1 w-8 bg-white/40"/><div className="h-1 w-full bg-white/20"/></div></div>)}<div className="mt-2 h-3" style={{background:swatch[1],borderRadius:radius||"3px"}}/></div>
      </div>
      <div className="bg-bg-secondary px-3 py-2">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
    </button>
  );
}
