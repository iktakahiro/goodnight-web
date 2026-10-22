// Config for the Better Auth CLI only. It generates the Drizzle table
// definitions for the Better Auth tables, which are then kept in
// src/db/schema.ts (docs/decisions/0005). The adapter is never connected, so
// an empty object stands in for the Drizzle database.
//
// npx --yes auth@<better-auth version> generate \
//   --config scripts/auth-schema.config.ts --output <tmp>/auth-schema.ts --yes
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

/** Better Auth options with the same plugins and tables as the Worker. */
export const auth = betterAuth({
  baseURL: 'http://localhost:8787',
  database: drizzleAdapter({}, { provider: 'sqlite' }),
  emailAndPassword: { enabled: false },
  plugins: [passkey()],
});
