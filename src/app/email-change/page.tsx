import { Suspense } from "react";
import { EmailChangeStatus } from "./status";

/**
 * Public status page for the email-change flow. The confirmation links in
 * the emails bounce through /api/account/email/confirm and land here with a
 * `state` param telling the user what happened.
 */
export default function EmailChangePage() {
  return (
    <Suspense>
      <EmailChangeStatus />
    </Suspense>
  );
}
