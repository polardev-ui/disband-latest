import { PUBLIC_ENV } from "@/lib/public-env";

export interface MfaWebAuthnConfig {
  rpId: string;
  rpOrigins: string[];

  originAllowed: boolean;
  appOrigin: string;
}

export function getMfaWebAuthnConfig(): MfaWebAuthnConfig {
  const appUrl = new URL(PUBLIC_ENV.webAppUrl);
  const rpId = appUrl.hostname;
  const appOrigin = appUrl.origin;
  const rpOrigins = [appOrigin];

  const originAllowed =
    typeof window === "undefined" ||
    (window.location.protocol === "https:" &&
      (window.location.hostname === rpId ||
        window.location.hostname.endsWith(`.${rpId}`)));

  return { rpId, rpOrigins, originAllowed, appOrigin };
}
