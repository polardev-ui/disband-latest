export const SUPPORT_STAFF_USER_IDS = [
  "18c3ef6d-7540-43ec-a826-0bed8d83beb7",
  "cbcbf98b-aa53-44cf-a2b0-1c551a8267c7",
  "9970924c-9497-465e-9fbf-8699f3dc3ed0",
];

export function isSupportStaff(userId: string): boolean {
  return SUPPORT_STAFF_USER_IDS.includes(userId);
}
