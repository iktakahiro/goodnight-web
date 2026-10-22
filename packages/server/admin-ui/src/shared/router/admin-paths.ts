/** Base path of the admin UI. Must match `base` in vite.config.ts. */
export const ADMIN_BASE = '/admin';

/**
 * Turns a router href (`/inquiries/01J?x=1`, relative to {@link ADMIN_BASE})
 * into the path the browser shows (`/admin/inquiries/01J?x=1`).
 */
export const toAdminPath = (href: string): string =>
  href === '/' || href.startsWith('/?')
    ? `${ADMIN_BASE}${href.slice(1)}`
    : `${ADMIN_BASE}${href}`;

/**
 * Turns an admin path from {@link safeNextPath} back into a router href, the
 * inverse of {@link toAdminPath}.
 */
export const toRouterHref = (adminPath: string): string => {
  const rest = adminPath.slice(ADMIN_BASE.length);
  return rest.startsWith('/') ? rest : `/${rest}`;
};

/**
 * Returns `value` when it is a same-site admin path, otherwise the list. Use
 * it for the `next` parameter of the sign-in screen, so the parameter cannot
 * send the user to another site.
 */
export const safeNextPath = (value: unknown): string =>
  typeof value === 'string' && isAdminPath(value) ? value : ADMIN_BASE;

const isAdminPath = (value: string): boolean =>
  (value === ADMIN_BASE ||
    value.startsWith(`${ADMIN_BASE}/`) ||
    value.startsWith(`${ADMIN_BASE}?`)) &&
  !value.startsWith('//') &&
  !value.includes('\\');

/**
 * Router rewrite between browser URLs and router paths: the admin UI's
 * basepath. The router's own `basepath` option writes the list as
 * `/admin/`; this keeps it at `/admin`, the URL the Worker and the
 * notifications use. Paths outside {@link ADMIN_BASE} are left unchanged.
 */
export const adminBasepathRewrite = {
  input: ({ url }: { url: URL }): URL => {
    const { pathname } = url;
    if (pathname === ADMIN_BASE || pathname.startsWith(`${ADMIN_BASE}/`)) {
      url.pathname = toRouterHref(pathname);
    }
    return url;
  },
  output: ({ url }: { url: URL }): URL => {
    url.pathname = toAdminPath(url.pathname);
    return url;
  },
};
