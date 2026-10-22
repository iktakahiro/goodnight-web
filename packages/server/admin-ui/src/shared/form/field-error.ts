import type { Translate } from '../i18n/i18n-provider.tsx';

const issueCode = (issue: unknown): unknown =>
  typeof issue === 'object' && issue !== null && 'code' in issue
    ? issue.code
    : undefined;

/**
 * Turns a form field's validation errors (Standard Schema issues from a zod
 * schema, as TanStack Form stores them) into one message in the current
 * language. zod's own messages are English only, so they are not shown.
 *
 * @returns `null` when there is no error.
 */
export const fieldErrorMessage = (
  t: Translate,
  value: unknown,
  errors: readonly unknown[],
): string | null => {
  const issue = errors.find((error) => error !== undefined && error !== null);
  if (issue === undefined) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    return t('field.required');
  }
  return issueCode(issue) === 'too_big'
    ? t('field.too_long')
    : t('field.invalid');
};
