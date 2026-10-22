const encoder = new TextEncoder();

type SubtleWithTimingSafeEqual = SubtleCrypto & {
  timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
};

/**
 * Compares two strings without leaking where they differ.
 *
 * Uses `crypto.subtle.timingSafeEqual` from workerd when available. Strings of
 * different lengths return `false` immediately; only the length leaks.
 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  const subtle = crypto.subtle as SubtleWithTimingSafeEqual;
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(left, right);
  }
  let diff = 0;
  for (let i = 0; i < left.byteLength; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
};

/** Returns `HMAC-SHA256(message, secret)` as lowercase hex. */
export const hmacSha256Hex = async (
  secret: string,
  message: string,
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
