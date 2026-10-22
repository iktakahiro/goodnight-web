/** One prebuilt admin UI file embedded in the Worker bundle. */
export interface AdminFile {
  /** `Content-Type` header value. */
  type: string;
  /** Strong ETag derived from the content. */
  etag: string;
  /** The file content: text, or base64 when `encoding` is `base64`. */
  body: string;
  /** `base64` for binary files such as PNG and ICO images. */
  encoding?: 'base64';
}
