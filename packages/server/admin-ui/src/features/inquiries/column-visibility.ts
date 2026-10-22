import type { AdminListColumn } from '../../../../src/features/admin-api/admin-routes.ts';
import { isFieldId } from '../../../../src/features/contact-form/form-definition.ts';

/** `localStorage` key of the list's column choices in this browser. */
export const COLUMN_VISIBILITY_KEY = 'goodnight-admin-list-columns';

/** Columns the admin chose to show (`true`) or hide (`false`), by field id. */
export type ColumnChoices = Record<string, boolean>;

/**
 * Reads the saved column choices. Anything that is not a boolean under a
 * field id is ignored, so a damaged value never breaks the list.
 */
export const parseColumnChoices = (raw: string | null): ColumnChoices => {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const choices: ColumnChoices = {};
  for (const [key, shown] of Object.entries(value)) {
    if (isFieldId(key) && typeof shown === 'boolean') choices[key] = shown;
  }
  return choices;
};

/** The saved choices in this browser; empty when storage is unavailable. */
export const readColumnChoices = (): ColumnChoices => {
  try {
    return parseColumnChoices(localStorage.getItem(COLUMN_VISIBILITY_KEY));
  } catch {
    return {};
  }
};

/** Saves the choices. Storage errors (private mode, full) are ignored. */
export const storeColumnChoices = (choices: ColumnChoices): void => {
  try {
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(choices));
  } catch {
    // The choice then lasts until the page is reloaded.
  }
};

/**
 * Which field columns are visible: the admin's choice for a field when there
 * is one, otherwise the field's `showInList` default. Choices for fields that
 * are not on the current form are ignored.
 */
export const columnVisibility = (
  columns: readonly AdminListColumn[],
  choices: ColumnChoices,
): Record<string, boolean> =>
  Object.fromEntries(
    columns.map((column) => [
      column.id,
      Object.hasOwn(choices, column.id)
        ? (choices[column.id] ?? column.showInList)
        : column.showInList,
    ]),
  );
