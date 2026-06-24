import { PUBLIC_ENV } from "@/lib/public-env";

export interface MfaWebAuthnConfig {
  rpId: string;
  rpOrigins: string[];
  /** True when the current page origin can use passkeys with the configured RP. */
  originAllowed: boolean;
  appOrigin: string;
}

/** WebAuthn RP settings — must match Supabase Auth → Passkeys / MFA WebAuthn. */
export function getMfaWebAuthnConfig(): MfaWebAuthnConfig {
  const appUrl = new URL(PUBLIC_ENV.webAppUrl);
  const rpId = appUrl.hostname;
  const appOrigin = appUrl.origin;
  const rpOrigins = [appOrigin];

  // rpId must be a registrable domain suffix of the effective domain.
  // Non-http(s) protocols (tauri:, asset:) are always incompatible with WebAuthn
  // regardless of hostname, so exclude them explicitly before the hostname check.
  const originAllowed =
    typeof window === "undefined" ||
    (window.location.protocol === "https:" &&
      (window.location.hostname === rpId ||
        window.location.hostname.endsWith(`.${rpId}`)));

  return { rpId, rpOrigins, originAllowed, appOrigin };
}
