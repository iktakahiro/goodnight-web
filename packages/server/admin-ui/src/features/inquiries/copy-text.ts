/**
 * Writes `text` to the system clipboard.
 *
 * @returns `true` when the browser accepted the text, `false` when the
 * clipboard is unavailable (an insecure page, no permission) or the write was
 * refused. It never throws.
 */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
