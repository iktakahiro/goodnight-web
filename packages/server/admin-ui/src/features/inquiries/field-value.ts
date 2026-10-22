import type { AdminFieldValue } from '../../../../src/features/admin-api/admin-view.ts';
import {
  localizedText,
  type LocalizedText,
} from '../../../../src/features/contact-form/form-definition.ts';
import type { Locale } from '../../../../src/shared/messages.ts';

/**
 * A field value as text: text values as they are, choices as their labels in
 * `locale` (the other language when that one is empty, the stored value when
 * the option is unknown), joined with a comma.
 */
export const fieldValueText = (
  value: AdminFieldValue,
  locale: Locale,
): string =>
  value.kind === 'text'
    ? value.text
    : value.choices
        .map((choice) =>
          choice.label
            ? localizedText(choice.label, locale) || choice.value
            : choice.value,
        )
        .join(locale === 'ja' ? '、' : ', ');

/** A field label in `locale`, or `fallback` (the field id) when it is empty. */
export const labelText = (
  label: LocalizedText | null | undefined,
  locale: Locale,
  fallback: string,
): string => (label ? localizedText(label, locale) : '') || fallback;
