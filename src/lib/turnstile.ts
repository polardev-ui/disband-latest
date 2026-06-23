/** Verify a Cloudflare Turnstile token server-side. Returns true when valid. */
export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Secret not configured — skip verification in dev so forms still work.
    console.warn("[turnstile] TURNSTILE_SECRET_KEY is not set; skipping server-side verification.");
    return true;
  }

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // Network errors should not block form submissions — fail open.
    return true;
  }
}
