import type { AdminFile } from './admin-file.ts';
import { adminFiles } from './admin-files.gen.ts';

const INDEX = '/admin/index.html';
const HAS_EXTENSION = /\.[a-z0-9]+$/i;
const ASSETS_PREFIX = '/admin/assets/';

// Decoded binary files, kept for the life of the isolate.
const decoded = new WeakMap<AdminFile, Uint8Array<ArrayBuffer>>();

const fileBody = (file: AdminFile): string | Uint8Array<ArrayBuffer> => {
  if (file.encoding !== 'base64') return file.body;
  let bytes = decoded.get(file);
  if (!bytes) {
    const binary = atob(file.body);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    decoded.set(file, bytes);
  }
  return bytes;
};

/**
 * Serves an embedded admin UI file.
 *
 * - Paths without a file extension (SPA routes such as
 *   `/admin/inquiries/abc`) and `/admin` get `index.html`, except under
 *   `/admin/assets/`.
 * - Files under `/admin/assets/` have hashed names and are cached for a year
 *   as immutable; everything else is `no-cache`.
 * - `If-None-Match` with the current ETag returns 304.
 * - A missing file with an extension, and any missing path under
 *   `/admin/assets/`, returns 404 with `no-store`, so a browser never keeps
 *   the SPA shell under an immutable asset URL.
 * - Binary files (`encoding: 'base64'`) are decoded and sent as bytes.
 */
export const serveAdminFile = (
  request: Request,
  files: Readonly<Record<string, AdminFile>> = adminFiles,
): Response => {
  const { pathname } = new URL(request.url);
  const isAsset = pathname.startsWith(ASSETS_PREFIX);
  const file =
    files[pathname] ??
    (isAsset || HAS_EXTENSION.test(pathname) ? undefined : files[INDEX]);
  if (!file) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  const headers = {
    'Content-Type': file.type,
    ETag: file.etag,
    'Cache-Control': isAsset
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  };
  if (request.headers.get('if-none-match') === file.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : fileBody(file), {
    headers,
  });
};
