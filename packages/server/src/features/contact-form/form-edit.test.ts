import { describe, expect, test } from 'bun:test';
import {
  formFieldInputSchema,
  isFieldId,
  type FormDefinition,
  type FormField,
  type FormFieldInput,
} from './form-definition.ts';
import {
  allKnownFields,
  applyFormEdit,
  isSameDefinition,
  restoreFormVersion,
} from './form-edit.ts';

const field = (
  id: string,
  type: FormField['type'] = 'text',
  extra: Partial<FormField> = {},
): FormField => ({
  id,
  type,
  label: { ja: id, en: id },
  required: false,
  showInList: false,
  ...extra,
});

const v1: FormDefinition = {
  fields: [
    field('f_name'),
    field('f_topic', 'select', {
      options: [
        { value: 'sales', label: { ja: '営業', en: 'Sales' } },
        { value: 'press', label: { ja: '取材', en: 'Press' } },
      ],
    }),
    field('f_message', 'textarea'),
  ],
  archived: [],
};

/** The editor's input for a stored field, as the admin UI sends it. */
const asInput = (f: FormField): FormFieldInput =>
  formFieldInputSchema.parse({
    id: f.id,
    type: f.type,
    label: f.label,
    required: f.required,
    showInList: f.showInList,
    ...(f.maxLength ? { maxLength: f.maxLength } : {}),
    ...(f.options ? { options: f.options } : {}),
  });

const newInput = (en: string, type: FormField['type'] = 'text') =>
  formFieldInputSchema.parse({
    type,
    label: { ja: en, en },
    required: false,
    ...(type === 'select'
      ? { options: [{ label: { ja: 'A', en: 'A' } }] }
      : {}),
  });

const edit = (
  current: FormDefinition,
  version: number,
  inputs: FormFieldInput[],
) => {
  const result = applyFormEdit(current, version, inputs);
  if (!result.ok) throw new Error(`edit failed: ${result.error}`);
  return result.definition;
};

