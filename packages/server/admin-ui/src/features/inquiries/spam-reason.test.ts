import { expect, test } from 'bun:test';
import {
  uiMessages,
  type UiMessageKey,
} from '../../shared/i18n/admin-messages.ts';
import { interpolate } from '../../shared/i18n/i18n-provider.tsx';
import { spamReasonText } from './spam-reason.ts';

const t = (key: UiMessageKey, params?: Record<string, string | number>) =>
  interpolate(uiMessages.ja[key], params);

test('explains every rule the server stores', () => {
  expect(spamReasonText(t, 'honeypot')).toBe(
    '人には見えないスパム対策欄に入力がありました。',
  );
  expect(spamReasonText(t, 'links:4')).toBe(
    '長文の項目にリンクが 4 件あります。',
  );
  expect(spamReasonText(t, 'link_in_field')).toContain('リンク');
  expect(spamReasonText(t, 'too_fast')).toContain('3 秒以内');
});

test('shows an unknown reason as it is stored', () => {
  expect(spamReasonText(t, 'new_rule')).toBe('new_rule');
  expect(spamReasonText(t, 'links:x')).toBe('links:x');
});
