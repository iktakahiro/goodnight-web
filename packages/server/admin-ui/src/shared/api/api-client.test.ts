import { expect, test } from 'bun:test';
import { parseErrorBody } from './api-client.ts';

test('parseErrorBody reads the API error shape', () => {
  expect(
    parseErrorBody({ error: { code: 'setup_closed', message: 'closed' } }),
  ).toEqual({ code: 'setup_closed', message: 'closed' });
  expect(parseErrorBody({ error: { code: 'not_found' } })).toEqual({
    code: 'not_found',
    message: 'not_found',
  });
});

test('parseErrorBody returns null for anything else', () => {
  for (const body of [
    null,
    'oops',
    {},
    { error: 'x' },
    { error: { code: 1 } },
  ]) {
    expect(parseErrorBody(body)).toBeNull();
  }
});
