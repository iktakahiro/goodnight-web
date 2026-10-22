import type { D1Database } from '@cloudflare/workers-types';
import { desc, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import { formDefinitions } from '../../db/schema.ts';
import {
  storedFormDefinitionSchema,
  type FormDefinition,
} from './form-definition.ts';

/** One saved version of the form. */
export interface FormVersion {
  version: number;
  definition: FormDefinition;
  createdAt: number;
  /** Email of the admin who saved it; `null` for the built-in version 1. */
  createdBy: string | null;
  /** The version this one restored, or `null`. */
  restoredFrom: number | null;
}

/** A version in the history list, without its definition. */
export type FormVersionSummary = Omit<FormVersion, 'definition'> & {
  fieldCount: number;
};

/** Versions listed by {@link listFormHistory}. */
export const FORM_HISTORY_LIMIT = 50;

type Row = typeof formDefinitions.$inferSelect;

const toVersion = (row: Row): FormVersion => ({
  version: row.version,
  definition: storedFormDefinitionSchema.parse(row.definition),
  createdAt: row.createdAt,
  createdBy: row.createdBy,
  restoredFrom: row.restoredFrom,
});

// Versions never change once saved (triggers refuse UPDATE and DELETE), so a
// parsed version can stay in memory for the life of the isolate. The cache is
// keyed by the D1 binding, so each database has its own.
const versionCache = new WeakMap<D1Database, Map<number, FormVersion>>();

const cacheFor = (db: D1Database): Map<number, FormVersion> => {
  let cache = versionCache.get(db);
  if (!cache) {
    cache = new Map();
    versionCache.set(db, cache);
  }
  return cache;
};

/** Thrown when the table has no version (migrations were not applied). */
export class MissingFormError extends Error {
  constructor() {
    super('form_definitions has no version; apply the migrations');
    this.name = 'MissingFormError';
  }
}

/**
 * Returns the current form: the highest version. Reads only the version
 * number when that version is already in memory, so the contact API checks
 * for edits on every request with one small query.
 *
 * @throws {MissingFormError} when no version exists.
 */
export const getCurrentForm = async (db: D1Database): Promise<FormVersion> => {
  const orm = getDatabase(db);
  const latest = await orm
    .select({ version: formDefinitions.version })
    .from(formDefinitions)
    .orderBy(desc(formDefinitions.version))
    .limit(1)
    .get();
  if (!latest) throw new MissingFormError();
  const cached = cacheFor(db).get(latest.version);
  if (cached) return cached;
  const version = await getFormVersion(db, latest.version);
  if (!version) throw new MissingFormError();
  return version;
};

/** Returns one version, or `null` when it does not exist. */
export const getFormVersion = async (
  db: D1Database,
  version: number,
): Promise<FormVersion | null> => {
  const cache = cacheFor(db);
  const cached = cache.get(version);
  if (cached) return cached;
  const row = await getDatabase(db)
    .select()
    .from(formDefinitions)
    .where(eq(formDefinitions.version, version))
    .get();
  if (!row) return null;
  const parsed = toVersion(row);
  cache.set(version, parsed);
  return parsed;
};

// D1 refuses a statement with more than 100 bound parameters.
const VERSIONS_PER_QUERY = 100;

/**
 * Returns the given versions, by number. Versions that do not exist are left
 * out. Reads the missing ones in queries of at most 100 versions each, the
 * D1 limit on bound parameters.
 */
export const getFormVersions = async (
  db: D1Database,
  versions: Iterable<number>,
): Promise<Map<number, FormVersion>> => {
  const cache = cacheFor(db);
  const wanted = [...new Set(versions)];
  const missing = wanted.filter((version) => !cache.has(version));
  for (let start = 0; start < missing.length; start += VERSIONS_PER_QUERY) {
    const rows = await getDatabase(db)
      .select()
      .from(formDefinitions)
      .where(
        inArray(
          formDefinitions.version,
          missing.slice(start, start + VERSIONS_PER_QUERY),
        ),
      );
    for (const row of rows) cache.set(row.version, toVersion(row));
  }
  const found = new Map<number, FormVersion>();
  for (const version of wanted) {
    const entry = cache.get(version);
    if (entry) found.set(version, entry);
  }
  return found;
};

/** The newest {@link FORM_HISTORY_LIMIT} versions, newest first. */
export const listFormHistory = async (
  db: D1Database,
): Promise<FormVersionSummary[]> => {
  const rows = await getDatabase(db)
    .select()
    .from(formDefinitions)
    .orderBy(desc(formDefinitions.version))
    .limit(FORM_HISTORY_LIMIT);
  return rows.map((row) => {
    const { definition, ...summary } = toVersion(row);
    return { ...summary, fieldCount: definition.fields.length };
  });
};

/**
 * Saves `definition` as version `baseVersion + 1`.
 *
 * @returns The new version, or `null` when that version already exists:
 *   someone else saved first, and the caller should reload.
 */
export const insertFormVersion = async (
  db: D1Database,
  {
    baseVersion,
    definition,
    createdBy,
    restoredFrom = null,
    now = Date.now(),
  }: {
    baseVersion: number;
    definition: FormDefinition;
    createdBy: string;
    restoredFrom?: number | null;
    now?: number;
  },
): Promise<FormVersion | null> => {
  const version = baseVersion + 1;
  const result = await getDatabase(db)
    .insert(formDefinitions)
    .values({ version, definition, createdAt: now, createdBy, restoredFrom })
    .onConflictDoNothing({ target: formDefinitions.version });
  if (result.meta.changes === 0) return null;
  const saved: FormVersion = {
    version,
    definition,
    createdAt: now,
    createdBy,
    restoredFrom,
  };
  cacheFor(db).set(version, saved);
  return saved;
};
