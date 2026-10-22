import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
} from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import * as z from 'zod';
import type { GoodnightEnv } from '../../env.ts';
import { isAdminEmail } from '../auth/admin-emails.ts';
import { afterPasskeyRegistration } from './first-passkey.ts';
import { isSetupClosed } from './setup-state.ts';

/**
 * Better Auth plugin with one server-only endpoint, `createFirstAdmin`, that
 * creates (or reuses) the first admin user and signs it in, so the browser can
 * register a passkey next. It also releases the setup claim of a passkey
 * registration that failed to save its passkey
 * ({@link afterPasskeyRegistration}).
 *
 * Better Auth has no public API that creates a user and a session when email
 * and password sign-in is disabled; an endpoint inside Better Auth lets Better
 * Auth sign the session cookie itself. The endpoint is `SERVER_ONLY`: it is
 * not reachable under `/api/auth/*` and only `POST /api/setup` calls it, after
 * the token, origin, and rate-limit checks. It checks the allowlist and the
 * closed state again here.
 *
 * Every earlier session of a reused user is deleted first, so a session from
 * an earlier setup run (perhaps by someone else who had the token) cannot
 * outlive this one. Registering the first passkey then claims setup and
 * deletes every session (`beforePasskeySaved`), and `requireAdmin` accepts
 * only sessions created after the user's first passkey.
 *
 * The endpoint checks that setup is open again after it creates the session.
 * A registration can claim setup and delete every session between the first
 * check and the insert; the second check then deletes the new session, so a
 * setup request in that window never gets a cookie.
 */
export const createSetupPlugin = (env: GoodnightEnv) =>
  ({
    id: 'goodnight-setup',
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === '/passkey/verify-registration',
          handler: createAuthMiddleware(async (ctx) => {
            await afterPasskeyRegistration(env.DB, ctx.context);
          }),
        },
      ],
    },
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
          const existing = (await adapter.findUserByEmail(email))?.user;
          if (existing) await adapter.deleteUserSessions(existing.id);
          const user =
            existing ??
            (await adapter.createUser(
              { email, name: ctx.body.name, emailVerified: true },
              { method: 'goodnight-setup' },
            ));
          const session = await adapter.createSession(user.id);
          if (await isSetupClosed(env.DB)) {
            await adapter.deleteSession(session.token);
            throw new APIError('FORBIDDEN', { message: 'setup closed' });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ userId: user.id });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
