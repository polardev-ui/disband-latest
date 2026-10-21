import { redirect } from "next/navigation";

/**
 * Compatibility shim for email-change links sent before the confirmation URL
 * pointed at the API route. Old links land on this page; forward them to the
 * server handler, which does the work and redirects to the status page.
 */
export default function EmailChangeConfirmPage({
  searchParams,
}: {
  searchParams: { token?: string; which?: string };
}) {
  const token = searchParams.token ?? "";
  const which = searchParams.which ?? "";
  redirect(`/api/account/email/confirm?token=${encodeURIComponent(token)}&which=${encodeURIComponent(which)}`);
}
