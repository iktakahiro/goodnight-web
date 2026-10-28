/** Returns adjacent entries in a newest-first list, or no neighbors if the id is absent. */
export function postNeighbors<T extends { id: string }>(
  posts: readonly T[],
  id: string,
) {
  const index = posts.findIndex((post) => post.id === id);
  return {
    newer: index > 0 ? posts[index - 1] : undefined,
    older: index >= 0 ? posts[index + 1] : undefined,
  };
}
