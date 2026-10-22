import type { D1Database } from '@cloudflare/workers-types';
import { createTestD1 } from './sqlite-d1.ts';

/** A statement sent to D1: its SQL text and its bound values. */
export interface RecordedStatement {
  sql: string;
  params: unknown[];
}

interface Bindable {
  bind: (...values: unknown[]) => Bindable;
}

/**
 * Test-only D1 stand-in that records every prepared statement and the values
 * bound to it, so tests can check that input is bound, never spliced into
 * the SQL text.
 */
export const createRecordingD1 = () => {
  const test = createTestD1();
  const statements: RecordedStatement[] = [];
  const record = (statement: Bindable, entry: RecordedStatement): Bindable =>
    new Proxy(statement, {
      get: (target, key, receiver) =>
        key === 'bind'
          ? (...values: unknown[]) => {
              entry.params = values;
              return target.bind(...values);
            }
          : Reflect.get(target, key, receiver),
    });
  const inner = test.d1 as unknown as {
    prepare: (sql: string) => Bindable;
  };
  const d1 = new Proxy(test.d1, {
    get: (target, key, receiver) => {
      if (key !== 'prepare') return Reflect.get(target, key, receiver);
      return (sql: string) => {
        const entry: RecordedStatement = { sql, params: [] };
        statements.push(entry);
        return record(inner.prepare(sql), entry);
      };
    },
  }) as D1Database;
  return { ...test, d1, statements };
};
