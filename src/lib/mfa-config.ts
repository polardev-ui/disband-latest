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

  if (typeof window !== "undefined") {
    const current = window.location.origin;
    if (current !== appOrigin) {
      rpOrigins.push(current);
    }
  }

  const originAllowed =
    typeof window === "undefined" ||
    window.location.hostname === rpId ||
    rpOrigins.includes(window.location.origin);

  return { rpId, rpOrigins, originAllowed, appOrigin };
}
