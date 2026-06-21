/** Maps Supabase Auth errors to user-friendly copy. */
export function mapAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("rate limit") ||
    lower.includes("over_email_send_rate_limit") ||
    lower.includes("email rate limit")
  ) {
    return "Too many verification emails were sent recently. Wait a few minutes, check your inbox (and spam), then try again — or use a custom SMTP provider in Supabase to raise limits.";
  }

  if (lower.includes("user already registered")) {
    return "An account with this email already exists. Try logging in instead.";
  }

  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }

  if (lower.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the Disband verification link.";
  }

  return message;
}

export interface SignUpResult {
  error: string | null;
  needsEmailConfirmation?: boolean;
}
