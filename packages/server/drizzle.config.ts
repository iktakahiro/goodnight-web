// drizzle-kit config. `bun run db:generate` writes a new SQL migration to
// migrations/ from src/db/schema.ts; wrangler applies it with
// `wrangler d1 migrations apply DB` (docs/decisions/0005).
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});
