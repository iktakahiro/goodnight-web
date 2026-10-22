import * as z from 'zod';

/**
 * Search parameters of the sign-in screen. `next` is the admin path to return
 * to; check it with `safeNextPath` before use.
 */
export const loginSearchSchema = z.object({
  next: z.string().optional().catch(undefined),
});
