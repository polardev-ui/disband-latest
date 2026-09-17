
export const PUBLIC_ENV = {
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mjqbrcabargylrimlafw.supabase.co",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcWJyY2FiYXJneWxyaW1sYWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDU2MzQsImV4cCI6MjA5NzU4MTYzNH0.wPZ49DaEv_NDyXovBwLcgyeoHxnvuSEa693zOmGMBbM",

  mediaApiUrl:
    process.env.NEXT_PUBLIC_MEDIA_API_URL ?? "https://cdn.disband.dev/v1",

  cdnUrl:
    process.env.NEXT_PUBLIC_CDN_URL ?? "https://cdn.disband.dev/v1",
  githubRepo:
    process.env.NEXT_PUBLIC_GITHUB_REPO ?? "polardev-ui/disband-latest",

  webAppUrl: !process.env.NEXT_PUBLIC_APP_URL ||
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(
      process.env.NEXT_PUBLIC_APP_URL,
    )
    ? "https://www.disband.dev"
    : process.env.NEXT_PUBLIC_APP_URL,

  turnstileSiteKey:
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAADpTEU6IzBC_YVIF",

  turnUrls: process.env.NEXT_PUBLIC_TURN_URLS ?? "",
  turnUsername: process.env.NEXT_PUBLIC_TURN_USERNAME ?? "",
  turnCredential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL ?? "",
} as const;