describe('applyFormEdit', () => {
  test('keeps the ids of existing fields while labels change', () => {
    const inputs = v1.fields.map(asInput);
    inputs[0] = { ...inputs[0]!, label: { ja: '氏名', en: 'Full name' } };
    const next = edit(v1, 1, inputs);
    expect(next.fields.map((f) => f.id)).toEqual([
      'f_name',
      'f_topic',
      'f_message',
    ]);
    expect(next.fields[0]?.label).toEqual({ ja: '氏名', en: 'Full name' });
    expect(next.archived).toEqual([]);
  });

  test('gives a new field a fresh id that no version used', () => {
    const next = edit(v1, 1, [...v1.fields.map(asInput), newInput('Budget')]);
    const added = next.fields[3];
    expect(added?.id).toBeDefined();
    expect(isFieldId(added?.id)).toBe(true);
    expect(v1.fields.map((f) => f.id)).not.toContain(added?.id);
  });

  test('refuses an id that no version had', () => {
    const forged = { ...newInput('Budget'), id: 'f_chosenbyclient' };
    expect(applyFormEdit(v1, 1, [...v1.fields.map(asInput), forged])).toEqual({
      ok: false,
      error: 'unknown_field',
      fieldIndex: 3,
    });
  });

  test('archives a removed field with its last version', () => {
    const next = edit(v1, 4, [asInput(v1.fields[0]!), asInput(v1.fields[2]!)]);
    expect(next.fields.map((f) => f.id)).toEqual(['f_name', 'f_message']);
    expect(next.archived).toEqual([{ ...v1.fields[1]!, lastVersion: 4 }]);
  });

  test('a new field with the label of a removed one gets a new id', () => {
    const v2 = edit(v1, 1, [asInput(v1.fields[0]!), asInput(v1.fields[2]!)]);
    const v3 = edit(v2, 2, [
      ...v2.fields.map(asInput),
      newInput('f_topic', 'select'),
    ]);
    const again = v3.fields[2];
    expect(again?.label).toEqual(v1.fields[1]?.label);
    expect(again?.id).not.toBe('f_topic');
    expect(v3.archived.map((f) => f.id)).toEqual(['f_topic']);
    expect(new Set(allKnownFields(v3).map((f) => f.id)).size).toBe(4);
  });

  test('restores an archived field by id with its id and leaves the archive', () => {
    const v2 = edit(v1, 1, [asInput(v1.fields[0]!)]);
    expect(v2.archived.map((f) => f.id)).toEqual(['f_topic', 'f_message']);
    const restored = asInput(v2.archived[1]!);
    const v3 = edit(v2, 2, [asInput(v2.fields[0]!), restored]);
    expect(v3.fields.map((f) => f.id)).toEqual(['f_name', 'f_message']);
    expect(v3.fields[1]).not.toHaveProperty('lastVersion');
    expect(v3.archived.map((f) => f.id)).toEqual(['f_topic']);
    expect(v3.archived[0]?.lastVersion).toBe(1);
  });

  test('an archived field keeps its first archive version', () => {
    const v2 = edit(v1, 1, [asInput(v1.fields[0]!)]);
    const v3 = edit(v2, 2, [asInput(v2.fields[0]!), newInput('New')]);
    expect(v3.archived.find((f) => f.id === 'f_topic')?.lastVersion).toBe(1);
  });

  test('allows type changes within a value shape only', () => {
    const asTextarea = { ...asInput(v1.fields[0]!), type: 'textarea' as const };
    expect(edit(v1, 1, [asTextarea]).fields[0]?.type).toBe('textarea');
    const asRadio = { ...asInput(v1.fields[1]!), type: 'radio' as const };
    expect(edit(v1, 1, [asRadio]).fields[0]?.type).toBe('radio');
    for (const [index, type] of [
      [0, 'number'],
      [0, 'date'],
      [1, 'checkbox'],
      [2, 'select'],
    ] as const) {
      const input = formFieldInputSchema.parse({
        ...asInput(v1.fields[index]!),
        type,
        options: [{ label: { ja: 'A', en: 'A' } }],
      });
      expect(applyFormEdit(v1, 1, [input])).toEqual({
        ok: false,
        error: 'type_change',
        fieldIndex: 0,
      });
    }
  });

  test('also checks type changes of an archived field being restored', () => {
    const v2 = edit(v1, 1, [asInput(v1.fields[0]!)]);
    const input = formFieldInputSchema.parse({
      ...asInput(v2.archived[1]!),
      type: 'number',
    });
    expect(applyFormEdit(v2, 2, [input])).toMatchObject({
      ok: false,
      error: 'type_change',
    });
  });

  test('generates values for new options and keeps existing ones', () => {
    const topic = asInput(v1.fields[1]!);
    const next = edit(v1, 1, [
      {
        ...topic,
        options: [
          ...(topic.options ?? []),
          { label: { ja: '採用', en: 'Careers' } },
          { label: { ja: 'その他', en: 'Other' } },
        ],
      },
    ]);
    const values = next.fields[0]?.options?.map((o) => o.value) ?? [];
    expect(values.slice(0, 2)).toEqual(['sales', 'press']);
    expect(values[2]).toMatch(/^o_[a-z0-9]{10}$/);
    expect(values[3]).toMatch(/^o_[a-z0-9]{10}$/);
    expect(values[2]).not.toBe(values[3]);
  });

  test('refuses an option value the field does not have', () => {
    const topic = asInput(v1.fields[1]!);
    expect(
      applyFormEdit(v1, 1, [
        asInput(v1.fields[0]!),
        {
          ...topic,
          options: [{ value: 'other', label: { ja: 'x', en: 'x' } }],
        },
      ]),
    ).toEqual({ ok: false, error: 'unknown_option', fieldIndex: 1 });
  });

  test('does not change the current definition', () => {
    const before = JSON.stringify(v1);
    edit(v1, 1, [newInput('Only')]);
    expect(JSON.stringify(v1)).toBe(before);
  });
});

describe('restoreFormVersion', () => {
  test('brings back the fields of an earlier version with the same ids', () => {
    const v2 = edit(v1, 1, [asInput(v1.fields[0]!), newInput('Budget')]);
    const budget = v2.fields[1]!;
    const v3 = restoreFormVersion(v2, 2, v1);
    expect(v3.fields).toEqual(v1.fields);
    expect(v3.archived).toEqual([{ ...budget, lastVersion: 2 }]);
  });

  test('restoring a version with archived fields does not copy its archive', () => {
    const v2 = edit(v1, 1, [asInput(v1.fields[0]!)]);
    const v3 = restoreFormVersion(v2, 2, v2);
    expect(v3.fields).toEqual(v2.fields);
    expect(v3.archived.map((f) => f.id)).toEqual(['f_topic', 'f_message']);
  });
});

describe('isSameDefinition', () => {
  test('ignores key order and undefined keys, not values or field order', () => {
    const reordered: FormDefinition = JSON.parse(
      JSON.stringify(v1, (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    );
    expect(isSameDefinition(v1, reordered)).toBe(true);
    expect(
      isSameDefinition(v1, {
        ...v1,
        fields: v1.fields.map((f) => ({ ...f, hint: undefined })),
      }),
    ).toBe(true);
    expect(
      isSameDefinition(v1, { ...v1, fields: [...v1.fields].reverse() }),
    ).toBe(false);
    expect(
      isSameDefinition(v1, {
        ...v1,
        fields: v1.fields.map((f, i) =>
          i === 0 ? { ...f, required: true } : f,
        ),
      }),
    ).toBe(false);
  });
});
