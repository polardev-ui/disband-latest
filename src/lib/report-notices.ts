import "server-only";
import { sendBroadcast } from "@/lib/disband-official";
import { getServiceSupabase } from "@/lib/supabase/server";

/*
 What a reporter is told, from @disband in the app and by email. The EU
 Digital Services Act expects a confirmation that a report arrived and the
 decision once it's made, with how to contest it. Neither message says what
 happened to the reported person: that's their business, not the reporter's.
*/

const KIND_LABEL: Record<string, string> = {
  message: "a message",
  profile: "a profile",
  server: "a space",
};

export async function notifyReportReceived(reporterId: string, targetType: string): Promise<void> {
  try {
    await sendBroadcast({
      audience: "user",
      targetUserId: reporterId,
      kind: "service_notice",
      title: "We got your report",
      body:
        `Thanks for reporting ${KIND_LABEL[targetType] ?? "this"}. We'll review it against our rules ` +
        "and let you know here and by email once we've decided.",
      sendEmail: true,
    });
  } catch (err) {
    console.error("[report-notices] received", err);
  }
}

/**
 * Tell reporters about decided reports they haven't heard about yet. Each
 * report is claimed before anything is sent, so two runs can't double-send.
 */
export async function notifyDecidedReports(limit = 40): Promise<{ sent: number; failed: number }> {
  const service = getServiceSupabase();
  if (!service) throw new Error("Supabase service client is unavailable.");

  const { data: due, error } = await service
    .from("message_reports")
    .select("id, reporter_id, target_type, status")
    .in("status", ["actioned", "dismissed"])
    .not("reporter_id", "is", null)
    .is("reporter_notified_at", null)
    .order("reviewed_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  for (const row of (due ?? []) as { id: string; reporter_id: string; target_type: string; status: string }[]) {
    const { data: claimed } = await service
      .from("message_reports")
      .update({ reporter_notified_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("reporter_notified_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const what = KIND_LABEL[row.target_type] ?? "something";
    const actioned = row.status === "actioned";
    try {
      await sendBroadcast({
        audience: "user",
        targetUserId: row.reporter_id,
        kind: "service_notice",
        title: actioned ? "We acted on your report" : "We reviewed your report",
        body: actioned
          ? `We reviewed the report you made about ${what} and found it broke our rules, so we took action. ` +
            "Thanks for helping keep Disband safe."
          : `We reviewed the report you made about ${what} and didn't find a breach of our rules, so we haven't ` +
            "taken action. If you think we got this wrong, email legal@disband.dev with \"Report review\" in the " +
            "subject within six months and a person will look at it again.",
        sendEmail: true,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error("[report-notices] outcome", row.id, err);
      // Let the next run try again.
      await service.from("message_reports").update({ reporter_notified_at: null }).eq("id", row.id);
    }
  }
  return { sent, failed };
}
