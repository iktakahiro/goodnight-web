import { describe, expect, test } from 'bun:test';
import { buildSlackPayload, isSlackWebhookUrl } from './slack.ts';

const RECEIVED = Date.UTC(2026, 9, 22, 1, 2, 3, 456);

describe('buildSlackPayload', () => {
  test('has the count, a Slack date token, and the admin link only', () => {
    const payload = buildSlackPayload({
      locale: 'en',
      receivedAt: RECEIVED,
      adminUrl: 'https://example.com/admin/inquiries/01J',
    });
    expect(payload).toEqual({
      text: [
        '1 new inquiry',
        `Received: <!date^${Math.floor(RECEIVED / 1000)}^{date_short_pretty} {time}|2026-10-22T01:02:03Z>`,
        '<https://example.com/admin/inquiries/01J|Open the admin screen>',
      ].join('\n'),
    });
  });

  test('uses the locale', () => {
    const { text } = buildSlackPayload({
      locale: 'ja',
      receivedAt: RECEIVED,
      adminUrl: 'https://example.com/admin/inquiries/01J',
    });
    expect(text).toContain('新しいお問い合わせが 1 件あります');
    expect(text).toContain('受信日時: <!date^');
    expect(text).toContain('|管理画面を開く>');
  });

  test('takes no submission data at all', () => {
    // The function has no parameter for fields, email, or IP; a payload
    // built for any submission is the same apart from time and link.
    const a = buildSlackPayload({
      locale: 'en',
      receivedAt: RECEIVED,
      adminUrl: 'https://example.com/admin/inquiries/A',
    });
    const b = buildSlackPayload({
      locale: 'en',
      receivedAt: RECEIVED,
      adminUrl: 'https://example.com/admin/inquiries/B',
    });
    expect(a.text.replace('/A|', '/B|')).toBe(b.text);
  });
});

describe('isSlackWebhookUrl', () => {
  test('accepts only https://hooks.slack.com', () => {
    expect(isSlackWebhookUrl('https://hooks.slack.com/services/T/B/X')).toBe(
      true,
    );
    for (const url of [
      undefined,
      '',
      'http://hooks.slack.com/services/x',
      'https://hooks.slack.com.evil.example/x',
      'https://evil.example/hooks.slack.com',
      'not a url',
    ]) {
      expect(isSlackWebhookUrl(url)).toBe(false);
    }
  });
});
