"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export const USER_NOTE_MAX = 256;

type NoteState = "loading" | "ready" | "saving" | "unavailable";

/**
 * Your private note about someone (migration 0119). RLS makes the author the
 * only reader, so the query needs no author filter of its own.
 *
 * "unavailable" covers a database that hasn't had 0119 applied yet: the
 * profile card hides the field instead of showing an error, because a missing
 * feature is not something the viewer can act on.
 */
export function useUserNote(authorId: string | null | undefined, subjectId: string | null | undefined) {
  const [note, setNote] = useState("");
  const [state, setState] = useState<NoteState>("loading");
  const saved = useRef("");

  useEffect(() => {
    setNote("");
    saved.current = "";
    if (!authorId || !subjectId || authorId === subjectId) {
      setState("unavailable");
      return;
    }
    let live = true;
    setState("loading");
    void getSupabaseClient()
      .from("user_notes")
      .select("note")
      .eq("subject_id", subjectId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          setState("unavailable");
          return;
        }
        const text = (data as { note?: string } | null)?.note ?? "";
        saved.current = text;
        setNote(text);
        setState("ready");
      });
    return () => {
      live = false;
    };
  }, [authorId, subjectId]);

  /** Persists the current text. An empty note deletes the row. */
  const save = useCallback(async () => {
    if (!authorId || !subjectId || state === "unavailable") return;
    const text = note.trim().slice(0, USER_NOTE_MAX);
    if (text === saved.current) return;
    setState("saving");
    const table = getSupabaseClient().from("user_notes");
    const { error } = text
      ? await table.upsert(
          { author_id: authorId, subject_id: subjectId, note: text, updated_at: new Date().toISOString() },
          { onConflict: "author_id,subject_id" },
        )
      : await table.delete().eq("author_id", authorId).eq("subject_id", subjectId);
    if (!error) saved.current = text;
    setState("ready");
  }, [authorId, subjectId, note, state]);

  return { note, setNote, save, state };
}
