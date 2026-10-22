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

const escapeSlack = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Builds the new-inquiry message. It contains the count, the category, and the
 * admin URL only: no name, email, company, phone, or message body.
 *
 * @param category - Shown only when it is one of `allowedCategories`, so free
 *   text typed by a visitor never reaches Slack.
 */
export const buildSlackPayload = ({
  locale,
  category,
  allowedCategories,
  adminUrl,
}: {
  locale: Locale;
  category: string | null;
  allowedCategories: readonly string[] | undefined;
  adminUrl: string;
}): SlackPayload => {
  const lines = [translate(locale, 'notify.newInquiry')];
  if (category && allowedCategories?.includes(category)) {
    lines.push(
      translate(locale, 'notify.category', { category: escapeSlack(category) }),
    );
  }
  lines.push(`<${adminUrl}|${translate(locale, 'notify.open')}>`);
  return { text: lines.join('\n') };
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
