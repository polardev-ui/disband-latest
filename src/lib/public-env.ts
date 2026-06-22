/**
 * Production defaults for NEXT_PUBLIC_* vars.
 * These are client-visible (same as the hosted web app) and are inlined at build time
 * so Tauri desktop builds work without a local `.env.local`.
 */
export const PUBLIC_ENV = {
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mjqbrcabargylrimlafw.supabase.co",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcWJyY2FiYXJneWxyaW1sYWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMDU2MzQsImV4cCI6MjA5NzU4MTYzNH0.wPZ49DaEv_NDyXovBwLcgyeoHxnvuSEa693zOmGMBbM",
  mediaApiUrl:
    process.env.NEXT_PUBLIC_MEDIA_API_URL ?? "https://api.wsgpolar.me/v1",
  githubRepo:
    process.env.NEXT_PUBLIC_GITHUB_REPO ?? "polardev-ui/disband-latest",
} as const;
