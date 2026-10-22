import { defineConfig } from 'oxlint';

export default defineConfig({
  categories: { correctness: 'error' },
  plugins: ['eslint', 'typescript', 'oxc', 'import', 'react'],
  env: { builtin: true, browser: true, node: true },
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
  ],
  rules: {
    'typescript/no-explicit-any': 'error',
    'import/no-cycle': 'error',
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',
    'react/button-has-type': 'error',
    'react/no-array-index-key': 'error',
    'no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
});
