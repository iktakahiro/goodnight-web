import * as z from 'zod';
import {
  fieldMaxLength,
  type FormField,
  type FormFieldOption,
} from './form-definition.ts';

// C0 and C1 control characters, DEL, and Unicode line/paragraph separators.
// Multi-line fields keep tab and line feed.
// oxlint-disable-next-line no-control-regex
const SINGLE_LINE_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
// oxlint-disable-next-line no-control-regex
const MULTI_LINE_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/** Replaces control characters with spaces and trims. */
export const singleLine = (value: string): string =>
  value.replace(SINGLE_LINE_CONTROLS, ' ').trim();

/**
 * Normalizes line breaks to `\n`, removes control characters other than tab
 * and line feed, and trims.
 */
export const multiLine = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(MULTI_LINE_CONTROLS, '')
    .trim();

/** A stored field value: text, a number, or a list of option values. */
export type FieldValue = string | number | string[];

/** Values of one submission, keyed by field id. Empty fields are absent. */
export type FieldValues = Record<string, FieldValue>;

const PHONE = /^[0-9+\-() ]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMBER_TEXT = /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/;

const isRealDate = (value: string): boolean => {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1900 &&
    year <= 2999 &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

// Missing, `null`, blank text, and an empty list all mean "not filled in".
const emptyToUndefined = (value: unknown): unknown =>
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0)
    ? undefined
    : value;

const optionValues = (options: readonly FormFieldOption[] | undefined) =>
  (options ?? []).map((option) => option.value);

/** The schema of a non-empty value of `field`. */
const filledValueSchema = (field: FormField): z.ZodType<FieldValue> => {
  const max = fieldMaxLength(field);
  switch (field.type) {
    case 'text':
      return z
        .string()
        .max(max * 2)
        .transform(singleLine)
        .pipe(z.string().min(1).max(max));
    case 'textarea':
      return z
        .string()
        .max(max * 2)
        .transform(multiLine)
        .pipe(z.string().min(1).max(max));
    case 'tel':
      return z
        .string()
        .max(max * 2)
        .transform((value) => singleLine(value.normalize('NFKC')))
        .pipe(z.string().min(1).max(max).regex(PHONE));
    case 'url':
      return z
        .string()
        .max(max * 2)
        .transform(singleLine)
        .pipe(z.string().min(1).max(max).refine(isHttpUrl));
    case 'number':
      return z
        .union([
          z.number(),
          z
            .string()
            .max(40)
            .transform((value) => singleLine(value.normalize('NFKC')))
            .pipe(z.string().regex(NUMBER_TEXT))
            .transform(Number),
        ])
        .pipe(z.number().min(-1e15).max(1e15));
    case 'date':
      return z.string().max(10).refine(isRealDate);
    case 'select':
    case 'radio': {
      const values = optionValues(field.options);
      return z
        .string()
        .max(64)
        .refine((value) => values.includes(value));
    }
    case 'checkbox': {
      const values = optionValues(field.options);
      return z
        .array(
          z
            .string()
            .max(64)
            .refine((value) => values.includes(value)),
        )
        .max(values.length)
        .refine((list) => new Set(list).size === list.length);
    }
  }
};

/** The schema of `field`'s value, including `required`. */
const valueSchema = (field: FormField) => {
  const filled = filledValueSchema(field);
  return z.preprocess(
    emptyToUndefined,
    field.required ? filled : filled.optional(),
  );
};

/**
 * Builds the zod schema of `fields` in `POST /api/contact` from a form
 * definition. It accepts only the ids of `fields` (an unknown key fails with
 * `unrecognized_keys`), checks `required`, lengths, formats, and option
 * values, cleans text like the fixed fields, and leaves empty optional
 * fields out of the result.
 *
 * The server builds it from its own stored definition; it never trusts a
 * definition sent by a client.
 */
export const buildFieldValuesSchema = (
  fields: readonly FormField[],
): z.ZodType<FieldValues, unknown> => {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) shape[field.id] = valueSchema(field);
  const ids = new Set(fields.map((field) => field.id));
  // Checked by own keys first, on the parsed JSON itself: JSON.parse()
  // creates `__proto__` as an own key, which copying into a new object or a
  // key lookup with `in` would silently drop or accept.
  return z
    .custom<Record<string, unknown>>(
      (value) =>
        typeof value === 'object' && value !== null && !Array.isArray(value),
    )
    .superRefine((values, ctx) => {
      const unknown = Object.keys(values).filter((key) => !ids.has(key));
      if (unknown.length > 0) {
        ctx.addIssue({
          code: 'unrecognized_keys',
          keys: unknown,
          input: values,
        });
      }
    })
    .pipe(z.strictObject(shape))
    .transform((values) => {
      const result: FieldValues = {};
      for (const field of fields) {
        const value = (values as Record<string, unknown>)[field.id];
        if (value !== undefined) result[field.id] = value as FieldValue;
      }
      return result;
    });
};
