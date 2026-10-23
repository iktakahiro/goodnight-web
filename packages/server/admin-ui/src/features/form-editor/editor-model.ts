import type * as z from 'zod';
import {
  DEFAULT_MAX_LENGTH,
  FORM_FIELD_TYPES,
  FORM_LIMITS,
  formUpdateSchema,
  isChoiceFieldType,
  isTextFieldType,
  valueShape,
  type ArchivedFormField,
  type FormDefinition,
  type FormField,
  type FormFieldType,
  type LocalizedText,
} from '../../../../src/features/contact-form/form-definition.ts';
import type { AdminMessageKey } from '../../shared/i18n/admin-messages.ts';
import type { FormUpdateBody } from './form-api.ts';

/** A choice in the editor. `value` is set once the server has saved it. */
export interface EditorOption {
  /** Client-only key for React and for focus. */
  key: string;
  value?: string;
  label: LocalizedText;
}

/** A field in the editor. Text inputs keep strings until the save. */
export interface EditorField {
  /** Client-only key for React. */
  key: string;
  /** The server's id; absent for a field that was never saved. */
  id?: string;
  /** The type when the field was loaded; it limits type changes. */
  savedType?: FormFieldType;
  type: FormFieldType;
  label: LocalizedText;
  placeholder: LocalizedText;
  hint: LocalizedText;
  required: boolean;
  /** Digits, or empty for the type's default. */
  maxLength: string;
  options: EditorOption[];
  showInList: boolean;
}

/** The editor's form values. */
export interface EditorValues {
  fields: EditorField[];
}

let nextKey = 0;
/** A new client-only key. */
export const newKey = (): string => `k${(nextKey += 1)}`;

const emptyText = (): LocalizedText => ({ ja: '', en: '' });

const copyText = (text: LocalizedText | undefined): LocalizedText =>
  text ? { ja: text.ja, en: text.en } : emptyText();

/** A saved field (current or archived) as an editor field. */
export const toEditorField = (field: FormField): EditorField => ({
  key: newKey(),
  id: field.id,
  savedType: field.type,
  type: field.type,
  label: copyText(field.label),
  placeholder: copyText(field.placeholder),
  hint: copyText(field.hint),
  required: field.required,
  maxLength: field.maxLength === undefined ? '' : String(field.maxLength),
  options: (field.options ?? []).map((option) => ({
    key: newKey(),
    value: option.value,
    label: copyText(option.label),
  })),
  showInList: field.showInList,
});

/** The editor values for a stored definition. */
export const toEditorValues = (definition: FormDefinition): EditorValues => ({
  fields: definition.fields.map(toEditorField),
});

/** A new, empty field. New fields are not shown in the list by default. */
export const newEditorField = (type: FormFieldType = 'text'): EditorField => ({
  key: newKey(),
  type,
  label: emptyText(),
  placeholder: emptyText(),
  hint: emptyText(),
  required: false,
  maxLength: '',
  options: isChoiceFieldType(type)
    ? [{ key: newKey(), label: emptyText() }]
    : [],
  showInList: false,
});

/** A new, empty choice. */
export const newEditorOption = (): EditorOption => ({
  key: newKey(),
  label: emptyText(),
});

/**
 * Types a field may switch to: every type for a new field; for a saved one,
 * only types that store the same shape of value, so earlier answers stay
 * readable (the server refuses other changes).
 */
export const allowedTypes = (field: EditorField): FormFieldType[] =>
  field.savedType === undefined
    ? [...FORM_FIELD_TYPES]
    : FORM_FIELD_TYPES.filter(
        (type) =>
          valueShape(type) === valueShape(field.savedType as FormFieldType),
      );

/** The largest `maxLength` for a type, or 0 when the type has none. */
export const maxLengthLimit = (type: FormFieldType): number =>
  type === 'textarea'
    ? FORM_LIMITS.textareaMaxLength
    : isTextFieldType(type)
      ? FORM_LIMITS.maxLength
      : 0;

/**
 * The limit on all answers of one submission, shown next to a textarea's
 * maximum length: `FORM_LIMITS.valuesBytes` in KB, and about how many
 * Japanese characters (3 bytes each in UTF-8) fit, rounded down to hundreds.
 * `null` for other types.
 */
export const submissionSizeHint = (
  type: FormFieldType,
): { kb: number; jaChars: number } | null =>
  type === 'textarea'
    ? {
        kb: FORM_LIMITS.valuesBytes / 1024,
        jaChars: Math.floor(FORM_LIMITS.valuesBytes / 3 / 100) * 100,
      }
    : null;

