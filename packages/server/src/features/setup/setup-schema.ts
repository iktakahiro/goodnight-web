import * as z from 'zod';

/**
 * Body of `POST /api/setup`: the `SETUP_TOKEN` value (`APP_SECRET` when
 * `SETUP_TOKEN` is not set), an address in
 * `ADMIN_EMAILS`, and an optional display name. The admin UI validates its
 * setup form with the same schema before sending it.
 */
export const setupInputSchema = z.object({
  token: z.string().min(1).max(512),
  email: z.string().trim().pipe(z.email().max(254)),
  name: z.string().trim().max(100).optional(),
});

/** Input of {@link setupInputSchema}, as the setup form sends it. */
export type SetupInput = z.input<typeof setupInputSchema>;
