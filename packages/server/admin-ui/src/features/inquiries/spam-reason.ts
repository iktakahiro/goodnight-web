import type { Translate } from '../../shared/i18n/i18n-provider.tsx';

/**
 * Explains a stored spam reason (`honeypot`, `links:N`, `link_in_field`,
 * `too_fast`) in the admin's language. An unknown reason, for example from
 * a newer rule, is shown as it is stored.
 */
export const spamReasonText = (t: Translate, reason: string): string => {
  const links = /^links:(\d{1,6})$/.exec(reason);
  if (links) return t('spam.reason.links', { count: Number(links[1]) });
  switch (reason) {
    case 'honeypot':
      return t('spam.reason.honeypot');
    case 'link_in_field':
      return t('spam.reason.link_in_field');
    case 'too_fast':
      return t('spam.reason.too_fast');
    default:
      return reason;
  }
};
