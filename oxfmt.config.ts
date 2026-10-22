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
    'bun.lock',
  ],
});
