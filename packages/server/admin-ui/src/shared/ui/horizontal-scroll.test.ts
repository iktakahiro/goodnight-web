import { expect, test } from 'bun:test';
import { scrollEdges } from './horizontal-scroll.ts';

test('content that fits hides nothing', () => {
  expect(
    scrollEdges({ scrollLeft: 0, scrollWidth: 800, clientWidth: 800 }),
  ).toEqual({ before: false, after: false });
});

test('a wide table at the start hides content on the right only', () => {
  expect(
    scrollEdges({ scrollLeft: 0, scrollWidth: 1200, clientWidth: 800 }),
  ).toEqual({ before: false, after: true });
});

test('a scrolled table hides content on both sides until the end', () => {
  expect(
    scrollEdges({ scrollLeft: 200, scrollWidth: 1200, clientWidth: 800 }),
  ).toEqual({ before: true, after: true });
  expect(
    scrollEdges({ scrollLeft: 400, scrollWidth: 1200, clientWidth: 800 }),
  ).toEqual({ before: true, after: false });
});

test('less than one pixel of fractional overflow does not count', () => {
  expect(
    scrollEdges({ scrollLeft: 0.4, scrollWidth: 800.6, clientWidth: 800 }),
  ).toEqual({ before: false, after: false });
});
