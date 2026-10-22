import { expect, test } from 'bun:test';
import { setupInputSchema } from '../../../../src/features/setup/setup-schema.ts';
import { uiMessages } from '../i18n/admin-messages.ts';
import { interpolate, type Translate } from '../i18n/i18n-provider.tsx';
import { fieldErrorMessage } from './field-error.ts';

const ja: Translate = (key, params) => interpolate(uiMessages.ja[key], params);

const issuesFor = (field: 'token' | 'email', value: string) => {
  const input = { token: 'x', email: 'a@example.com', [field]: value };
  const result = setupInputSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.filter((issue) => issue.path[0] === field);
};

test('no errors, no message', () => {
  expect(fieldErrorMessage(ja, 'x', [])).toBeNull();
  expect(fieldErrorMessage(ja, 'x', [undefined])).toBeNull();
});

test('an empty field is required, in the current language', () => {
  expect(fieldErrorMessage(ja, '', issuesFor('token', ''))).toBe(
    '入力してください。',
  );
  expect(fieldErrorMessage(ja, '  ', issuesFor('email', '  '))).toBe(
    '入力してください。',
  );
});

test('a wrong value is invalid; a long one is too long', () => {
  expect(fieldErrorMessage(ja, 'nope', issuesFor('email', 'nope'))).toBe(
    '入力内容を確認してください。',
  );
  const long = 'x'.repeat(513);
  expect(fieldErrorMessage(ja, long, issuesFor('token', long))).toBe(
    '長すぎます。',
  );
});
