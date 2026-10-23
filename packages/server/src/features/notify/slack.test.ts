import { describe, expect, test } from 'bun:test';
import {
  buildSlackPayload,
  isInvalidSlackWebhookUrl,
  isSlackWebhookUrl,
  SLACK_PAGE_PATH_MAX,
  SLACK_SITE_NAME_MAX,
  type SlackPayload,
  type SlackText,
} from './slack.ts';

const RECEIVED = Date.UTC(2026, 9, 22, 1, 2, 3, 456);
const SECONDS = Math.floor(RECEIVED / 1000);
const ADMIN_URL = 'https://example.com/admin/inquiries/01J';

const build = (overrides: Partial<Parameters<typeof buildSlackPayload>[0]>) =>
  buildSlackPayload({
    locale: 'en',
    receivedAt: RECEIVED,
    adminUrl: ADMIN_URL,
    siteName: 'example.com',
    pagePath: '/contact',
    ...overrides,
  });

/**
 * Checks the payload against the Block Kit limits Slack enforces. Slack
 * answers 400 `invalid_blocks` when one is broken. Returns the problems.
 */
const blockKitProblems = (payload: SlackPayload): string[] => {
  const problems: string[] = [];
  const textObject = (where: string, value: SlackText, max: number) => {
    if (value.type !== 'plain_text' && value.type !== 'mrkdwn')
      problems.push(`${where}: unknown text type`);
    if (value.text.trim() === '') problems.push(`${where}: empty text`);
    if (value.text.length > max) problems.push(`${where}: over ${max}`);
  };
  if (payload.text.trim() === '') problems.push('text: empty');
  if (payload.text.length > 40_000) problems.push('text: over 40000');
  if (payload.blocks.length === 0 || payload.blocks.length > 50)
    problems.push('blocks: count');
  payload.blocks.forEach((block, index) => {
    const where = `blocks[${index}] ${block.type}`;
    switch (block.type) {
      case 'header':
        if (block.text.type !== 'plain_text')
          problems.push(`${where}: not plain_text`);
        textObject(where, block.text, 150);
        break;
      case 'section':
        if (!('text' in block) && !block.fields)
          problems.push(`${where}: no text or fields`);
        if ('text' in block) textObject(`${where} text`, block.text, 3000);
        if (block.fields) {
          if (block.fields.length === 0 || block.fields.length > 10)
            problems.push(`${where}: field count`);
          block.fields.forEach((field, i) =>
            textObject(`${where} fields[${i}]`, field, 2000),
          );
        }
        break;
      case 'context':
        if (block.elements.length === 0 || block.elements.length > 10)
          problems.push(`${where}: element count`);
        block.elements.forEach((element, i) =>
          textObject(`${where} elements[${i}]`, element, 2000),
        );
        break;
      case 'actions':
        if (block.elements.length === 0 || block.elements.length > 25)
          problems.push(`${where}: element count`);
        block.elements.forEach((button, i) => {
          if (button.type !== 'button') problems.push(`${where}: not a button`);
          if (button.text.type !== 'plain_text')
            problems.push(`${where} button: not plain_text`);
          textObject(`${where} elements[${i}]`, button.text, 75);
          if (!/^https?:\/\//.test(button.url) || button.url.length > 3000)
            problems.push(`${where} button: bad url`);
        });
        break;
      default:
        problems.push(`blocks[${index}]: unknown type`);
    }
  });
  return problems;
};

/** Every string in the payload, so a test can look for a value anywhere. */
const allText = (payload: SlackPayload): string => JSON.stringify(payload);

const fieldsOf = (payload: SlackPayload): SlackText[] => {
  const block = payload.blocks.find(
    (b) => b.type === 'section' && 'fields' in b && b.fields,
  );
  return block?.type === 'section' ? (block.fields ?? []) : [];
};

const bodyOf = (payload: SlackPayload): string => {
  const block = payload.blocks.find((b) => b.type === 'section' && 'text' in b);
  return block?.type === 'section' && 'text' in block ? block.text.text : '';
};

describe('buildSlackPayload', () => {
  test('builds the English message', () => {
    expect(build({})).toEqual({
      text: 'A new inquiry arrived on example.com.',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🌙 New inquiry',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'A new inquiry arrived on *example.com*.',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Received*\n<!date^${SECONDS}^{date_num} {time}|2026-10-22 01:02 UTC>`,
            },
            { type: 'mrkdwn', text: '*Page*\n`/contact`' },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'This notification does not include personal data or anything typed into the form.',
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Open in admin', emoji: true },
              url: ADMIN_URL,
              style: 'primary',
            },
          ],
        },
      ],
    });
  });

  test('builds the Japanese message with the same blocks', () => {
    const payload = build({ locale: 'ja', siteName: 'goodnight-web.dev' });
    expect(payload.text).toBe(
      'goodnight-web.dev に新しいお問い合わせが届きました。',
    );
    expect(payload.blocks.map((b) => b.type)).toEqual([
      'header',
      'section',
      'section',
      'context',
      'actions',
    ]);
    const json = allText(payload);
    expect(json).toContain('"🌙 新しいお問い合わせ"');
    expect(bodyOf(payload)).toStartWith(
      '*goodnight-web.dev* に新しいお問い合わせが届きました。',
    );
    expect(fieldsOf(payload).map((f) => f.text.split('\n')[0])).toEqual([
      '*受信日時*',
      '*ページ*',
    ]);
    expect(json).toContain('個人情報');
    expect(json).toContain('"管理画面で開く"');
  });

  test('both locales pass the Block Kit checks', () => {
    for (const locale of ['ja', 'en'] as const) {
      expect(blockKitProblems(build({ locale }))).toEqual([]);
      expect(blockKitProblems(build({ locale, pagePath: null }))).toEqual([]);
    }
  });

  test('the time is a language-neutral date token with a UTC fallback', () => {
    const [received] = fieldsOf(build({}));
    expect(received?.text).toMatch(
      /^\*Received\*\n<!date\^\d+\^\{date_num\} \{time\}\|\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC>$/,
    );
    expect(allText(build({}))).not.toContain('date_short_pretty');
  });

  test('the page drops its query and fragment', () => {
    for (const pagePath of [
      '/contact?email=a@example.org#top',
      '/contact#x?y',
      '/contact?',
    ]) {
      expect(fieldsOf(build({ pagePath }))[1]?.text).toBe('*Page*\n`/contact`');
      expect(allText(build({ pagePath }))).not.toContain('example.org');
    }
  });

  test('without a page, the field is left out instead of empty', () => {
    for (const pagePath of [undefined, null, '', '?q=1']) {
      const fields = fieldsOf(build({ pagePath }));
      expect(fields).toHaveLength(1);
      expect(fields[0]?.text).toStartWith('*Received*');
    }
  });

  test('the site name and page cannot format, link, or mention', () => {
    const payload = build({
      siteName: 'Acme & <Co> *x* _y_ ~z~ `c` <!channel> <@U123>',
      pagePath: '/a*b_c~d`e<f>&g',
    });
    const body = bodyOf(payload);
    expect(body).toStartWith(
      'A new inquiry arrived on *Acme &amp; &lt;Co&gt; ＊x＊ ＿y＿ ～z～ ｀c｀ &lt;!channel&gt; &lt;@U123&gt;*.',
    );
    expect(payload.text).toBe(
      'A new inquiry arrived on Acme &amp; &lt;Co&gt; ＊x＊ ＿y＿ ～z～ ｀c｀ &lt;!channel&gt; &lt;@U123&gt;.',
    );
    // Inside a code span only a backtick could end the span.
    expect(fieldsOf(payload)[1]?.text).toBe(
      '*Page*\n`/a*b_c~d｀e&lt;f&gt;&amp;g`',
    );
    const json = allText(payload);
    expect(json).not.toContain('<!channel>');
    expect(json).not.toContain('<@U123>');
    // The only `<` left are the date token's.
    expect(json.match(/</g)).toHaveLength(1);
    expect(blockKitProblems(payload)).toEqual([]);
  });

  test('control characters in the site name and page do not break lines', () => {
    const payload = build({
      siteName: 'My\nCompany\t',
      pagePath: '/con\ntact',
    });
    expect(payload.text).toBe('A new inquiry arrived on My Company.');
    expect(fieldsOf(payload)[1]?.text).toBe('*Page*\n`/contact`');
  });

  test('long values are cut with an ellipsis without splitting emoji', () => {
    const siteName = '🌙'.repeat(SLACK_SITE_NAME_MAX + 20);
    const pagePath = `/${'𠮷'.repeat(SLACK_PAGE_PATH_MAX + 20)}`;
    const payload = build({ siteName, pagePath });
    const shownSite = payload.text.replace('A new inquiry arrived on ', '');
    expect(Array.from(shownSite.slice(0, -1))).toHaveLength(
      SLACK_SITE_NAME_MAX,
    );
    expect(shownSite).toEndWith('….');
    expect(shownSite).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    const shownPath = fieldsOf(payload)[1]?.text.split('\n')[1] ?? '';
    expect(Array.from(shownPath.slice(1, -1))).toHaveLength(
      SLACK_PAGE_PATH_MAX,
    );
    expect(shownPath).toEndWith('…`');
    expect(shownPath).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(blockKitProblems(payload)).toEqual([]);
  });

  test('the worst-case values stay within the Block Kit limits', () => {
    // `&` grows to five characters when escaped.
    const payload = build({
      siteName: '&'.repeat(1000),
      pagePath: `/${'&'.repeat(1000)}`,
    });
    expect(blockKitProblems(payload)).toEqual([]);
  });

  test('takes no submission data at all', () => {
    // The function has no parameter for fields, email, or IP; a payload for
    // any submission is the same apart from time, link, site, and page.
    const a = build({ adminUrl: 'https://example.com/admin/inquiries/A' });
    const b = build({ adminUrl: 'https://example.com/admin/inquiries/B' });
    expect(allText(a).replace('/A"', '/B"')).toBe(allText(b));
  });
});

