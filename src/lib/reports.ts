/**
 * User-facing report vocabulary.
 *
 * The database and Sentinel use the same ids, so a label change never changes
 * what an existing report means. Keep the lists in sync with the check
 * constraint in `0146_message_reports.sql`.
 */

export type ReportTargetType = "message" | "profile";
export type ReportSurface = "channel" | "dm" | "group" | "profile";

export type ReportReason =
  | "harassment"
  | "hate_speech"
  | "sexual_content"
  | "violence_gore"
  | "illegal_content"
  | "spam"
  | "self_harm"
  | "impersonation"
  | "other";

export interface ReportReasonOption {
  id: ReportReason;
  label: string;
  description: string;
}

export const MESSAGE_REPORT_REASONS: ReportReasonOption[] = [
  {
    id: "harassment",
    label: "Harassment or bullying",
    description: "Targeted insults, threats, or repeated unwanted contact.",
  },
  {
    id: "hate_speech",
    label: "Hate speech",
    description: "Slurs or attacks against a protected group.",
  },
  {
    id: "sexual_content",
    label: "Sexual content",
    description: "Explicit nudity, pornography, or sexual imagery.",
  },
  {
    id: "violence_gore",
    label: "Violence or gore",
    description: "Graphic violence, serious injury, or animal cruelty.",
  },
  {
    id: "illegal_content",
    label: "Illegal content",
    description: "Content that may break the law, including sexual content involving minors.",
  },
  {
    id: "spam",
    label: "Spam or a scam",
    description: "Repeated advertising, phishing, or fraudulent links.",
  },
  {
    id: "self_harm",
    label: "Self-harm or suicide",
    description: "Content that encourages or depicts self-harm.",
  },
  {
    id: "other",
    label: "Something else",
    description: "Tell us what is wrong and we will take a look.",
  },
];

export const PROFILE_REPORT_REASONS: ReportReasonOption[] = [
  {
    id: "sexual_content",
    label: "Pornographic profile",
    description: "An avatar, banner, or bio that is sexually explicit.",
  },
  {
    id: "hate_speech",
    label: "Hate speech in a profile",
    description: "A name, bio, or image that attacks a protected group.",
  },
  {
    id: "harassment",
    label: "Harassment in a profile",
    description: "A profile used to target or intimidate someone.",
  },
  {
    id: "violence_gore",
    label: "Violence or gore",
    description: "Graphic violence or serious injury in a profile image.",
  },
  {
    id: "impersonation",
    label: "Impersonation",
    description: "Pretending to be another person, creator, or Disband staff.",
  },
  {
    id: "other",
    label: "Something else",
    description: "Tell us what is wrong and we will take a look.",
  },
];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Harassment or bullying",
  hate_speech: "Hate speech",
  sexual_content: "Sexual content",
  violence_gore: "Violence or gore",
  illegal_content: "Illegal content",
  spam: "Spam or a scam",
  self_harm: "Self-harm or suicide",
  impersonation: "Impersonation",
  other: "Something else",
};

export const MAX_REPORT_DETAILS = 1000;

export function reportReasonsFor(targetType: ReportTargetType): ReportReasonOption[] {
  return targetType === "profile" ? PROFILE_REPORT_REASONS : MESSAGE_REPORT_REASONS;
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && value in REPORT_REASON_LABELS;
}
