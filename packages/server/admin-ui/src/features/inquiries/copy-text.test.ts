import { afterEach, expect, test } from 'bun:test';
import { copyText } from './copy-text.ts';

const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

const setClipboard = (clipboard: unknown) =>
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard },
    configurable: true,
  });

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'navigator', original);
  else Reflect.deleteProperty(globalThis, 'navigator');
});

test('copyText writes the text and reports success', async () => {
  const written: string[] = [];
  setClipboard({
    writeText: async (text: string) => {
      written.push(text);
    },
  });
  expect(await copyText('visitor@example.com')).toBe(true);
  expect(written).toEqual(['visitor@example.com']);
});

test('copyText reports failure when the write is refused', async () => {
  setClipboard({
    writeText: async () => {
      throw new DOMException('denied', 'NotAllowedError');
    },
  });
  expect(await copyText('visitor@example.com')).toBe(false);
});

test('copyText reports failure when there is no clipboard', async () => {
  setClipboard(undefined);
  expect(await copyText('visitor@example.com')).toBe(false);
});
