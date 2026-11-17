import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeepSeekChatMessage, DeepSeekTool } from "@/lib/deepseek";
import { deepseekChat } from "@/lib/deepseek";
import { EMAIL_FIX_FORM_MARKER, stripSupportMarkers } from "@/lib/support/markers";
import { isSupportOnlyAccount } from "@/lib/support/support-only-account";

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
 * - The one exception is the wrong-email fix, and Tether can't perform it:
 *   open_email_fix_form only shows the person a form. The change happens in
 *   /api/account/email/fix, which proves ownership itself (the account's
 *   password, plus the verified email of this session) and only touches an
 *   account whose email was never confirmed and that has never signed in.
 */



type ServiceClient = NonNullable<ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>>;

export type SupportSessionKind = "support_only" | "working_account";

const SUPPORT_PROMPT_BASE =
  "You are Tether, Disband's support assistant, talking to a user about " +
  "THEIR OWN account in a support ticket. You can look at their account, " +
  "subscription, and restriction status with your tools, and you can send " +
  "password-reset and confirmation emails to their own inbox.\n\n" +
  "How to write:\n" +
  "- Answer in 1-4 short sentences, plain text only (no markdown headings, bold, or bullet lists). Short numbered lines are okay for a step-by-step fix.\n" +
  "- First acknowledge the specific thing they just said, then give the next concrete step. If they restate the problem, treat it as confirmation and move forward. Never repeat an earlier reply word-for-word.\n" +
  "- Respect their constraints. If they say they cannot sign in, do not tell them to use a setting that requires signing in to that account.\n" +
  "- Ask at most one question per reply.\n" +
  "- Never mention tool names, failed tool calls, markers, or internal eligibility checks. Never claim you did something you did not do.\n" +
  "- Never invent account details. If a tool call fails or returns nothing, say what you could and could not check.\n\n" +
  "Ownership and privacy:\n" +
  "- You only ever discuss or touch the account of the person talking to you. If they ask about another user, email, or account, refuse plainly and do not look anything up for it.\n" +
  "- You never see or ask for their password in the chat. If they type one, tell them not to, and to use the secure form instead.\n" +
  "- You cannot change passwords, delete accounts, or reveal tokens, secrets, or other people's data — say so when asked.\n" +
  "- You are Tether, Disband's in-app AI assistant, run by the Disband team. Never claim to be human.\n\n" +
  "Wrong-email recovery:\n" +
  "- Someone may have signed up with a mistyped email, never received the confirmation, and be unable to sign in. The secure form moves an email they can access onto that account after they enter the mistyped account's username and password. The email they verified for this chat becomes the account's email.\n" +
  "- The form only works for an account whose email was never confirmed and that has never signed in.\n" +
  "- Do not tell someone who cannot sign in to change their email in Settings > My Account. Settings is only for people who can sign in to the account they want to change.\n" +
  "- Do not offer human review as the first answer to a wrong-email problem. Give the recovery path first, including the sign-out step when needed.\n" +
  "{{SESSION}}\n\n" +
  "Actions you cannot take:\n" +
  "- You cannot change Aero or billing subscriptions, cancel or refund plans, delete or change accounts, alter personal data, issue manual credits, or make external-system changes.\n" +
  "- When a request needs an action you cannot take, say what you checked and give any self-serve step that still applies. Then ask naturally whether they want it passed to a human reviewer. Only offer that when human help is genuinely needed, for example: \"I can’t do that directly, but I can send it up for human review—does that sound good?\"";

