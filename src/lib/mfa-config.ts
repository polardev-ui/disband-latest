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

  // rpId must be a registrable domain suffix of the effective domain — check that
  // the current hostname equals rpId or is a subdomain of it. Adding the current
  // origin to rpOrigins would make the check tautologically true and let callers
  // attempt WebAuthn from an incompatible origin, causing a browser SyntaxError.
  const originAllowed =
    typeof window === "undefined" ||
    window.location.hostname === rpId ||
    window.location.hostname.endsWith(`.${rpId}`);

  return { rpId, rpOrigins, originAllowed, appOrigin };
}
