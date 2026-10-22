import type { GoodnightEnv } from './env.ts';
import type { ResolvedOptions } from './options.ts';

/** Hono type parameters shared by every route in the package. */
export interface HonoEnv {
  Bindings: GoodnightEnv;
  Variables: {
    options: ResolvedOptions;
    /** Set by the admin auth middleware for authenticated admin routes. */
    admin: { userId: string; email: string; name: string };
  };
}