describe('isSlackWebhookUrl', () => {
  test('accepts the incoming webhook form', () => {
    for (const url of [
      'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX',
      // Built at run time so that secret scanners do not flag a sample.
      `https://hooks.slack.com/services/T00000000/B00000000/${'X'.repeat(24)}`,
      'https://hooks.slack.com/services/T0/B0/x',
      `https://hooks.slack.com/services/T${'A'.repeat(63)}/B${'1'.repeat(63)}/${'aZ9'.repeat(21)}a`,
      // Whitespace around a pasted secret is ignored.
      ' https://hooks.slack.com/services/T0001/B0001/abc123\n',
    ]) {
      expect(isSlackWebhookUrl(url)).toBe(true);
    }
  });

  test('rejects anything else', () => {
    const ok = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX';
    for (const url of [
      undefined,
      '',
      '   ',
      'not a url',
      ok.replace('https:', 'http:'),
      ok.replace('hooks.slack.com', 'hooks.slack.com.evil.example'),
      ok.replace('hooks.slack.com', 'evil.example'),
      ok.replace('hooks.slack.com', 'HOOKS.slack.com'),
      ok.replace('hooks.slack.com', 'slack.com'),
      ok.replace('hooks.slack.com', 'hooks.slack.com:443'),
      ok.replace('hooks.slack.com', 'hooks.slack.com:8443'),
      ok.replace('hooks.slack.com', 'user:pass@hooks.slack.com'),
      ok.replace('hooks.slack.com', 'evil.example@hooks.slack.com'),
      'https://evil.example/hooks.slack.com/services/T0/B0/X',
      // A trailing slash is rejected: Slack's URLs have none.
      `${ok}/`,
      `${ok}/extra`,
      `${ok}?x=1`,
      `${ok}?`,
      `${ok}#x`,
      `${ok} x`,
      `${ok}%20`,
      'https://hooks.slack.com/services/T00000000/B00000000',
      'https://hooks.slack.com/services/T00000000/B00000000/',
      'https://hooks.slack.com/services/T00000000//XXXXXXXX',
      'https://hooks.slack.com/services/T/B/X',
      'https://hooks.slack.com/services/B00000000/T00000000/XXXXXXXX',
      'https://hooks.slack.com/services/t00000000/B00000000/XXXXXXXX',
      'https://hooks.slack.com/services/T0000000a/B00000000/XXXXXXXX',
      'https://hooks.slack.com/services/T00000000/B00000000/XXXX-XXXX',
      'https://hooks.slack.com/services/T00000000/B00000000/XXXX_XXXX',
      'https://hooks.slack.com/workflows/T00000000/A00000000/1/x',
      'https://hooks.slack.com/Services/T00000000/B00000000/XXXXXXXX',
      'https://hooks.slack.com/services/T00000000/B00000000/../XXXXXXXX',
      `https://hooks.slack.com/services/T${'0'.repeat(64)}/B0/X`,
      `https://hooks.slack.com/services/T0/B${'0'.repeat(64)}/X`,
      `https://hooks.slack.com/services/T0/B0/${'X'.repeat(65)}`,
    ]) {
      expect(isSlackWebhookUrl(url)).toBe(false);
    }
  });
});

describe('isInvalidSlackWebhookUrl', () => {
  test('is true only for a value that is set and not a webhook URL', () => {
    expect(isInvalidSlackWebhookUrl(undefined)).toBe(false);
    expect(isInvalidSlackWebhookUrl('')).toBe(false);
    expect(isInvalidSlackWebhookUrl('  ')).toBe(false);
    expect(
      isInvalidSlackWebhookUrl(
        'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX',
      ),
    ).toBe(false);
    expect(isInvalidSlackWebhookUrl('https://hooks.slack.com/services/')).toBe(
      true,
    );
    expect(isInvalidSlackWebhookUrl('https://example.com/hook')).toBe(true);
  });
});
