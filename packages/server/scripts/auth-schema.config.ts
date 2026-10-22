// Config for the Better Auth CLI only. It generates the SQL for the Better
// Auth tables (docs/decisions/0002). An empty in-memory SQLite database makes
// the CLI print the full schema; point it at a SQLite file with the existing
// migrations applied to get only the difference after a Better Auth upgrade.
//
// npx --yes auth@<better-auth version> generate \
//   --config scripts/auth-schema.config.ts \
//   --output migrations/NNNN_better_auth_<change>.sql --yes
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { DatabaseSync } from 'node:sqlite';

/** Better Auth options with the same plugins and tables as the Worker. */
export const auth = betterAuth({
  baseURL: 'http://localhost:8787',
  database: new DatabaseSync(':memory:'),
  emailAndPassword: { enabled: false },
  plugins: [passkey()],
});