const SESSION_GUIDANCE: Record<SupportSessionKind, string> = {
  support_only:
    "THIS CHAT: they verified an email they can access just to reach support, so the wrong-email form is available. Your account tools and password-reset emails target this support-only login, NOT the mistyped account — do not describe the mistyped account's status from them or offer a reset for it. If they ask about a different account, say you can't see it from this chat; if they can access that account's email, they should sign out and start a new support chat by verifying it. When they want into that account, call open_email_fix_form so they can enter its username and password. Tell them the form is under your reply and that it will change the account's email to the one they verified here. If they do not know the username or password, help them work out which account they need first.",
  working_account:
    "THIS CHAT: they are signed in to a working Disband account, so the wrong-email form is not available here. Do not call open_email_fix_form. Your account tools read THIS working account; if they ask about a different account, say you can only see this one. If they need to fix a DIFFERENT account with a mistyped email, tell them to use the recovery link at the top of /support (it signs them out and starts verification). The steps are: 1) sign out of this account, 2) open /support, 3) verify an email they can access that is not already on another Disband account, 4) ask Tether again and fill in the form with the mistyped account's username and password. If the only email they can access is already on this working account, self-serve cannot work because one email cannot belong to two accounts; say that plainly and offer human review for the duplicate. If they want to change THIS account's email, they can do it in Settings > My Account.",
};

export function buildSupportSystemPrompt(kind: SupportSessionKind): string {
  return SUPPORT_PROMPT_BASE.replace("{{SESSION}}", SESSION_GUIDANCE[kind]);
}

/** The support-only variant, for callers that do not have a session context. */
export const SUPPORT_SYSTEM_PROMPT = buildSupportSystemPrompt("support_only");

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
      name: "open_email_fix_form",
      description:
        "Show the secure wrong-email form to someone who signed up with a mistyped email and can't log in. They fill it in themselves; you never handle their password.",
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

async function openEmailFixForm(service: ServiceClient, userId: string): Promise<ToolResult> {
  // The form is for someone who verified an email just to reach support,
  // not for a working account.
  if (!(await isSupportOnlyAccount(service, userId))) {
    return {
      ok: false,
      error:
        "This chat is signed in to a working account, so the wrong-email form cannot open here. Tell them to sign out, open /support, and verify an email they can access that is not already on another Disband account, then ask again. If their only email is already on this account, offer human review for the duplicate.",
    };
  }
  return { ok: true, message: "The form is now showing under your reply." };
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
    case "open_email_fix_form":
      return openEmailFixForm(service, userId);
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
  const messages: DeepSeekChatMessage[] = history.map((m) =>
    typeof m.content === "string" ? { ...m, content: stripSupportMarkers(m.content) } : m,
  );
  // Tell Tether which kind of session this is before it answers. This avoids
  // the old loop where it tried the wrong-email form on a working account,
  // relayed the failed check, and repeated itself. If the lookup itself
  // fails, keep the form-available guidance: open_email_fix_form re-checks
  // ownership, so a transient failure can't expose the form on its own.
  let sessionKind: SupportSessionKind = "support_only";
  try {
    sessionKind = (await isSupportOnlyAccount(service, userId)) ? "support_only" : "working_account";
  } catch {
    // Fall through with the safe default.
  }
  // On a working account the form cannot open. Removing the tool entirely is
  // stronger than asking the model not to call it: there is no failed check
  // for it to relay back to the user.
  const tools =
    sessionKind === "support_only"
      ? SUPPORT_TOOLS
      : SUPPORT_TOOLS.filter((tool) => tool.function.name !== "open_email_fix_form");
  let showEmailFixForm = false;
  const withForm = (text: string) => (showEmailFixForm ? `${text}\n\n${EMAIL_FIX_FORM_MARKER}` : text);

  for (let round = 0; round < 4; round += 1) {
    const res = await deepseekChat({
      system: buildSupportSystemPrompt(sessionKind),
      messages,
      tools,
    });
    if (res.toolCalls.length === 0) {
      return withForm(stripSupportMarkers(res.content || "Done."));
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
      const allowed = tools.some((t) => t.function.name === tc.name);
      let result: ToolResult;
      try {
        result = allowed
          ? await executeSupportTool(service, tc.name, userId)
          : { ok: false, error: `Tool "${tc.name}" is not available in support.` };
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : "The tool failed." };
      }
      if (tc.name === "open_email_fix_form" && result.ok) showEmailFixForm = true;
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  return withForm("That took a few tries — let's start over.");
}
