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
import { csvCell } from './csv.ts';

const FIXED_HEADER = [
  'id',
  'received_at',
  'status',
  'suspected_spam',
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
 * two CSV cells would still be equal, the field id is added in brackets.
 */
export const csvLayout = (
  current: FormDefinition,
  locale: Locale,
): CsvLayout => {
  const fields = allKnownFields(current);
  const reserved = new Set(FIXED_HEADER.map(csvCell));
  const duplicates = new Set<string>();
  const columns = fields.map((field) => {
    const text = localizedText(field.label, locale) || field.id;
    const label =
      'lastVersion' in field ? `${text} (v${field.lastVersion})` : text;
    const cell = csvCell(label);
    if (reserved.has(cell)) duplicates.add(cell);
    reserved.add(cell);
    return { label, cell, id: field.id };
  });
  return {
    header: [
      ...FIXED_HEADER,
      ...columns.map(({ label, cell, id }) => {
        if (!duplicates.has(cell)) return label;
        const base = `${label} [${id}]`;
        let candidate = base;
        for (let n = 2; reserved.has(csvCell(candidate)); n++) {
          candidate = `${base} (${n})`;
        }
        reserved.add(csvCell(candidate));
        return candidate;
      }),
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
    submission.suspectedSpam ? 1 : 0,
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
