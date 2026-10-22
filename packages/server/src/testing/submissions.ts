import type { NewSubmission } from '../features/submissions/submission-store.ts';

/**
 * A submission row for tests, sent with version 1 of the form (the seeded
 * fields `f_name`, `f_company`, `f_phone`, `f_category`, `f_message`).
 */
export const testSubmission = (
  id: string,
  overrides: Partial<NewSubmission> = {},
): NewSubmission => {
  const createdAt = overrides.createdAt ?? Date.now();
  return {
    id,
    createdAt,
    email: `${id}@example.org`,
    fields: { f_name: 'Taro', f_category: 'sales', f_message: 'Hello' },
    formVersion: 1,
    locale: null,
    status: 'new',
    spamScore: 0,
    spamReasons: [],
    ipHash: 'hash',
    userAgent: null,
    country: 'JP',
    pagePath: '/contact',
    consentAt: createdAt,
    ...overrides,
  };
};
