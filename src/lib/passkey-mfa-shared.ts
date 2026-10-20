/**
 * The hidden TOTP factor that bridges a passkey session to AAL2.
 *
 * Supabase hosted projects support passkey sign-in but not WebAuthn MFA
 * factors. The server keeps the secret for this factor and only uses it after
 * both the password session and the passkey session have been verified, so the
 * factor itself is never shown in the settings or challenge lists.
 */
export const HIDDEN_PASSKEY_TOTP_NAME = "Disband passkey (system)";

export interface PasskeyMfaStatus {
  serverReady: boolean;
  secretConfigured: boolean;
  passkeyCount: number;
  ready: boolean;
}

export interface PasskeySummary {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
}
