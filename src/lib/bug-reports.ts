/** Where bug reports are emailed. */
export const BUG_REPORT_EMAIL = "it@disband.dev";

export const BUG_REPORT_LIMITS = {
  titleMin: 3,
  titleMax: 120,
  descriptionMin: 10,
  descriptionMax: 4000,
  stepsMax: 6000,
  attachmentsMax: 6,
} as const;

export interface BugReportAttachment {
  url: string;
  name: string;
  type: string;
}

export interface BugReportInput {
  reporterName?: string | null;
  reporterEmail?: string | null;
  reporterUserId?: string | null;
  title: string;
  description: string;
  steps: string;
  attachments?: BugReportAttachment[];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Simple validation shared between the API route and (optionally) the client. */
export function validateBugReport(input: BugReportInput): string | null {
  const title = input.title?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  if (title.length < BUG_REPORT_LIMITS.titleMin || title.length > BUG_REPORT_LIMITS.titleMax) {
    return `Title must be between ${BUG_REPORT_LIMITS.titleMin} and ${BUG_REPORT_LIMITS.titleMax} characters.`;
  }
  if (description.length < BUG_REPORT_LIMITS.descriptionMin || description.length > BUG_REPORT_LIMITS.descriptionMax) {
    return `Describe the bug in at least ${BUG_REPORT_LIMITS.descriptionMin} characters.`;
  }
  if (input.steps && input.steps.length > BUG_REPORT_LIMITS.stepsMax) {
    return "Steps to reproduce are too long.";
  }
  const attachments = input.attachments ?? [];
  if (attachments.length > BUG_REPORT_LIMITS.attachmentsMax) {
    return `Attach at most ${BUG_REPORT_LIMITS.attachmentsMax} files.`;
  }
  for (const a of attachments) {
    if (!/^https:\/\//i.test(a.url)) {
      return "Attachment URLs must be https://.";
    }
  }
  return null;
}

/** Renders the staff-facing email sent to the bug inbox. */
export function buildBugReportEmailHtml(report: BugReportInput): string {
  const lines = report.description.split(/\r?\n/).map((line) => escapeHtml(line)).join("<br />");
  const steps = report.steps
    ? report.steps
        .split(/\r?\n/)
        .map((line) => escapeHtml(line.trim()))
        .filter(Boolean)
        .map((line) => `<li>${line}</li>`)
        .join("")
    : "";

  const attachments = (report.attachments ?? []).map(
    (a) =>
      `<li><a href="${escapeHtml(a.url)}">${escapeHtml(a.name || a.url)}</a> <span style="color:#72767d">(${escapeHtml(a.type || "file")})</span></li>`,
  ).join("");

  const reporter = report.reporterName
    ? `${escapeHtml(report.reporterName)}${report.reporterEmail ? ` &lt;${escapeHtml(report.reporterEmail)}&gt;` : ""}`
    : report.reporterEmail
      ? escapeHtml(report.reporterEmail)
      : "Anonymous";

  return `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#1e1f22;color:#dbdee1;padding:24px;max-width:640px">
  <h2 style="margin:0 0 4px;color:#fff">🐛 Bug Report: ${escapeHtml(report.title)}</h2>
  <p style="margin:0 0 20px;color:#949ba4;font-size:13px">Submitted ${new Date().toLocaleString()}</p>

  <div style="background:#2b2d31;border-radius:8px;padding:16px;margin-bottom:16px">
    <p style="margin:0 0 8px;color:#b5bac1;font-size:13px"><strong>Reporter</strong></p>
    <p style="margin:0;color:#fff">${reporter}${report.reporterUserId ? `<br/><span style="color:#72767d;font-size:12px">user id: ${escapeHtml(report.reporterUserId)}</span>` : ""}</p>
  </div>

  <div style="background:#2b2d31;border-radius:8px;padding:16px;margin-bottom:16px">
    <p style="margin:0 0 8px;color:#b5bac1;font-size:13px"><strong>What's the bug?</strong></p>
    <p style="margin:0;color:#fff;line-height:1.5">${lines}</p>
  </div>

  ${steps ? `
  <div style="background:#2b2d31;border-radius:8px;padding:16px;margin-bottom:16px">
    <p style="margin:0 0 8px;color:#b5bac1;font-size:13px"><strong>How to reproduce</strong></p>
    <ol style="margin:0;padding-left:20px;color:#fff;line-height:1.6">${steps}</ol>
  </div>` : ""}

  ${attachments ? `
  <div style="background:#2b2d31;border-radius:8px;padding:16px;margin-bottom:16px">
    <p style="margin:0 0 8px;color:#b5bac1;font-size:13px"><strong>Proof (${attachments.length})</strong></p>
    <ul style="margin:0;padding-left:20px;color:#fff;line-height:1.6">${attachments}</ul>
  </div>` : ""}

  <p style="color:#72767d;font-size:12px">Reply to the reporter's email or resolve via the database
  (<code>resolve_bug_report</code>) to grant the Bug Bounty Hunter badge.</p>
</div>`;
}
