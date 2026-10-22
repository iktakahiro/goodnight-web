import type { AdminCategory } from '../../../../src/features/admin-api/admin-routes.ts';
import type { Locale } from '../../../../src/shared/messages.ts';

/**
 * The text to show for a stored category: its label in `locale` when the
 * category is configured with labels, otherwise the stored value. Categories
 * removed from the configuration and plain-string categories show the value.
 *
 * @param categories - `categories` from `GET /api/admin/status`, or `null`
 *   while the status is loading or failed to load.
 */
export const categoryLabel = (
  value: string,
  categories: readonly AdminCategory[] | null | undefined,
  locale: Locale,
): string => {
  const label = categories?.find((category) => category.value === value)?.label;
  return label?.[locale] || value;
};
