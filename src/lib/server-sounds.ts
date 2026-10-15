import { getSupabaseClient } from "@/lib/supabase/client";
import type { ServerSound } from "@/lib/supabase/types";

export const SOUND_NAME_ALLOWED = /^\S[\s\S]{0,31}$/;
export const SOUND_EMOJI_ALLOWED = /^\S[\s\S]{0,8}$/;

export async function fetchServerSounds(serverId: string): Promise<ServerSound[]> {
  if (!serverId) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("server_sounds")
    .select("*")
    .eq("server_id", serverId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as ServerSound[];
}

export async function listAllUserServerSounds(
  serverIds: string[],
): Promise<Array<ServerSound & { serverName?: string }>> {
  if (!serverIds.length) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("server_sounds")
    .select("*")
    .in("server_id", serverIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as ServerSound[];
}

export async function uploadServerSound({
  file,
  name,
  emoji,
  serverId,
  userId,
  currentCount,
}: {
  file: File;
  name: string;
  emoji: string;
  serverId: string;
  userId: string;
  currentCount: number;
}): Promise<ServerSound | null> {
  const cleanName = name.trim();
  const cleanEmoji = emoji.trim();
  if (!cleanName || !cleanEmoji) return null;
  if (currentCount >= 15) return null;
  if (file.size > 10 * 1024 * 1024) return null;

  const supabase = getSupabaseClient();
  const ext = (file.name.match(/\.([a-zA-Z0-9]{1,8})$/) ?? [])[1] || "mp3";
  const safeExt = ext.toLowerCase();
  const path = `${serverId}/${userId}-${Date.now()}.${safeExt}`;
  const upload = await supabase.storage.from("server-sounds").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "audio/mpeg",
    upsert: false,
  });
  if (upload.error) return null;

  const {
    data: { publicUrl },
  } = supabase.storage.from("server-sounds").getPublicUrl(path);

  const insert = await supabase
    .from("server_sounds")
    .insert({
      server_id: serverId,
      name: cleanName,
      emoji: cleanEmoji,
      url: publicUrl,
      uploader_id: userId,
    })
    .select("*")
    .single();
  if (insert.error || !insert.data) return null;
  return insert.data as ServerSound;
}

export async function deleteServerSound(sound: ServerSound) {
  const supabase = getSupabaseClient();
  await supabase.from("server_sounds").delete().eq("id", sound.id);
}

export async function fetchFavoriteSoundIds(userId: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("favorite_server_sounds")
    .select("sound_id")
    .eq("user_id", userId);
  if (error || !data) return new Set();
  return new Set(data.map((row) => row.sound_id));
}

export async function setFavoriteSound(
  userId: string,
  soundId: string,
  favorite: boolean,
): Promise<boolean> {
  if (!userId || !soundId) return false;
  const supabase = getSupabaseClient();
  if (favorite) {
    const { error } = await supabase
      .from("favorite_server_sounds")
      .upsert({ user_id: userId, sound_id: soundId }, { onConflict: "user_id,sound_id" });
    return !error;
  }
  const { error } = await supabase
    .from("favorite_server_sounds")
    .delete()
    .eq("user_id", userId)
    .eq("sound_id", soundId);
  return !error;
}
