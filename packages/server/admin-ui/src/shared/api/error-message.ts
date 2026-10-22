import type { Translate } from '../i18n/i18n-provider.tsx';
import { isUiMessageKey } from '../i18n/admin-messages.ts';
import type { ApiError } from './api-client.ts';

/**
 * Returns the message for an API error in the current language: the shared
 * `error.<code>` string when one exists, otherwise a generic message.
 */
export const errorMessage = (t: Translate, error: ApiError): string => {
  const key = `error.${error.code}`;
  return isUiMessageKey(key) ? t(key) : t('error.generic');
};
