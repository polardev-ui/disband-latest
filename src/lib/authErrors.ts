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

  if (lower.includes("same password")) {
    return "Choose a different password than your current one.";
  }

  if (lower.includes("password") && lower.includes("weak")) {
    return "Password is too weak. Use at least 6 characters.";
  }

  if (lower.includes("invalid totp") || lower.includes("invalid verification code")) {
    return "That authentication code is incorrect or expired. Try again.";
  }

  if (lower.includes("webauthn") || lower.includes("passkey")) {
    return "Passkey verification failed. Try again or use your authenticator app.";
  }

  if (lower.includes("factor") && lower.includes("already")) {
    return "That security method is already set up.";
  }

  return message;
}

export interface SignUpResult {
  error: string | null;
  needsEmailConfirmation?: boolean;
}
