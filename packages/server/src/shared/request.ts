/**
 * Reads a request body as text, stopping once it exceeds `maxBytes`.
 *
 * Checks `Content-Length` first and then counts the bytes actually read, so a
 * missing or false header cannot bypass the limit.
 *
 * @returns The body text, or `null` when the body is larger than `maxBytes`.
 */
export const readBodyWithLimit = async (
  request: Request,
  maxBytes: number,
): Promise<string | null> => {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return '';
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
  return new TextDecoder().decode(bytes);
};

/**
 * Returns whether the request's `Origin` header is the request's own origin.
 * A missing `Origin` is rejected. The APIs are same-origin only and send no
 * CORS headers.
 */
export const isAllowedOrigin = (request: Request): boolean =>
  request.headers.get('origin') === new URL(request.url).origin;
