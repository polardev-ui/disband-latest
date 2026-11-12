import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A sign-up ticket for an account the server is about to make itself (a
 * bot, a webhook identity, Tether, Bruce).
 *
 * The database refuses any new account without a ticket (the
 * require_signup_ticket trigger, migration 0258). It also lets through
 * accounts marked app_metadata.created_by = "server", but Supabase's admin
 * API may write app_metadata after the row is inserted, when the trigger has
 * already looked. A ticket issued just before createUser works either way;
 * one left unused expires in five minutes and is cleared.
 */
export async function issueServerSignupTicket(service: SupabaseClient, email: string): Promise<void> {
  const { error } = await service.from("signup_tickets").upsert({
    email: email.trim().toLowerCase(),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) throw new Error(`Could not issue a sign-up ticket: ${error.message}`);
}
