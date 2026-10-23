/**
 * Reads a request body as bytes, stopping once it exceeds `maxBytes`.
 *
 * Checks `Content-Length` first and then counts the bytes actually read, so a
 * missing or false header (a chunked body, for example) cannot bypass the
 * limit. The stream is cancelled as soon as the count passes `maxBytes`.
 *
 * @returns The body bytes (empty when there is no body), or `null` when the
 *   body is larger than `maxBytes`.
 */
export const readBytesWithLimit = async (
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> => {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

/**
 * Reads a request body as text, stopping once it exceeds `maxBytes`
 * ({@link readBytesWithLimit}).
 *
 * @returns The body text, or `null` when the body is larger than `maxBytes`.
 */
export const readBodyWithLimit = async (
  request: Request,
  maxBytes: number,
): Promise<string | null> => {
  const bytes = await readBytesWithLimit(request, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
};

/**
 * Returns whether a `Content-Type` value is exactly the `application/json`
 * media type. Parameters such as `charset=utf-8` are allowed; any other type,
 * including one that only contains `application/json` (such as
 * `multipart/form-data-application/json`), is not.
 */
export const isJsonContentType = (value: string | null | undefined): boolean =>
  (value ?? '').split(';', 1)[0]?.trim().toLowerCase() === 'application/json';

/**
 * Returns whether the request's `Origin` header is the request's own origin.
 * A missing `Origin` is rejected. The APIs are same-origin only and send no
 * CORS headers.
 */
export const isAllowedOrigin = (request: Request): boolean =>
  request.headers.get('origin') === new URL(request.url).origin;
