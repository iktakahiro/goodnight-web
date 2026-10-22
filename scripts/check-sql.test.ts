import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  findSqlViolations,
  isAllowlisted,
  scanRepository,
} from './check-sql.ts';

const rules = (source: string) =>
  findSqlViolations('packages/server/src/x.ts', source).map((v) => v.rule);

describe('check-sql', () => {
  test.each([
    ['sql.raw(`limit ${n}`)', 'sql.raw('],
    ['sql .raw (text)', 'sql.raw('],
    ['sql\n  .raw(text)', 'sql.raw('],
    ["sql['raw'](text)", 'sql.raw('],
    ['env.DB.prepare(`SELECT * FROM t LIMIT ${n}`)', '.prepare('],
    ['c.env.DB\n  .prepare("SELECT 1")', '.prepare('],
    ['db.$client.exec("DROP TABLE t")', '$client'],
  ])('flags %p', (source, rule) => {
    expect(rules(source)).toContain(rule);
  });

  test.each([
    'sql`select ${table.id} from ${table} where id = ${id}`',
    'db.select().from(submissions).limit(limit).offset(offset)',
    'const rawValue = 1; prepared(); sqlRaw();',
  ])('allows %p', (source) => {
    expect(rules(source)).toEqual([]);
  });

  test('reports the line of a match', () => {
    const [violation] = findSqlViolations(
      'packages/server/src/x.ts',
      'const a = 1;\n\nawait db.prepare("x");\n',
    );
    expect(violation?.line).toBe(3);
  });

  test('allowlists test helpers, tests, and the e2e harness only', () => {
    expect(isAllowlisted('packages/server/src/testing/sqlite-d1.ts')).toBe(
      true,
    );
    expect(isAllowlisted('packages/server/src/features/a/a.test.ts')).toBe(
      true,
    );
    expect(isAllowlisted('packages/server/e2e/support.ts')).toBe(true);
    expect(
      isAllowlisted('packages/server/src/features/submissions/store.ts'),
    ).toBe(false);
    expect(isAllowlisted('packages/server/src/db/database.ts')).toBe(false);
  });

  test('the repository has no violations', () => {
    expect(scanRepository(join(import.meta.dir, '..'))).toEqual([]);
  });
});
