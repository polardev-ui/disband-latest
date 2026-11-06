import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getClientIp } from "@/lib/request-ip";
import { getRouteUser, getServiceSupabase } from "@/lib/supabase/server";
import { isSupportOnlyAccount } from "@/lib/support/support-only-account";

/*
 Wrong-email fix, opened by Tether in a support chat (6 Nov 2026).

 Someone signed up with a mistyped email, so the confirmation went nowhere
 and they can't log in (sign-in needs a confirmed email). To reach support
 they verified their REAL email with a one-time code, which made a
 support-only login (see isSupportOnlyAccount). That session is the caller.

 The fix moves the verified email onto their real account. Ownership is
 proved twice: the caller controls the new email (the code), and they know
 the account's password (checked against Supabase Auth, which only reports
 "email not confirmed" once the password is right). It only ever touches an
 account whose email was never confirmed and that has never signed in, so
 no working account can be taken over through this, and nothing is deleted:
 the support-only login just gets a placeholder email.
*/

const GENERIC = "That username and password don't match an account we can fix.";

export async function POST(req: Request) {
  const caller = await getRouteUser(req);
  if (!caller?.email) return NextResponse.json({ error: "Verify your email first." }, { status: 401 });

  const service = getServiceSupabase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!service || !url || !anonKey) return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "").toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || username.length > 64 || password.length > 200) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  // The caller must be the support-only sign-in, not a working account.
  if (!(await isSupportOnlyAccount(service, caller.id))) {
    return NextResponse.json(
      { error: "You're signed in to an account already. Change its email in Settings > My Account." },
      { status: 409 },
    );
  }
  const { data: callerAuth } = await service.auth.admin.getUserById(caller.id);
  const newEmail = callerAuth?.user?.email?.toLowerCase() ?? "";
  if (!newEmail || !callerAuth?.user?.email_confirmed_at) {
    return NextResponse.json({ error: "Verify your email first." }, { status: 401 });
  }

  const limit = async (key: string, max: number, seconds: number) =>
    !(await service.rpc("platform_rate_limit", { p_key: key, p_max: max, p_window_seconds: seconds })).error;
  const ip = getClientIp(req) || "unknown";
  if (!(await limit(`email-fix:s:${caller.id}`, 5, 3600)) || !(await limit(`email-fix:ip:${ip}`, 10, 3600))) {
    return NextResponse.json({ error: "Too many tries. Wait an hour and try again." }, { status: 429 });
  }

  const { data: target } = await service.from("profiles").select("id").eq("username", username).maybeSingle();
  if (!target || target.id === caller.id) return NextResponse.json({ error: GENERIC }, { status: 400 });
  if (!(await limit(`email-fix:t:${target.id}`, 5, 86400))) {
    return NextResponse.json({ error: "Too many tries. Wait a day and try again." }, { status: 429 });
  }

  const { data: targetAuth } = await service.auth.admin.getUserById(target.id);
  const account = targetAuth?.user;
  if (!account?.email) return NextResponse.json({ error: GENERIC }, { status: 400 });
  if (account.email_confirmed_at || account.last_sign_in_at) {
    return NextResponse.json(
      { error: "This account's email is already confirmed, so it can't be changed here. Log in and change it in Settings > My Account." },
      { status: 409 },
    );
  }

  // Password check. A right password on an unconfirmed account comes back as
  // email_not_confirmed; anything else is a wrong password.
  const probe = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signedIn, error: signInError } = await probe.auth.signInWithPassword({ email: account.email, password });
  if (signedIn?.session) {
    await probe.auth.signOut().catch(() => {});
    return NextResponse.json({ error: GENERIC }, { status: 400 });
  }
  if (signInError?.code !== "email_not_confirmed") return NextResponse.json({ error: GENERIC }, { status: 400 });

  // Free the verified email from the support session, then give it to the account.
  const placeholder = `released+${caller.id}@noreply.disband.dev`;
  const { error: releaseError } = await service.auth.admin.updateUserById(caller.id, { email: placeholder, email_confirm: true });
  if (releaseError) return NextResponse.json({ error: "Couldn't change the email. Try again." }, { status: 500 });

  const { error: moveError } = await service.auth.admin.updateUserById(target.id, { email: newEmail, email_confirm: true });
  if (moveError) {
    await service.auth.admin.updateUserById(caller.id, { email: newEmail, email_confirm: true });
    return NextResponse.json({ error: "Couldn't change the email. Try again." }, { status: 500 });
  }

  const now = new Date().toISOString();
  await service.from("email_change_requests").insert({
    user_id: target.id,
    new_email: newEmail,
    token_old: `fix:${caller.id}`,
    token_new: `fix:${crypto.randomUUID()}`,
    old_confirmed_at: now,
    completed_at: now,
    expires_at: now,
  });

  return NextResponse.json({ ok: true, email: newEmail });
}
