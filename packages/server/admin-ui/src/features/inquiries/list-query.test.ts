import { expect, test } from 'bun:test';
import { listPath, parsePage, parseStatusFilter } from './list-query.ts';

test('parseStatusFilter accepts statuses and defaults to all', () => {
  expect(parseStatusFilter('new')).toBe('new');
  expect(parseStatusFilter('spam')).toBe('spam');
  expect(parseStatusFilter('all')).toBe('all');
  expect(parseStatusFilter('deleted')).toBe('all');
  expect(parseStatusFilter(null)).toBe('all');
});

test('parsePage accepts positive integers only', () => {
  expect(parsePage('3')).toBe(3);
  expect(parsePage('0')).toBe(1);
  expect(parsePage('-2')).toBe(1);
  expect(parsePage('1.5')).toBe(1);
  expect(parsePage('abc')).toBe(1);
  expect(parsePage(null)).toBe(1);
});

test('listPath leaves out defaults', () => {
  expect(listPath('all')).toBe('/admin');
  expect(listPath('new')).toBe('/admin?status=new');
  expect(listPath('all', 2)).toBe('/admin?page=2');
  expect(listPath('done', 3)).toBe('/admin?status=done&page=3');
});
