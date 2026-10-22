import type { ReactNode } from 'react';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import screens from './admin-screens.json';
import { sitePath } from './paths';
import './admin-screen.css';

/**
 * An admin screen figure. `bun run screenshots:docs` in `packages/server`
 * writes the images to `public/images/admin/` and their sizes to
 * `admin-screens.json`.
 */
export type AdminScreenName = keyof typeof screens;

/**
 * Shows an admin UI screenshot in the page's language. The light image shows
 * by default and the dark image under Fumadocs' `.dark` class, with CSS only.
 * The figure is never wider than the screenshot's CSS size or the column.
 *
 * @param name - The screen, for example `inquiry-list`.
 * @param alt - What the screenshot shows, in the page's language.
 * @param caption - Optional text under the image.
 * @param locale - The admin UI language; defaults to the page's language.
 */
export function AdminScreen({
  name,
  alt,
  caption,
  locale,
}: {
  name: AdminScreenName;
  alt: string;
  caption?: ReactNode;
  locale?: 'en' | 'ja';
}) {
  const page = useI18n().locale;
  const language = locale ?? (page === 'ja' ? 'ja' : 'en');
  const { width, height } = screens[name][language];
  const image = (scheme: 'light' | 'dark') => (
    <img
      className={`admin-screen-${scheme}`}
      src={sitePath(`images/admin/${name}-${language}-${scheme}.webp`)}
      alt={alt}
      width={width}
      height={height}
      loading='lazy'
      decoding='async'
    />
  );
  return (
    <figure className='admin-screen' style={{ maxWidth: `${width}px` }}>
      {image('light')}
      {image('dark')}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
