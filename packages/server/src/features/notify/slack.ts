import type { D1Database } from '@cloudflare/workers-types';
import { translate, type Locale } from '../../shared/messages.ts';
import { markNotified } from '../submissions/submission-store.ts';

/**
 * The form of a Slack incoming webhook URL:
 * `https://hooks.slack.com/services/T…/B…/…`. The workspace (`T…`) and
 * channel (`B…`) IDs are upper-case letters and digits, the last segment is
 * letters and digits, and each segment is at most 64 characters. Nothing may
 * follow: no trailing slash, query, or fragment. Credentials and a port
 * cannot match.
 */
const SLACK_WEBHOOK_URL_PATTERN =
  /^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{1,63}\/B[A-Z0-9]{1,63}\/[A-Za-z0-9]{1,64}$/;

/**
 * Returns whether `url` has the form of a Slack incoming webhook URL
 * (`https://hooks.slack.com/services/T…/B…/…`). Whitespace around the value
 * is ignored. Other URLs are never called.
 */
export const isSlackWebhookUrl = (url: string | undefined): url is string =>
  url !== undefined && SLACK_WEBHOOK_URL_PATTERN.test(url.trim());

/**
 * Returns whether `url` is set to something other than a Slack incoming
 * webhook URL, so the admin screen can say so without showing the value.
 * An unset or blank value is not invalid: Slack is optional.
 */
export const isInvalidSlackWebhookUrl = (url: string | undefined): boolean =>
  url !== undefined && url.trim() !== '' && !isSlackWebhookUrl(url);

/** A Block Kit text object. */
export type SlackText =
  | { type: 'plain_text'; text: string; emoji?: boolean }
  | { type: 'mrkdwn'; text: string };

/** A Block Kit button that opens `url`. */
export interface SlackButton {
  type: 'button';
  text: { type: 'plain_text'; text: string; emoji?: boolean };
  url: string;
  style?: 'primary' | 'danger';
}

/** The Block Kit blocks the new-inquiry message uses. */
export type SlackBlock =
  | {
      type: 'header';
      text: { type: 'plain_text'; text: string; emoji?: boolean };
    }
  | { type: 'section'; text: SlackText; fields?: SlackText[] }
  | { type: 'section'; fields: SlackText[] }
  | { type: 'context'; elements: SlackText[] }
  | { type: 'actions'; elements: SlackButton[] };

/**
 * The Slack message body. `text` is the fallback that Slack shows in
 * notifications and to screen readers; `blocks` is the message itself.
 */
export interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

/** Longest site name shown, in characters; longer names end with `…`. */
export const SLACK_SITE_NAME_MAX = 80;

/** Longest page path shown, in characters; longer paths end with `…`. */
export const SLACK_PAGE_PATH_MAX = 100;

/** Cuts `value` to `max` code points, ending with `…` when it was longer. */
const truncate = (value: string, max: number): string => {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max - 1).join('')}…`;
};

// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

const escapeEntities = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Slack mrkdwn has no escape for its formatting characters, so they are
// replaced with their full-width forms.
const FULL_WIDTH_BACKTICK = '\uff40';
const FULL_WIDTH: Readonly<Record<string, string>> = {
  '*': '\uff0a',
  _: '\uff3f',
  '~': '\uff5e',
  '`': FULL_WIDTH_BACKTICK,
};

/**
 * Makes `value` literal text in mrkdwn: `&`, `<`, and `>` become entities,
 * so no link or mention (`<!channel>`, `<@U…>`) can be written, and the
 * formatting characters cannot open or close bold, italic, strike, or code.
 */
const mrkdwnLiteral = (value: string): string =>
  escapeEntities(value).replace(/[*_~`]/g, (char) => FULL_WIDTH[char] ?? char);

/** Escapes `value` for a mrkdwn code span, where only a backtick could leak. */
const mrkdwnCode = (value: string): string =>
  `\`${escapeEntities(value).replace(/`/g, FULL_WIDTH_BACKTICK)}\``;

/** The path of `pagePath` without its query and fragment. */
const pathOnly = (pagePath: string): string =>
  pagePath.split(/[?#]/, 1)[0] ?? '';

/**
 * Builds the new-inquiry message in Block Kit: a header, one sentence with
 * the site name, the received time and the page of the form, a note that
 * the message holds no personal data, and a button to the inquiry in the
 * admin screen.
 *
 * It takes no submission data, so it cannot send any: no email, no field
 * values, not even the answers of select fields, and no IP or user agent.
 * `pagePath` is the path of the page that held the form; the query and
 * fragment are dropped, and the field is left out without a path.
 *
 * The time is a Slack date token with `{date_num} {time}`. Slack shows it in
 * each reader's own time zone, the date as `2026-10-23` in every language,
 * and the time in the reader's 12 or 24 hour setting. The fallback text is
 * UTC.
 *
 * @param siteName - The site the inquiry came to. It is shown as literal
 *   text: formatting characters cannot leak, and links or mentions cannot be
 *   written.
 */
export const buildSlackPayload = ({
  locale,
  receivedAt,
  adminUrl,
  siteName,
  pagePath,
}: {
  locale: Locale;
  receivedAt: number;
  adminUrl: string;
  siteName: string;
  pagePath?: string | null;
}): SlackPayload => {
  const seconds = Math.floor(receivedAt / 1000);
  const fallback = `${new Date(receivedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const site = mrkdwnLiteral(
    truncate(siteName.replace(CONTROL, ' ').trim(), SLACK_SITE_NAME_MAX),
  );
  const path = pagePath ? pathOnly(pagePath.replace(CONTROL, '')) : '';
  const fields: SlackText[] = [
    {
      type: 'mrkdwn',
      text: `*${translate(locale, 'notify.receivedAt')}*\n<!date^${seconds}^{date_num} {time}|${fallback}>`,
    },
  ];
  if (path !== '') {
    fields.push({
      type: 'mrkdwn',
      text: `*${translate(locale, 'notify.page')}*\n${mrkdwnCode(truncate(path, SLACK_PAGE_PATH_MAX))}`,
    });
  }
  return {
    text: translate(locale, 'notify.body', { site }),
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: translate(locale, 'notify.header'),
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: translate(locale, 'notify.body', { site: `*${site}*` }),
        },
      },
      { type: 'section', fields },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: translate(locale, 'notify.privacy') },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: translate(locale, 'notify.open'),
              emoji: true,
            },
            url: adminUrl,
            style: 'primary',
          },
        ],
      },
    ],
  };
};

/**
 * Posts the payload to the webhook and records `notified_at` on success.
 * Failures are logged without any submission data and never retried; the
 * unread count in the admin UI covers missed notifications.
 */
export const sendSlackNotification = async ({
  db,
  webhookUrl,
  submissionId,
  payload,
  now = Date.now(),
}: {
  db: D1Database;
  webhookUrl: string;
  submissionId: string;
  payload: SlackPayload;
  now?: number;
}): Promise<boolean> => {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.warn(`slack: webhook returned ${response.status}`);
      return false;
    }
  } catch {
    console.warn('slack: webhook request failed');
    return false;
  }
  await markNotified(db, submissionId, now);
  return true;
};
