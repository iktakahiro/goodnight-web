const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Creates a ULID: 26 characters, sortable by creation time.
 *
 * @param now - Unix time in milliseconds for the time part.
 */
export const ulid = (now: number = Date.now()): string => {
  let time = '';
  let rest = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET.charAt(rest % 32) + time;
    rest = Math.floor(rest / 32);
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  let tail = '';
  for (const byte of random) tail += ALPHABET.charAt(byte % 32);
  return time + tail;
};
