/**
 * An API call that did not succeed. `code` is the API's error code (for
 * example `unauthorized` or `setup_closed`), `network_error` when the server
 * could not be reached, or `server_error` for an unexpected body.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Per-field codes of an `invalid_input` error, when the API sent them. */
  readonly fields: Readonly<Record<string, string>> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Reads `{ error: { code, message, fields? } }` from an error response
 * body. Returns `null` for anything else. Only string field codes are kept.
 */
export const parseErrorBody = (
  body: unknown,
): {
  code: string;
  message: string;
  fields?: Record<string, string>;
} | null => {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return null;
  }
  const { error } = body;
  if (typeof error !== 'object' || error === null) return null;
  const code = 'code' in error ? error.code : undefined;
  const message = 'message' in error ? error.message : undefined;
  if (typeof code !== 'string') return null;
  const rawFields = 'fields' in error ? error.fields : undefined;
  const fields: Record<string, string> = {};
  if (typeof rawFields === 'object' && rawFields !== null) {
    for (const [key, value] of Object.entries(rawFields)) {
      if (typeof value === 'string') fields[key] = value;
    }
  }
  return {
    code,
    message: typeof message === 'string' ? message : code,
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  };
};

/**
 * Calls the site's own API with the session cookie and returns the JSON body.
 *
 * The admin UI and the API ship in the same package version
 * (docs/decisions/0004), so a successful body is typed as `T` without
 * runtime validation. Error bodies are checked with {@link parseErrorBody}.
 *
 * @throws {ApiError} for a non-2xx status or when the request fails.
 */
export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'network error');
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: handled below.
  }
  if (!response.ok) {
    const error = parseErrorBody(body);
    throw new ApiError(
      response.status,
      error?.code ?? 'server_error',
      error?.message ?? `HTTP ${response.status}`,
      error?.fields,
    );
  }
  if (body === null) {
    throw new ApiError(response.status, 'server_error', 'empty response');
  }
  return body as T;
};
