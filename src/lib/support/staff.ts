/**
 * Support-staff access is managed in the database (`profiles.is_support_staff`),
 * not hardcoded here. This keeps the allowlist editable without a code deploy.
 *
 * To grant/revoke access: UPDATE profiles SET is_support_staff = true/false WHERE id = '<user_id>';
 */

/**
 * Client-side check: reads from an already-loaded profile. Falls back to false.
 */
export function isSupportStaffFromProfile(profile: { is_support_staff?: boolean | null } | null | undefined): boolean {
  return profile?.is_support_staff === true;
}