import { ORIGIN, type TestWorker } from './test-worker.ts';

// A software WebAuthn authenticator for tests: ES256 keys, "none"
// attestation, user presence and verification always set. It lets tests run
// Better Auth's real passkey registration and sign-in endpoints.

type Bytes = Uint8Array<ArrayBuffer>;

type Cbor = number | string | Bytes | Map<Cbor, Cbor>;

const concat = (...parts: Bytes[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const cborHead = (major: number, length: number): Bytes => {
  if (length < 24) return Uint8Array.of((major << 5) | length);
  if (length < 0x100) return Uint8Array.of((major << 5) | 24, length);
  return Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff);
};

const cbor = (value: Cbor): Bytes => {
  if (typeof value === 'number') {
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return concat(cborHead(3, bytes.length), bytes);
  }
  if (value instanceof Uint8Array) {
    return concat(cborHead(2, value.length), value);
  }
  return concat(
    cborHead(5, value.size),
    ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]),
  );
};

const base64url = (bytes: Bytes): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const sha256 = async (bytes: Bytes): Promise<Bytes> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

// WebAuthn signatures are DER-encoded; WebCrypto returns raw r || s.
const derInteger = (raw: Bytes): Bytes => {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0) start++;
  let bytes = raw.slice(start);
  if ((bytes[0] ?? 0) & 0x80) bytes = concat(Uint8Array.of(0), bytes);
  return concat(Uint8Array.of(0x02, bytes.length), bytes);
};

const toDer = (raw: Bytes): Bytes => {
  const body = concat(derInteger(raw.slice(0, 32)), derInteger(raw.slice(32)));
  return concat(Uint8Array.of(0x30, body.length), body);
};

/** Keeps cookies across requests, like a browser for one origin. */
export class CookieJar {
  readonly #cookies = new Map<string, string>();

  constructor(header = '') {
    for (const part of header.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name) this.#cookies.set(name, rest.join('='));
    }
  }

  /** Stores the `Set-Cookie` headers of a response. */
  store(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const [name = '', ...rest] = pair.split('=');
      const value = rest.join('=');
      if (value === '' || /max-age=0/i.test(line)) this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }

  /** The `Cookie` request header. */
  header(): string {
    return [...this.#cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

interface Credential {
  id: Bytes;
  keys: CryptoKeyPair;
  userHandle: string;
  counter: number;
}

const rpHash = () => sha256(new TextEncoder().encode(new URL(ORIGIN).hostname));

const clientData = (type: string, challenge: string) =>
  new TextEncoder().encode(
    JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }),
  );

/**
 * A software passkey authenticator bound to the test origin. One instance
 * holds the credentials it registered.
 */
export class SoftAuthenticator {
  readonly #credentials: Credential[] = [];

  /**
   * Registers a passkey through `/api/auth/passkey/generate-register-options`
   * and `/verify-registration`, with the session in `jar`.
   *
   * @returns The verify-registration response. Its cookies are stored in
   *   `jar`.
   */
  async register(
    worker: TestWorker,
    jar: CookieJar,
    { createSession = false } = {},
  ): Promise<Response> {
    const optionsResponse = await worker.fetch(
      '/api/auth/passkey/generate-register-options',
      { headers: { cookie: jar.header() } },
    );
    if (optionsResponse.status !== 200) return optionsResponse;
    jar.store(optionsResponse);
    const options = (await optionsResponse.json()) as {
      challenge: string;
      user: { id: string };
    };
    const keys = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const raw = new Uint8Array(
      await crypto.subtle.exportKey('raw', keys.publicKey),
    );
    const coseKey = cbor(
      new Map<Cbor, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, raw.slice(1, 33)],
        [-3, raw.slice(33, 65)],
      ]),
    );
    const id = crypto.getRandomValues(new Uint8Array(16));
    const authData = concat(
      await rpHash(),
      Uint8Array.of(0x45), // user present, user verified, attested data
      new Uint8Array(4),
      new Uint8Array(16),
      Uint8Array.of(0, id.length),
      id,
      coseKey,
    );
    const attestationObject = cbor(
      new Map<Cbor, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    const response = await worker.fetch(
      '/api/auth/passkey/verify-registration',
      {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          cookie: jar.header(),
        },
        body: JSON.stringify({
          response: {
            id: base64url(id),
            rawId: base64url(id),
            type: 'public-key',
            response: {
              clientDataJSON: base64url(
                clientData('webauthn.create', options.challenge),
              ),
              attestationObject: base64url(attestationObject),
              transports: ['internal'],
            },
            clientExtensionResults: {},
          },
          name: 'test',
          ...(createSession ? { createSession: true } : {}),
        }),
      },
    );
    jar.store(response);
    if (response.status === 200) {
      this.#credentials.push({
        id,
        keys,
        userHandle: options.user.id,
        counter: 0,
      });
    }
    return response;
  }

  /**
   * Signs in through `/api/auth/passkey/generate-authenticate-options` and
   * `/verify-authentication` with the most recently registered passkey.
   *
   * @returns The verify-authentication response. Its cookies are stored in
   *   `jar`.
   */
  async signIn(worker: TestWorker, jar: CookieJar): Promise<Response> {
    const credential = this.#credentials.at(-1);
    if (!credential) throw new Error('no passkey registered');
    const optionsResponse = await worker.fetch(
      '/api/auth/passkey/generate-authenticate-options',
      { headers: { cookie: jar.header() } },
    );
    if (optionsResponse.status !== 200) return optionsResponse;
    jar.store(optionsResponse);
    const { challenge } = (await optionsResponse.json()) as {
      challenge: string;
    };
    credential.counter++;
    const counter = credential.counter;
    const authData = concat(
      await rpHash(),
      Uint8Array.of(0x05), // user present, user verified
      Uint8Array.of(counter >>> 24, counter >>> 16, counter >>> 8, counter),
    );
    const data = clientData('webauthn.get', challenge);
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        credential.keys.privateKey,
        concat(authData, await sha256(data)),
      ),
    );
    const response = await worker.fetch(
      '/api/auth/passkey/verify-authentication',
      {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          cookie: jar.header(),
        },
        body: JSON.stringify({
          response: {
            id: base64url(credential.id),
            rawId: base64url(credential.id),
            type: 'public-key',
            response: {
              clientDataJSON: base64url(data),
              authenticatorData: base64url(authData),
              signature: base64url(toDer(signature)),
              userHandle: credential.userHandle,
            },
            clientExtensionResults: {},
          },
        }),
      },
    );
    jar.store(response);
    return response;
  }
}
