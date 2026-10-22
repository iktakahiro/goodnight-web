import { expect, test } from 'bun:test';
import { scoreSubmission } from './spam-score.ts';

const input = {
  name: 'Taro',
  company: undefined,
  message: 'Hello',
  elapsedMs: 10_000,
};

test('a normal message scores 0', () => {
  expect(scoreSubmission(input)).toEqual({ score: 0, reasons: [] });
});

test('links add one point each, at most 3', () => {
  expect(
    scoreSubmission({ ...input, message: 'see https://a.example' }),
  ).toEqual({
    score: 1,
    reasons: ['links:1'],
  });
  expect(
    scoreSubmission({
      ...input,
      message: 'www.a http://b https://c https://d',
    }),
  ).toEqual({ score: 3, reasons: ['links:4'] });
});

test('a link in the name or company adds 3 points', () => {
  expect(scoreSubmission({ ...input, company: 'www.spam.example' })).toEqual({
    score: 3,
    reasons: ['link_in_name'],
  });
});

test('a submission faster than 3 seconds adds 3 points', () => {
  expect(scoreSubmission({ ...input, elapsedMs: 900 })).toEqual({
    score: 3,
    reasons: ['too_fast'],
  });
  expect(scoreSubmission({ ...input, elapsedMs: undefined }).score).toBe(0);
});
