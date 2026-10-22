// Writes the admin UI strings (shared and admin-only, per locale) to a JSON
// file that the package exports as `@goodnight-web/server/admin-messages.json`.
// End-to-end tests read button names and headings from it, so copy edits do
// not break them. JSON, not TypeScript: Node does not strip types from files
// under node_modules, and a site's e2e test runs on Node.
//
// Usage: bun scripts/build-admin-messages.ts
import { writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { uiMessages } from '../admin-ui/src/shared/i18n/admin-messages.ts';

const packageDir = resolve(import.meta.dir, '..');
const outFile = join(
  packageDir,
  'src/features/admin-ui/admin-messages.gen.json',
);

await writeFile(outFile, `${JSON.stringify(uiMessages, null, 2)}\n`);
console.log(`admin-ui: wrote ${relative(packageDir, outFile)}`);