/** The default `maxLength` for a text type, or 0. */
export const defaultMaxLength = (type: FormFieldType): number =>
  isTextFieldType(type) ? DEFAULT_MAX_LENGTH[type] : 0;

const trimText = (text: LocalizedText): LocalizedText => ({
  ja: text.ja.trim(),
  en: text.en.trim(),
});

const optionalText = (text: LocalizedText) => {
  const trimmed = trimText(text);
  return trimmed.ja || trimmed.en ? trimmed : undefined;
};

/**
 * The body of `PUT /api/admin/form` for the editor values. A `maxLength`
 * that is not a whole number is sent as `NaN` and fails validation.
 */
export const toUpdateBody = (
  baseVersion: number,
  values: EditorValues,
): FormUpdateBody => ({
  baseVersion,
  fields: values.fields.map((field) => {
    const text = isTextFieldType(field.type);
    const choice = isChoiceFieldType(field.type);
    const maxLength = field.maxLength.trim();
    return {
      ...(field.id ? { id: field.id } : {}),
      type: field.type,
      label: trimText(field.label),
      placeholder: optionalText(field.placeholder),
      hint: optionalText(field.hint),
      required: field.required,
      maxLength:
        text && maxLength !== ''
          ? /^\d+$/.test(maxLength)
            ? Number(maxLength)
            : Number.NaN
          : undefined,
      options: choice
        ? field.options.map((option) => ({
            ...(option.value ? { value: option.value } : {}),
            label: trimText(option.label),
          }))
        : undefined,
      showInList: field.showInList,
    };
  }),
});

/** A validation problem, keyed by field index and setting. */
export interface EditorError {
  /** Index in `fields`, or `null` for the whole form. */
  index: number | null;
  /** The setting: `label`, `maxLength`, `options`, `type`, ... */
  setting: string;
  message: AdminMessageKey;
}

const messageFor = (setting: string, code: string): AdminMessageKey => {
  if (code === 'label_required') return 'form.error.label_required';
  if (code === 'options_required') return 'form.error.options_required';
  if (setting === 'maxLength') return 'form.error.max_length';
  if (code === 'too_big' || code === 'too_long') return 'form.error.too_long';
  if (code === 'type_change') return 'form.error.type_change';
  if (
    code === 'unknown_field' ||
    code === 'unknown_option' ||
    code === 'duplicate_field' ||
    code === 'duplicate_option'
  ) {
    return 'form.error.reload';
  }
  return 'form.error.invalid';
};

const fromPath = (path: readonly PropertyKey[], code: string): EditorError => {
  const [root, index, setting] = path;
  if (root !== 'fields' || typeof index !== 'number') {
    return { index: null, setting: 'form', message: messageFor('form', code) };
  }
  const name = typeof setting === 'string' ? setting : 'field';
  return { index, setting: name, message: messageFor(name, code) };
};

/** Validates the update body with the server's schema. */
export const validateUpdate = (body: FormUpdateBody): EditorError[] => {
  const result = formUpdateSchema.safeParse(body);
  if (result.success) return [];
  return result.error.issues.map((issue: z.core.$ZodIssue) =>
    fromPath(issue.path, issue.code === 'custom' ? issue.message : issue.code),
  );
};

/**
 * Turns the per-field codes of a 400 response (`fields.2.label` →
 * `label_required`, `fields.1` → `type_change`) into editor errors.
 */
export const serverErrors = (
  fields: Record<string, string> | undefined,
): EditorError[] =>
  Object.entries(fields ?? {}).map(([key, code]) =>
    fromPath(
      key.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
      code,
    ),
  );

/** An archived field in the editor's list, and whether it was removed now. */
export interface ArchivedEntry {
  field: FormField | ArchivedFormField;
  /** Removed in this editing session; archived on save. */
  pending: boolean;
}

/**
 * The archived list to show: fields removed in this session (still on the
 * saved form), then the saved archive. Fields that were put back are not
 * listed.
 */
export const archivedEntries = (
  saved: FormDefinition,
  values: EditorValues,
): ArchivedEntry[] => {
  const inEditor = new Set(
    values.fields.flatMap((field) => (field.id ? [field.id] : [])),
  );
  return [
    ...saved.fields
      .filter((field) => !inEditor.has(field.id))
      .map((field) => ({ field, pending: true })),
    ...saved.archived
      .filter((field) => !inEditor.has(field.id))
      .map((field) => ({ field, pending: false })),
  ];
};

/** Whether the editor values differ from the saved definition. */
export const isDirty = (
  baseVersion: number,
  saved: FormDefinition,
  values: EditorValues,
): boolean =>
  JSON.stringify(toUpdateBody(baseVersion, values)) !==
  JSON.stringify(toUpdateBody(baseVersion, toEditorValues(saved)));
