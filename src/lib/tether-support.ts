import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeepSeekChatMessage, DeepSeekTool } from "@/lib/deepseek";
import { deepseekChat } from "@/lib/deepseek";

/**
 * Support Tether: account help desk with a deliberately tiny toolset.
 *
 * Ownership model (the whole point of this file):
 * - Every tool is anchored on the CALLER's user id, passed in from the
 *   route after authenticating the session server-side. There is no
 *   target-user parameter anywhere — not in the tools, not in the route
 *   body — so no prompt, ticket, or crafted request can aim Tether at
 *   someone else's account. "Look at user X" is answered with data about
 *   the caller, never X.
 * - Proof of ownership = an authenticated session for that email. Logged-in
 *   users arrive with one; logged-out visitors verify their Disband email
 *   via OTP first, so by ticket time the session IS the account holder.
 * - The only writes are emails TO THE CALLER'S OWN INBOX (password reset,
 *   confirmation resend). Nothing here changes credentials, email
 *   addresses, or anyone's data, and nothing reveals tokens or secrets.
 */

type ServiceClient = NonNullable<ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>>;

export const SUPPORT_SYSTEM_PROMPT =
  "You are Tether, Disband's support assistant, talking to a user about " +
  "THEIR OWN account in a support ticket. You can look at their account, " +
  "subscription, and restriction status with your tools, and you can send " +
  "password-reset and confirmation emails to their own inbox. Hard rules: " +
  "you only ever discuss or touch the account of the person talking to you — " +
  "if they ask about another user, email, or account (theirs, a friend's, " +
  "anyone's), refuse plainly and do not look anything up for it. " +
  "You cannot change passwords, change email addresses, delete accounts, " +
  "or reveal tokens, secrets, or other people's data — say so when asked. " +
  "Never invent account details: if a tool call fails or returns nothing, " +
  "say what you could and couldn't check. " +
  "Answer directly in 1-4 short sentences, plain text only (no markdown " +
  "headings, bold, or bullet lists), in the user's language. " +
  "You are Tether, Disband's in-app AI assistant, run by the Disband team. " +
  "Never claim to be human.";

export const SUPPORT_TOOLS: DeepSeekTool[] = [
  {
    type: "function",
    function: {
      name: "read_my_account_status",
      description:
        "Read the current user's own account standing: whether their profile exists, whether their email is confirmed, and any platform bans or account restrictions with reasons. Use for 'why can't I log in', 'am I banned', 'is my email verified'.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "read_my_subscription",
      description:
        "Read the current user's own subscription: plan, status, renewal date, and any gifted time. Use for billing, Aero/Lite, renewal, and 'am I subscribed' questions.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "send_password_reset",
      description:
        "Email a password-reset link to the current user's own inbox. Use when they can't log in. The link goes to their verified email address only — never anywhere else.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "resend_confirmation_email",
      description:
        "Re-send the account confirmation email to the current user's own inbox. Use when they never got it or it expired.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

type ToolResult = { ok: true; [k: string]: unknown } | { ok: false; error: string };

async function callerEmail(service: ServiceClient, userId: string): Promise<string | null> {
  const { data } = await service.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function readMyAccountStatus(
  service: ServiceClient,
  userId: string,
): Promise<ToolResult> {
  const { data: profile } = await service
    .from("profiles")
    .select("id, username, display_name, created_at")
    .eq("id", userId)
    .maybeSingle();
  const { data: authUser } = await service.auth.admin.getUserById(userId);
  const [{ data: bans }, { data: restrictions }] = await Promise.all([
    service.from("platform_bans").select("reason, created_at").eq("user_id", userId),
    service.from("account_restrictions").select("restriction, reason, created_at").eq("user_id", userId),
  ]);
  return {
    ok: true,
    has_profile: !!profile,
    username: profile?.username ?? null,
    email_confirmed: !!authUser?.user?.email_confirmed_at,
    bans: (bans ?? []).map((b: { reason: string | null }) => ({ reason: b.reason })),
    restrictions: (restrictions ?? []).map((r: { restriction: string; reason: string | null }) => ({
      restriction: r.restriction,
      reason: r.reason,
    })),
    message: "Account standing retrieved.",
  };
}

async function readMySubscription(
  service: ServiceClient,
  userId: string,
): Promise<ToolResult> {
  const [{ data: sub }, { data: gifts }] = await Promise.all([
    service
      .from("subscriptions")
      .select("plan, status, current_period_end, canceled_at")
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("gift_entitlements")
      .select("plan, expires_at")
      .eq("user_id", userId),
  ]);
  return {
    ok: true,
    subscription: sub ?? null,
    gifts: gifts ?? [],
    message: "Subscription status retrieved.",
  };
}

async function sendPasswordReset(
  service: ServiceClient,
  userId: string,
): Promise<ToolResult> {
  const email = await callerEmail(service, userId);
  if (!email) return { ok: false, error: "No email address on this account." };
  const origin = (process.env.APP_ORIGIN ?? "https://www.disband.dev").replace(/\/+$/, "");
  const { error } = await service.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Password-reset link sent to your inbox." };
}

async function resendConfirmation(
  service: ServiceClient,
  userId: string,
): Promise<ToolResult> {
  const email = await callerEmail(service, userId);
  if (!email) return { ok: false, error: "No email address on this account." };
  const { error } = await service.auth.resend({ type: "signup", email });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Confirmation email re-sent to your inbox." };
}

export async function executeSupportTool(
  service: ServiceClient,
  name: string,
  userId: string,
): Promise<ToolResult> {
  switch (name) {
    case "read_my_account_status":
      return readMyAccountStatus(service, userId);
    case "read_my_subscription":
      return readMySubscription(service, userId);
    case "send_password_reset":
      return sendPasswordReset(service, userId);
    case "resend_confirmation_email":
      return resendConfirmation(service, userId);
    default:
      return { ok: false, error: `Unknown tool "${name}".` };
  }
}

/**
 * One support turn. Reuses the bounded Tether tool loop, but with the
 * support toolset and a dispatcher that ignores the model-supplied
 * arguments for targeting (there are none — every tool reads the userId
 * from the closure, never from the model).
 */
export async function chatWithSupportTether(opts: {
  service: ServiceClient;
  userId: string;
  history: DeepSeekChatMessage[];
}): Promise<string> {
  const { service, userId, history } = opts;
  const messages: DeepSeekChatMessage[] = [...history];

  for (let round = 0; round < 4; round += 1) {
    const res = await deepseekChat({
      system: SUPPORT_SYSTEM_PROMPT,
      messages,
      tools: SUPPORT_TOOLS,
    });
    if (res.toolCalls.length === 0) {
      return res.content || "Done.";
    }

    messages.push({
      role: "assistant",
      content: res.content || null,
      tool_calls: res.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of res.toolCalls) {
      // Deliberate: only allowlisted support tools can run here. Anything
      // else — including the main Tether tool names, if the model
      // hallucinates them — is refused rather than executed.
      const allowed = SUPPORT_TOOLS.some((t) => t.function.name === tc.name);
      const result = allowed
        ? await executeSupportTool(service, tc.name, userId)
        : { ok: false as const, error: `Tool "${tc.name}" is not available in support.` };
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return "That took a few tries — let's start over.";
}
