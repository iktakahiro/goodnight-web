import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import * as z from 'zod';
import type { GoodnightEnv } from '../../env.ts';
import { isAdminEmail } from '../auth/admin-emails.ts';
import { isSetupClosed } from './setup-state.ts';

/**
 * Better Auth plugin with one server-only endpoint, `createFirstAdmin`, that
 * creates (or reuses) the first admin user and signs it in, so the browser can
 * register a passkey next.
 *
 * Better Auth has no public API that creates a user and a session when email
 * and password sign-in is disabled; an endpoint inside Better Auth lets Better
 * Auth sign the session cookie itself. The endpoint is `SERVER_ONLY`: it is
 * not reachable under `/api/auth/*` and only `POST /api/setup` calls it, after
 * the token, origin, and rate-limit checks. It checks the allowlist and the
 * closed state again here.
 */
export const createSetupPlugin = (env: GoodnightEnv) =>
  ({
    id: 'goodnight-setup',
    endpoints: {
      createFirstAdmin: createAuthEndpoint(
        '/goodnight-setup/create-first-admin',
        {
          method: 'POST',
          body: z.object({
            email: z.email(),
            name: z.string().min(1).max(100),
          }),
          metadata: { SERVER_ONLY: true },
        },
        async (ctx) => {
          const email = ctx.body.email.trim().toLowerCase();
          if (!isAdminEmail(env.ADMIN_EMAILS, email)) {
            throw new APIError('FORBIDDEN', { message: 'email not allowed' });
          }
          if (await isSetupClosed(env.DB)) {
            throw new APIError('FORBIDDEN', { message: 'setup closed' });
          }
          const adapter = ctx.context.internalAdapter;
          const user =
            (await adapter.findUserByEmail(email))?.user ??
            (await adapter.createUser(
              { email, name: ctx.body.name, emailVerified: true },
              { method: 'goodnight-setup' },
            ));
          const session = await adapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ userId: user.id });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
