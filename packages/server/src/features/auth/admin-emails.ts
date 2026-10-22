/** Parses `ADMIN_EMAILS` into trimmed, lowercased addresses. */
export const parseAdminEmails = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

/** Returns whether `email` is listed in `ADMIN_EMAILS` (case-insensitive). */
export const isAdminEmail = (
  adminEmails: string | undefined,
  email: string,
): boolean =>
  parseAdminEmails(adminEmails).includes(email.trim().toLowerCase());
