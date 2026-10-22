import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';
import { AUTH_BASE_PATH } from '../../../../src/features/auth/auth-paths.ts';

/** Better Auth client for passkey registration, sign-in, and sign-out. */
export const authClient = createAuthClient({
  basePath: AUTH_BASE_PATH,
  plugins: [passkeyClient()],
});
