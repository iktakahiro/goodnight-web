/** One prebuilt admin UI file embedded in the Worker bundle. */
export interface AdminFile {
  /** `Content-Type` header value. */
  type: string;
  /** Strong ETag derived from the content. */
  etag: string;
  body: string;
}
