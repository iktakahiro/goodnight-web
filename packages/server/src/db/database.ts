import type { D1Database } from '@cloudflare/workers-types';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.ts';

/** The Drizzle database for a goodnight-web D1 binding. */
export type GoodnightDatabase = DrizzleD1Database<typeof schema>;

const cache = new WeakMap<D1Database, GoodnightDatabase>();

/**
 * Returns the Drizzle database for a D1 binding, reusing it within the
 * isolate. All app queries go through it; app code never builds D1
 * statements itself (docs/decisions/0005).
 */
export const getDatabase = (d1: D1Database): GoodnightDatabase => {
  let db = cache.get(d1);
  if (!db) {
    db = drizzle(d1, { schema });
    cache.set(d1, db);
  }
  return db;
};
