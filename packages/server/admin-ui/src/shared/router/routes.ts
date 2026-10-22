/** Every screen of the admin UI. */
export type Route =
  | { name: 'list' }
  | { name: 'detail'; id: string }
  | { name: 'login' }
  | { name: 'setup' }
  | { name: 'not-found' };

/** Base path of the admin UI. Must match `base` in vite.config.ts. */
export const ADMIN_BASE = '/admin';

const DETAIL = /^\/admin\/inquiries\/([^/]+)$/;

/**
 * Maps a pathname to a screen. A trailing slash is ignored. The inquiry ID in
 * `/admin/inquiries/<id>` (the link in Slack notifications) is URL-decoded.
 */
export const matchRoute = (pathname: string): Route => {
  const path =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  if (path === ADMIN_BASE) return { name: 'list' };
  if (path === `${ADMIN_BASE}/login`) return { name: 'login' };
  if (path === `${ADMIN_BASE}/setup`) return { name: 'setup' };
  const detail = DETAIL.exec(path);
  if (detail?.[1]) {
    try {
      return { name: 'detail', id: decodeURIComponent(detail[1]) };
    } catch {
      return { name: 'not-found' };
    }
  }
  return { name: 'not-found' };
};

/** Path of an inquiry's detail screen. */
export const detailPath = (id: string): string =>
  `${ADMIN_BASE}/inquiries/${encodeURIComponent(id)}`;

/**
 * Path of the sign-in screen that returns to `next` afterwards. `next` is
 * kept only when it is an admin path, so the parameter cannot send the user
 * to another site.
 */
export const loginPath = (next?: string): string =>
  next && isAdminPath(next) && next !== `${ADMIN_BASE}/login`
    ? `${ADMIN_BASE}/login?next=${encodeURIComponent(next)}`
    : `${ADMIN_BASE}/login`;

/** Returns `value` when it is a same-site admin path, otherwise the list. */
export const safeNextPath = (value: string | null): string =>
  value && isAdminPath(value) ? value : ADMIN_BASE;

const isAdminPath = (value: string): boolean =>
  (value === ADMIN_BASE ||
    value.startsWith(`${ADMIN_BASE}/`) ||
    value.startsWith(`${ADMIN_BASE}?`)) &&
  !value.startsWith('//') &&
  !value.includes('\\');
