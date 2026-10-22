import { expect, test } from 'bun:test';
import type { FormField } from '../contact-form/form-definition.ts';
import { SPAM_SUSPECT_THRESHOLD, scoreSubmission } from './spam-score.ts';

const field = (id: string, type: FormField['type']): FormField => ({
  id,
  type,
  label: { ja: id, en: id },
  required: false,
  showInList: false,
});

const fields = [
  field('f_name', 'text'),
  field('f_company', 'text'),
  field('f_site', 'url'),
  field('f_message', 'textarea'),
  field('f_notes', 'textarea'),
];

const score = (
  values: Record<string, string>,
  elapsedMs: number | undefined = 10_000,
) => scoreSubmission({ fields, values, elapsedMs });

test('a normal message scores 0', () => {
  expect(score({ f_name: 'Taro', f_message: 'Hello' })).toEqual({
    score: 0,
    reasons: [],
  });
});

test('links in text areas add one point each, at most 3', () => {
  expect(score({ f_message: 'see https://a.example' })).toEqual({
    score: 1,
    reasons: ['links:1'],
  });
  expect(
    score({ f_message: 'www.a http://b', f_notes: 'https://c https://d' }),
  ).toEqual({ score: 3, reasons: ['links:4'] });
});

test('a link in a one-line text field adds 3 points', () => {
  expect(score({ f_company: 'www.spam.example' })).toEqual({
    score: 3,
    reasons: ['link_in_field'],
  });
});

test('a url field may hold a link', () => {
  expect(score({ f_site: 'https://example.com' })).toEqual({
    score: 0,
    reasons: [],
  });
});

test('a submission faster than 3 seconds adds 3 points', () => {
  expect(score({}, 900)).toEqual({ score: 3, reasons: ['too_fast'] });
  expect(score({}, undefined).score).toBe(0);
});

test('the suspect threshold is reached by one strong rule, not by one link', () => {
  expect(SPAM_SUSPECT_THRESHOLD).toBe(3);
  expect(score({ f_message: 'https://a.example' }).score).toBeLessThan(
    SPAM_SUSPECT_THRESHOLD,
  );
  expect(
    score({ f_message: 'https://a https://b https://c' }).score,
  ).toBeGreaterThanOrEqual(SPAM_SUSPECT_THRESHOLD);
  expect(score({ f_name: 'http://x' }).score).toBe(SPAM_SUSPECT_THRESHOLD);
  expect(score({}, 0).score).toBe(SPAM_SUSPECT_THRESHOLD);
});

test('rules add up', () => {
  expect(score({ f_name: 'www.x', f_message: 'www.y www.z' }, 10)).toEqual({
    score: 8,
    reasons: ['links:2', 'link_in_field', 'too_fast'],
  });
});

test('text in other field types is not scored', () => {
  const values = { f_site: 'https://a https://b https://c https://d' };
  expect(score(values).score).toBe(0);
});
