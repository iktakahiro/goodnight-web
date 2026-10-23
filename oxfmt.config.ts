import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  jsxSingleQuote: true,
  semi: true,
  trailingComma: 'all',
  tabWidth: 2,
  printWidth: 80,
  endOfLine: 'lf',
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.astro/**',
    '**/.output/**',
    '**/.tanstack/**',
    '**/.turbo/**',
    '**/.wrangler/**',
    '**/coverage/**',
    '**/*.gen.ts',
    '**/worker-configuration.d.ts',
    'packages/server/e2e/public/app.js',
    // drizzle-kit owns its migration metadata.
    'packages/server/migrations/meta/**',
    // Vendored agent skills are kept byte-for-byte with upstream.
    '.agents/skills/**',
    '.claude/skills/**',
    'bun.lock',
    // npm writes the starter lockfile (docs/starter.md).
    'templates/starter/package-lock.json',
  ],
});
