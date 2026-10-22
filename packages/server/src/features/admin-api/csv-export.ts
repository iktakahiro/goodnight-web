import {
  localizedText,
  type FormDefinition,
  type FormField,
} from '../contact-form/form-definition.ts';
import { allKnownFields } from '../contact-form/form-edit.ts';
import type { FormVersion } from '../contact-form/form-store.ts';
import type { Submission } from '../submissions/submission-store.ts';
import type { Locale } from '../../shared/messages.ts';
import { toAdminValue } from './admin-view.ts';

const FIXED_HEADER = [
  'id',
  'received_at',
  'status',
  'email',
  'locale',
  'form_version',
  'page_path',
  'country',
  'spam_score',
  'spam_reasons',
] as const;

/** The columns of a CSV export. */
export interface CsvLayout {
  header: string[];
  /** Field columns after the fixed ones, in header order. */
  fields: FormField[];
}

/**
 * Columns of the CSV export: the fixed columns, then one column per field id
 * the form ever had (the current fields in form order, then archived fields).
 * Old and new fields never share a column, even when they have the same
 * label.
 *
 * Headers are labels in `locale` from the latest definition. An archived
 * field's header ends with ` (vN)`, N being the last version that had it. If
 * two headers are still equal, the field id is added in brackets.
 */
export const csvLayout = (
  current: FormDefinition,
  locale: Locale,
): CsvLayout => {
  const fields = allKnownFields(current);
  const labels = fields.map((field) => {
    const label = localizedText(field.label, locale) || field.id;
    return 'lastVersion' in field ? `${label} (v${field.lastVersion})` : label;
  });
  const counts = new Map<string, number>();
  for (const label of [...FIXED_HEADER, ...labels]) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return {
    header: [
      ...FIXED_HEADER,
      ...labels.map((label, index) =>
        (counts.get(label) ?? 0) > 1
          ? `${label} [${fields[index]?.id}]`
          : label,
      ),
    ],
    fields,
  };
};

const isoDate = (ms: number) => new Date(ms).toISOString();

/**
 * One CSV row. Field values are formatted with the definition of the
 * submission's own version (option labels in `locale`), falling back to the
 * latest definition. Pass the cells to `csvLine()`, which applies the
 * formula guard to every text cell.
 *
 * @param versions - Definitions of the versions on this batch, by number.
 */
export const csvRow = (
  submission: Submission,
  layout: CsvLayout,
  versions: ReadonlyMap<number, FormVersion>,
  locale: Locale,
): (string | number | null)[] => {
  const own = versions.get(submission.formVersion)?.definition;
  const ownFields = new Map(
    (own ? allKnownFields(own) : []).map((field) => [field.id, field]),
  );
  return [
    submission.id,
    isoDate(submission.createdAt),
    submission.status,
    submission.email,
    submission.locale,
    submission.formVersion,
    submission.pagePath,
    submission.country,
    submission.spamScore,
    submission.spamReasons.join(' '),
    ...layout.fields.map((latest) => {
      const value = submission.fields[latest.id];
      if (value === undefined) return null;
      if (typeof value === 'number') return value;
      const shown = toAdminValue(ownFields.get(latest.id) ?? latest, value);
      return shown.kind === 'text'
        ? shown.text
        : shown.choices
            .map((choice) =>
              choice.label ? localizedText(choice.label, locale) : choice.value,
            )
            .join('; ');
    }),
  ];
};
