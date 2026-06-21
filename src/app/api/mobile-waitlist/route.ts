import { NextResponse } from "next/server";
import { addMobileWaitlistContact, getMobileWaitlistSegmentId } from "@/lib/resend";
import { getServiceSupabase } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Waitlist is not configured yet. Try again later." },
      { status: 503 },
    );
  }

  if (!process.env.RESEND_API_KEY || !getMobileWaitlistSegmentId()) {
    return NextResponse.json(
      { error: "Waitlist is not configured yet. Try again later." },
      { status: 503 },
    );
  }

  let resendContactId: string | null = null;
  try {
    const contact = await addMobileWaitlistContact(email);
    resendContactId = contact?.id ?? null;
  } catch (err) {
    console.error("[mobile-waitlist] Resend error:", err);
    return NextResponse.json(
      { error: "Could not subscribe right now. Please try again in a moment." },
      { status: 502 },
    );
  }

  const { error } = await supabase.from("mobile_waitlist").upsert(
    {
      email,
      resend_contact_id: resendContactId,
    },
    { onConflict: "email", ignoreDuplicates: false },
  );

  if (error) {
    // Duplicate email is fine — user already subscribed
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, message: "You are already on the waitlist." });
    }
    console.error("[mobile-waitlist] Supabase error:", error);
    return NextResponse.json({ error: "Could not save your signup." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "You are on the list! We will email you when Disband is ready for mobile.",
  });
}
