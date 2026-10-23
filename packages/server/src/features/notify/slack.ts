import type { D1Database } from '@cloudflare/workers-types';
import { translate, type Locale } from '../../shared/messages.ts';
import { markNotified } from '../submissions/submission-store.ts';

/**
 * Returns whether `url` looks like a Slack incoming webhook
 * (`https://hooks.slack.com/...`). Other URLs are never called.
 */
export const isSlackWebhookUrl = (url: string | undefined): url is string => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' && parsed.hostname === 'hooks.slack.com'
    );
  } catch {
    return false;
  }
};

/** The Slack message body: `{ text }` only. */
export interface SlackPayload {
  text: string;
}

/**
 * Builds the new-inquiry message: the count, the received time, and the
 * admin URL. It contains no personal data and nothing the visitor typed: no
 * email, no field values, not even the answers of select fields.
 *
 * The time is a Slack date token, so Slack shows it in each reader's own
 * time zone; the fallback text is UTC.
 */
export const buildSlackPayload = ({
  locale,
  receivedAt,
  adminUrl,
}: {
  locale: Locale;
  receivedAt: number;
  adminUrl: string;
}): SlackPayload => {
  const seconds = Math.floor(receivedAt / 1000);
  const fallback = new Date(receivedAt).toISOString().replace(/\.\d+Z$/, 'Z');
  return {
    text: [
      translate(locale, 'notify.newInquiry'),
      translate(locale, 'notify.receivedAt', {
        time: `<!date^${seconds}^{date_short_pretty} {time}|${fallback}>`,
      }),
      `<${adminUrl}|${translate(locale, 'notify.open')}>`,
    ].join('\n'),
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
      // The URL is checked to be on hooks.slack.com; do not follow a
      // redirect elsewhere. A redirect counts as a failed delivery.
      redirect: 'manual',
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
