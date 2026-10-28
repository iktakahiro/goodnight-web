import { describe, expect, test } from 'bun:test';
import { postNeighbors } from './post-neighbors';

describe('postNeighbors', () => {
  const posts = [{ id: 'newest' }, { id: 'middle' }, { id: 'oldest' }];

  test('returns both adjacent posts for a middle post', () => {
    expect(postNeighbors(posts, 'middle')).toEqual({
      newer: posts[0],
      older: posts[2],
    });
  });

  test('returns only the existing neighbor at either end', () => {
    expect(postNeighbors(posts, 'newest')).toEqual({
      newer: undefined,
      older: posts[1],
    });
    expect(postNeighbors(posts, 'oldest')).toEqual({
      newer: posts[1],
      older: undefined,
    });
  });

  test('returns no neighbors for a single post or a missing id', () => {
    expect(postNeighbors([{ id: 'newest' }], 'newest')).toEqual({
      newer: undefined,
      older: undefined,
    });
    expect(postNeighbors(posts, 'missing')).toEqual({
      newer: undefined,
      older: undefined,
    });
  });
});
