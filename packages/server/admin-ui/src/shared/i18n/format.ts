import type { Locale } from '../../../../src/shared/messages.ts';

const INTL_LOCALE: Readonly<Record<Locale, string>> = {
  ja: 'ja-JP',
  en: 'en-US',
};

/**
 * Formats an epoch-millisecond timestamp as a date and time in the viewer's
 * time zone (or `timeZone`, for tests), for example `2026/10/22 9:05` in
 * Japanese and `Oct 22, 2026, 9:05 AM` in English.
 */
export const formatDateTime = (
  ms: number,
  locale: Locale,
  timeZone?: string,
): string =>
  new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: 'numeric',
    month: locale === 'ja' ? 'numeric' : 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(ms);

/**
 * Formats a timestamp for a list row: time only when it is on the same day
 * as `now`, the month and day when it is in the same year, and the full date
 * otherwise. Uses the viewer's time zone (or `timeZone`).
 */
export const formatListDate = (
  ms: number,
  locale: Locale,
  now: number = Date.now(),
  timeZone?: string,
): string => {
  const dayKey = (value: number) =>
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    }).format(value);
  const today = dayKey(now);
  const day = dayKey(ms);
  const sameDay = day === today;
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    ...(sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : sameYear
        ? { month: locale === 'ja' ? 'numeric' : 'short', day: 'numeric' }
        : { year: 'numeric', month: 'numeric', day: 'numeric' }),
    timeZone,
  }).format(ms);
};

/** Formats a count with the locale's digit grouping (`1,234`). */
export const formatNumber = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);

/**
 * Returns the 1-based range of items shown on `page`, for "51–100 of 120".
 * `from` is 0 when there are no items.
 */
export const pageRange = (
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number; pageCount: number } => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return { from: 0, to: 0, pageCount };
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  return { from, to, pageCount };
};
