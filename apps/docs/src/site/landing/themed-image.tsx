import { sitePath } from '../paths';

/**
 * A screenshot with a light and a dark file, `<path>-light.webp` and
 * `<path>-dark.webp`. `landing.css` shows one of them under Fumadocs' `.dark`
 * class, which follows the theme switch rather than the system setting. Both
 * images are lazy, so the hidden one is not downloaded.
 *
 * @param path - Site path without the scheme suffix, for example
 *   `images/admin/inquiry-list-en`.
 */
export function ThemedImage({
  path,
  alt,
  width,
  height,
}: {
  path: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <>
      {(['light', 'dark'] as const).map((scheme) => (
        <img
          key={scheme}
          className={`themed-image themed-image-${scheme}`}
          src={sitePath(`${path}-${scheme}.webp`)}
          alt={alt}
          width={width}
          height={height}
          loading='lazy'
          decoding='async'
        />
      ))}
    </>
  );
}
