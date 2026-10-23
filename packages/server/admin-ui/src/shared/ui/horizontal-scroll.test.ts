import { expect, test } from 'bun:test';
import { scrollEdges, scrollLeftToReveal } from './horizontal-scroll.ts';

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

test('revealing a fully visible tab preserves the scroll position', () => {
  expect(
    scrollLeftToReveal(
      { scrollLeft: 80, scrollWidth: 480, clientWidth: 320 },
      100,
      220,
      4,
    ),
  ).toBe(80);
});

test('revealing the last tab includes its badge and trailing padding', () => {
  expect(
    scrollLeftToReveal(
      { scrollLeft: 0, scrollWidth: 480, clientWidth: 320 },
      300,
      476,
      4,
    ),
  ).toBe(160);
});

test('revealing an earlier tab scrolls left with leading padding', () => {
  expect(
    scrollLeftToReveal(
      { scrollLeft: 160, scrollWidth: 480, clientWidth: 320 },
      100,
      220,
      4,
    ),
  ).toBe(96);
});

test('revealing a clipped tab moves only as far as needed', () => {
  expect(
    scrollLeftToReveal(
      { scrollLeft: 0, scrollWidth: 480, clientWidth: 320 },
      220,
      350.5,
      4,
    ),
  ).toBe(34.5);
});

test('reveal targets stay within the available scroll range', () => {
  const metrics = { scrollLeft: 80, scrollWidth: 480, clientWidth: 320 };
  expect(scrollLeftToReveal(metrics, 0, 100, 4)).toBe(0);
  expect(scrollLeftToReveal(metrics, 300, 480, 4)).toBe(160);
  expect(
    scrollLeftToReveal(
      { scrollLeft: 0, scrollWidth: 280, clientWidth: 320 },
      100,
      200,
      4,
    ),
  ).toBe(0);
});

test('a tab wider than the viewport stays aligned to its start', () => {
  const metrics = { scrollLeft: 0, scrollWidth: 600, clientWidth: 320 };
  const target = scrollLeftToReveal(metrics, 100, 500, 4);
  expect(target).toBe(96);
  expect(
    scrollLeftToReveal({ ...metrics, scrollLeft: target }, 100, 500, 4),
  ).toBe(target);
});
