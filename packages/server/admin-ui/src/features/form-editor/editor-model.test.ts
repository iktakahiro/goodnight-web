import { expect, test } from 'bun:test';
import type { FormDefinition } from '../../../../src/features/contact-form/form-definition.ts';
import {
  allowedTypes,
  archivedEntries,
  isDirty,
  newEditorField,
  serverErrors,
  submissionSizeHint,
  toEditorValues,
  toUpdateBody,
  validateUpdate,
} from './editor-model.ts';

const saved: FormDefinition = {
  fields: [
    {
      id: 'f_name',
      type: 'text',
      label: { ja: 'お名前', en: 'Name' },
      required: true,
      maxLength: 100,
      showInList: true,
    },
    {
      id: 'f_category',
      type: 'select',
      label: { ja: '種類', en: 'Category' },
      required: false,
      options: [{ value: 'press', label: { ja: '取材', en: 'Press' } }],
      showInList: false,
    },
  ],
  archived: [
    {
      id: 'f_budget',
      type: 'number',
      label: { ja: 'ご予算', en: 'Budget' },
      required: false,
      showInList: false,
      lastVersion: 2,
    },
  ],
};

test('saved fields round-trip without changes', () => {
  const values = toEditorValues(saved);
  expect(isDirty(3, saved, values)).toBe(false);
  expect(validateUpdate(toUpdateBody(3, values))).toEqual([]);
  expect(toUpdateBody(3, values).fields[1]).toEqual({
    id: 'f_category',
    type: 'select',
    label: { ja: '種類', en: 'Category' },
    placeholder: undefined,
    hint: undefined,
    required: false,
    maxLength: undefined,
    options: [{ value: 'press', label: { ja: '取材', en: 'Press' } }],
    showInList: false,
  });
});

test('a new field has no id, and new choices have no value', () => {
  const field = newEditorField('radio');
  field.label.en = 'Preferred contact';
  const values = { fields: [...toEditorValues(saved).fields, field] };
  expect(isDirty(3, saved, values)).toBe(true);
  const body = toUpdateBody(3, values).fields[2];
  expect(body).not.toHaveProperty('id');
  expect(body?.options?.[0]).not.toHaveProperty('value');
  expect(body?.showInList).toBe(false);
});

test('saved fields may only switch to types with the same value shape', () => {
  const [name, category] = toEditorValues(saved).fields;
  expect(allowedTypes(name!)).toEqual(['text', 'textarea', 'tel', 'url']);
  expect(allowedTypes(category!)).toEqual(['select', 'radio']);
  expect(allowedTypes(newEditorField())).toHaveLength(9);
});

test('validation reports labels, choices, and lengths per field', () => {
  const field = newEditorField('select');
  const long = newEditorField('text');
  long.label.ja = '長い';
  long.maxLength = '2001';
  const bad = newEditorField('textarea');
  bad.label.en = 'x';
  bad.maxLength = '12abc';
  const values = { fields: [field, long, bad] };
  values.fields[0]!.options = [];
  const errors = validateUpdate(toUpdateBody(1, values));
  expect(errors).toContainEqual({
    index: 0,
    setting: 'label',
    message: 'form.error.label_required',
  });
  expect(errors).toContainEqual({
    index: 0,
    setting: 'options',
    message: 'form.error.options_required',
  });
  expect(errors).toContainEqual({
    index: 1,
    setting: 'maxLength',
    message: 'form.error.max_length',
  });
  expect(errors).toContainEqual({
    index: 2,
    setting: 'maxLength',
    message: 'form.error.max_length',
  });
});

test('server errors map to fields', () => {
  expect(
    serverErrors({ 'fields.1': 'type_change', 'fields.0.label': 'custom' }),
  ).toEqual([
    { index: 1, setting: 'field', message: 'form.error.type_change' },
    { index: 0, setting: 'label', message: 'form.error.invalid' },
  ]);
});

test('removed fields are listed as pending, archived ones after them', () => {
  const values = toEditorValues(saved);
  expect(archivedEntries(saved, values).map((e) => e.field.id)).toEqual([
    'f_budget',
  ]);
  values.fields.splice(1, 1);
  expect(
    archivedEntries(saved, values).map((e) => [e.field.id, e.pending]),
  ).toEqual([
    ['f_category', true],
    ['f_budget', false],
  ]);
});

test('only a textarea shows the limit on all answers of a submission', () => {
  expect(submissionSizeHint('textarea')).toEqual({ kb: 16, jaChars: 5400 });
  for (const type of ['text', 'tel', 'url', 'select'] as const) {
    expect(submissionSizeHint(type)).toBeNull();
  }
});
