import {
  isChoiceFieldType,
  type FormDefinition,
  type FormField,
  type FormFieldType,
  type LocalizedText,
} from '../contact-form/form-definition.ts';
import { allKnownFields } from '../contact-form/form-edit.ts';
import type { FieldValue } from '../contact-form/form-values-schema.ts';
import type { Submission } from '../submissions/submission-store.ts';

/**
 * A field value as the admin UI shows it: text (numbers and dates as text),
 * or option values with their labels. `label` is `null` when the option is
 * not in the definition (shown as the value then).
 */
export type AdminFieldValue =
  | { kind: 'text'; text: string }
  | {
      kind: 'choices';
      choices: { value: string; label: LocalizedText | null }[];
    };

/**
 * One field of a submission in the detail view, labeled by the version the
 * submission was sent with.
 */
export interface AdminFieldEntry {
  id: string;
  type: FormFieldType;
  /** Label in the submission's own version; `null` when unknown (show `id`). */
  label: LocalizedText | null;
  /** `null` when the visitor left the field empty. */
  value: AdminFieldValue | null;
  /** `false` when the field is not on the current form (archived). */
  inCurrentForm: boolean;
}

/** Truncation length of text values in the admin list. */
export const LIST_TEXT_LENGTH = 120;

/**
 * Formats a stored value with `field`'s options. Without a field (an id the
 * definition does not know), lists become choices without labels and
 * everything else becomes text.
 */
export const toAdminValue = (
  field: FormField | undefined,
  value: FieldValue,
  maxText?: number,
): AdminFieldValue => {
  if (Array.isArray(value) || (field && isChoiceFieldType(field.type))) {
    const values = Array.isArray(value) ? value : [String(value)];
    return {
      kind: 'choices',
      choices: values.map((entry) => ({
        value: entry,
        label:
          field?.options?.find((option) => option.value === entry)?.label ??
          null,
      })),
    };
  }
  const text = String(value);
  return {
    kind: 'text',
    text:
      maxText !== undefined && text.length > maxText
        ? `${text.slice(0, maxText)}…`
        : text,
  };
};

/**
 * The fields of a submission for the detail view: the fields of its own
 * version in that version's order, then any stored value whose id that
 * version does not list (labeled from the latest known definition).
 *
 * @param own - The definition of the submission's version, or `null` when
 *   it cannot be found.
 * @param current - The current definition.
 */
export const detailEntries = (
  submission: Submission,
  own: FormDefinition | null,
  current: FormDefinition,
): AdminFieldEntry[] => {
  const onCurrentForm = new Set(current.fields.map((field) => field.id));
  const latest = new Map(
    allKnownFields(current).map((field) => [field.id, field]),
  );
  const entries: AdminFieldEntry[] = [];
  const seen = new Set<string>();
  for (const field of own?.fields ?? []) {
    seen.add(field.id);
    const value = submission.fields[field.id];
    entries.push({
      id: field.id,
      type: field.type,
      label: field.label,
      value: value === undefined ? null : toAdminValue(field, value),
      inCurrentForm: onCurrentForm.has(field.id),
    });
  }
  for (const [id, value] of Object.entries(submission.fields)) {
    if (seen.has(id)) continue;
    const field = latest.get(id);
    entries.push({
      id,
      type: field?.type ?? 'text',
      label: field?.label ?? null,
      value: toAdminValue(field, value),
      inCurrentForm: onCurrentForm.has(id),
    });
  }
  return entries;
};
