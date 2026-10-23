// Percent-decodes `value`. Invalid sequences are kept as they are.
const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value.replace(/%[0-9a-f]{2}/gi, (match) => {
      try {
        return decodeURIComponent(match);
      } catch {
        return match;
      }
    });
  }
};

/**
 * Normalizes a URL pathname for classification: percent-decodes it (up to
 * three times, for double encoding), turns backslashes into slashes, drops
 * empty and `.` segments, resolves `..`, and lowercases it.
 *
 * Hono routes on a decoded path, and the raw pathname can differ from it
 * (`/%61dmin` routes as `/admin`). Classifying the normalized path makes sure
 * every spelling that could reach a route gets the same treatment. The
 * result is used only to decide which rules apply, never to route.
 */
export const normalizePath = (pathname: string): string => {
  let path = pathname;
  for (let i = 0; i < 3; i++) {
    const decoded = decode(path);
    if (decoded === path) break;
    path = decoded;
  }
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join('/')}`.toLowerCase();
};

/**
 * Which part of the Worker a request path belongs to:
 *
 * - `admin-ui`: `/admin` and `/admin/*`;
 * - `admin-api`: `/api/admin/*`;
 * - `setup`: `/api/setup`;
 * - `auth`: `/api/auth/*` (Better Auth);
 * - `api`: any other `/api/*` path (the contact API);
 * - `site`: everything else (Static Assets).
 */
export type PathArea =
  | 'admin-ui'
  | 'admin-api'
  | 'setup'
  | 'auth'
  | 'api'
  | 'site';

const under = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

const classify = (path: string): PathArea => {
  if (under(path, '/admin')) return 'admin-ui';
  if (under(path, '/api/admin')) return 'admin-api';
  if (under(path, '/api/setup')) return 'setup';
  if (under(path, '/api/auth')) return 'auth';
  if (under(path, '/api')) return 'api';
  return 'site';
};

/** Classifies a raw URL pathname after {@link normalizePath}. */
export const pathArea = (pathname: string): PathArea =>
  classify(normalizePath(pathname));

/**
 * Classifies a request. The path Hono routes on (`c.req.path`) decides first,
 * because it picks the handler: `/admin/..%2f` is routed to the admin UI
 * although it normalizes to `/`. Otherwise the normalized raw pathname
 * decides ({@link pathArea}), so a spelling that Hono does not route
 * (`//admin`, `/API/admin`) but that a proxy or asset handler might treat as
 * the plain path still gets the rules of that area.
 *
 * @param url - The request URL (`c.req.url`).
 * @param routedPath - The decoded path Hono routes on (`c.req.path`).
 */
export const requestArea = (url: string, routedPath: string): PathArea => {
  const routed = classify(routedPath);
  return routed === 'site' ? pathArea(new URL(url).pathname) : routed;
};

/**
 * Returns whether the area holds admin credentials or admin data: the admin
 * UI, the admin API, setup, and Better Auth. These require Cloudflare
 * Access when it is configured.
 */
export const isAdminArea = (area: PathArea): boolean =>
  area === 'admin-ui' ||
  area === 'admin-api' ||
  area === 'setup' ||
  area === 'auth';
