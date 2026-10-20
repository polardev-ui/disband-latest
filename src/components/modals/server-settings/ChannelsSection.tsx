"use client";

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { ChannelType } from "@/lib/supabase/types";
import { IconEdit, IconHash, IconMegaphone, IconPlus, IconSettings, IconSpeaker, IconTrash } from "@/components/icons";
import { ConfirmDialog, EmptyState, InlineError, Segmented, btn, enterStyle, iconBtn, iconBtnDanger } from "./ui";
import type { SectionProps } from "./types";

type ChannelLite = { id: string; name: string; type: string; category_id?: string | null; read_only?: boolean };

export function ChannelsSection({ onEditChannel }: SectionProps & {
  onEditChannel?: (channel: { id: string; name: string; type: string }) => void;
}) {
  const { channels, categories, createChannel, renameChannel, deleteChannel } = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("text");
  const [categoryId, setCategoryId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<ChannelLite | null>(null);

  // Same rule as before: spaces become dashes, everything else (emoji too) stays.
  const slug = (v: string) => v.replace(/\s+/g, "-").slice(0, 100);

  async function create() {
    const clean = type === "text" ? slug(name.trim()) : name.trim().slice(0, 100);
    if (!clean) return;
    setCreating(true);
    setError(null);
    const err = await createChannel({ name: clean, type, categoryId: categoryId || null });
    setCreating(false);
    if (err) setError(err);
    else setName("");
  }

  async function commitRename(channel: ChannelLite) {
    const next = channel.type === "text" ? slug(renameValue.trim()) : renameValue.trim();
    setRenamingId(null);
    if (!next || next === channel.name) return;
    const err = await renameChannel(channel.id, next);
    if (err) setError(err);
  }

  const groups: { id: string | null; name: string; items: ChannelLite[] }[] = [
    ...categories.map((c) => ({ id: c.id, name: c.name, items: channels.filter((ch) => ch.category_id === c.id) })),
    { id: null, name: "No category", items: channels.filter((ch) => !ch.category_id) },
  ].filter((g) => g.items.length > 0);

  let row = 0;

  return (
    <div className="pb-10">
      {/* Create */}
      <section className="mb-8 overflow-hidden rounded-lg bg-bg-secondary">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <Segmented
            label="Channel type"
            value={type}
            onChange={setType}
            options={[
              { value: "text", label: <><IconHash size={14} /> Text</> },
              { value: "voice", label: <><IconSpeaker size={14} /> Voice</> },
            ]}
          />
          {categories.length > 0 && (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Category"
              className="h-9 rounded-[3px] border border-transparent bg-bg-tertiary px-2.5 text-[13.5px] text-text-normal outline-none focus:border-[#00a8fc]"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-2 border-t border-divider px-5 py-4">
          <label className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {type === "text" ? <IconHash size={15} /> : <IconSpeaker size={15} />}
            </span>
            <input
              value={name}
              onChange={(e) => setName(type === "text" ? slug(e.target.value) : e.target.value.slice(0, 100))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
              placeholder={type === "text" ? "new-channel" : "Lounge"}
              aria-label="New channel name"
              className="h-10 w-full rounded-[3px] border border-transparent bg-bg-tertiary pl-9 pr-3 text-[14px] text-text-normal outline-none placeholder:text-text-muted/70 focus:border-[#00a8fc]"
            />
          </label>
          <button type="button" onClick={() => void create()} disabled={creating || !name.trim()} className={`${btn.primary} h-10`}>
            <IconPlus size={15} /> {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </section>

      <InlineError>{error}</InlineError>

      {groups.length === 0 ? (
        <div className="rounded-lg bg-bg-secondary">
          <EmptyState icon={<IconHash size={20} />} title="No channels yet" body="Create the first one above." />
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.id ?? "none"} className="mb-6 last:mb-0">
            <h3 className="mb-2 px-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-muted">{group.name}</h3>
            <ul className="overflow-hidden rounded-lg bg-bg-secondary">
              {group.items.map((c) => {
                const index = row++;
                const Icon = c.type === "voice" ? IconSpeaker : c.read_only ? IconMegaphone : IconHash;
                return (
                  <li
                    key={c.id}
                    className="view-enter group flex h-[52px] items-center gap-3 border-b border-divider px-4 last:border-b-0 hover:bg-interactive-hover/40"
                    style={enterStyle(index)}
                  >
                    <Icon size={17} className="shrink-0 text-text-muted" />
                    {renamingId === c.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void commitRename(c)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename(c);
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setRenamingId(null);
                          }
                        }}
                        aria-label={`Rename ${c.name}`}
                        className="h-8 min-w-0 flex-1 rounded-[8px] border border-brand bg-bg-accent px-2.5 text-[14px] text-text-normal outline-none"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-normal">{c.name}</span>
                    )}
                    <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      {onEditChannel && (
                        <button type="button" onClick={() => onEditChannel(c)} className={iconBtn} aria-label={`Permissions for ${c.name}`} title="Permissions">
                          <IconSettings size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(c.id);
                          setRenameValue(c.name);
                        }}
                        className={iconBtn}
                        aria-label={`Rename ${c.name}`}
                        title="Rename"
                      >
                        <IconEdit size={16} />
                      </button>
                      <button type="button" onClick={() => setDeleting(c)} className={iconBtnDanger} aria-label={`Delete ${c.name}`} title="Delete">
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Delete ${deleting.type === "voice" ? "" : "#"}${deleting.name}?` : ""}
        body="Every message in it is removed for good. This can't be undone."
        confirmLabel="Delete channel"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const err = await deleteChannel(deleting.id);
          if (err) setError(err);
          setDeleting(null);
        }}
      />
    </div>
  );
}
