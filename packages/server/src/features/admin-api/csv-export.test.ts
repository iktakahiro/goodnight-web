import { describe, expect, test } from 'bun:test';
import { testSubmission } from '../../testing/submissions.ts';
import type { Submission } from '../submissions/submission-store.ts';
import type {
  ArchivedFormField,
  FormDefinition,
  FormField,
} from '../contact-form/form-definition.ts';
import type { FormVersion } from '../contact-form/form-store.ts';
import { csvLine } from './csv.ts';
import { csvLayout, csvRow } from './csv-export.ts';

const field = (
  id: string,
  en: string,
  extra: Partial<FormField> = {},
): FormField => ({
  id,
  type: 'text',
  label: { ja: `${en}（日本語）`, en },
  required: false,
  showInList: false,
  ...extra,
});

const archived = (f: FormField, lastVersion: number): ArchivedFormField => ({
  ...f,
  lastVersion,
});

const version = (n: number, definition: FormDefinition): FormVersion => ({
  version: n,
  definition,
  createdAt: 0,
  createdBy: null,
  restoredFrom: null,
});

const FIXED = 10;

const stored = (overrides: Partial<Submission>): Submission => ({
  ...testSubmission('x', overrides),
  notifiedAt: null,
  readAt: null,
});

describe('csvLayout', () => {
  test('lists current fields, then archived ones with their last version', () => {
    const layout = csvLayout(
      {
        fields: [field('f_a', 'Name'), field('f_b', 'Budget')],
        archived: [
          archived(field('f_c', 'Budget'), 3),
          archived(field('f_d', 'Fax'), 1),
        ],
      },
      'en',
    );
    expect(layout.header.slice(FIXED)).toEqual([
      'Name',
      'Budget',
      'Budget (v3)',
      'Fax (v1)',
    ]);
    expect(layout.fields.map((f) => f.id)).toEqual([
      'f_a',
      'f_b',
      'f_c',
      'f_d',
    ]);
  });

  test('adds the id when headers would still be equal', () => {
    const layout = csvLayout(
      {
        fields: [
          field('f_a', 'Note'),
          field('f_b', 'Note'),
          field('f_c', 'email'),
        ],
        archived: [],
      },
      'en',
    );
    expect(layout.header.slice(FIXED)).toEqual([
      'Note [f_a]',
      'Note [f_b]',
      'email [f_c]',
    ]);
  });

  test('falls back to the other language, then to the id', () => {
    const layout = csvLayout(
      {
        fields: [
          { ...field('f_a', 'Name'), label: { ja: '名前', en: '' } },
          { ...field('f_b', 'x'), label: { ja: '', en: '' } },
        ],
        archived: [],
      },
      'en',
    );
    expect(layout.header.slice(FIXED)).toEqual(['名前', 'f_b']);
  });
});

describe('csvRow', () => {
  const topic = (labels: [string, string]): FormField =>
    field('f_t', 'Topic', {
      type: 'checkbox',
      options: [
        { value: 'a', label: { ja: 'エー', en: labels[0] } },
        { value: 'b', label: { ja: 'ビー', en: labels[1] } },
      ],
    });
  const v1: FormDefinition = {
    fields: [topic(['A1', 'B1']), field('f_n', 'N', { type: 'number' })],
    archived: [],
  };
  const v2: FormDefinition = {
    fields: [topic(['A2', 'B2']), field('f_n', 'N', { type: 'number' })],
    archived: [],
  };
  const versions = new Map([
    [1, version(1, v1)],
    [2, version(2, v2)],
  ]);
  const layout = csvLayout(v2, 'en');

  test("labels options with the row's own version", () => {
    const row = (formVersion: number) =>
      csvRow(
        stored({ formVersion, fields: { f_t: ['b', 'a', 'z'] } }),
        layout,
        versions,
        'en',
      ).slice(FIXED);
    expect(row(1)).toEqual(['B1; A1; z', null]);
    expect(row(2)).toEqual(['B2; A2; z', null]);
    // An unknown version falls back to the latest definition.
    expect(row(9)).toEqual(['B2; A2; z', null]);
    expect(
      csvRow(
        stored({ formVersion: 1, fields: { f_t: ['a'] } }),
        layout,
        versions,
        'ja',
      )[FIXED],
    ).toBe('エー');
  });

  test('keeps numbers as numbers and guards text in csvLine', () => {
    const cells = csvRow(
      stored({
        formVersion: 2,
        email: '=evil@example.org',
        fields: { f_n: -5, f_t: ['a'] },
      }),
      layout,
      versions,
      'en',
    );
    expect(cells.slice(FIXED)).toEqual(['A2', -5]);
    expect(csvLine(cells)).toContain(`"'=evil@example.org"`);
    expect(csvLine(cells)).toContain('"-5"');
  });
});
