import "server-only";

type ServiceClient = NonNullable<ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>>;

/**
 * Is this login only a support-page sign-in, not someone's real account?
 *
 * Signing in to Support with a one-time code makes an auth user (and, via the
 * signup trigger, a placeholder profile) for that email. The wrong-email fix
 * gives that email to the person's real account, so it must never treat a
 * working account as a throwaway. A support-only login was never set up or
 * used: no chosen username (sign-up always sends one), no spaces, no
 * messages. New ones also carry support_only metadata, as a label for staff.
 */
export async function isSupportOnlyAccount(service: ServiceClient, userId: string): Promise<boolean> {
  const { data } = await service.auth.admin.getUserById(userId);
  const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.username === "string" && meta.username.trim()) return false;
  const [{ count: spaces }, { count: messages }] = await Promise.all([
    service.from("server_members").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    service.from("messages").select("id", { count: "exact", head: true }).eq("author_id", userId),
  ]);
  if ((spaces ?? 1) > 0 || (messages ?? 1) > 0) return false;
  return true;
}
