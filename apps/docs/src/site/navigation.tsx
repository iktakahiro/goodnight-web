import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import logoMark from '../assets/logo-mark.svg';
import { i18n, localeFromPath } from './i18n';

/** Returns the landing page path for the locale of a page slug. */
export function homePath(slug: string): string {
  const locale = localeFromPath(slug);
  return locale === i18n.defaultLanguage ? '/' : `/${locale}/`;
}

/**
 * Product navigation; Fumadocs supplies the locale selector and page tree.
 * There is no GitHub link yet because the repository is still private.
 */
export function layoutOptions(slug: string): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className='site-brand'>
          <img
            className='site-logo'
            src={logoMark}
            width={28}
            height={28}
            alt=''
          />
          <span className='site-name'>goodnight-web</span>
        </span>
      ),
      url: homePath(slug),
    },
    searchToggle: { enabled: false },
  };
}

/**
 * Navigation for pages outside the docs sidebar (landing and 404), which add a
 * Documentation link that the docs pages do not need.
 */
export function homeLayoutOptions(slug: string): BaseLayoutProps {
  const japanese = localeFromPath(slug) === 'ja';
  return {
    ...layoutOptions(slug),
    links: [
      {
        text: japanese ? 'ドキュメント' : 'Documentation',
        url: `${homePath(slug)}docs/`,
      },
    ],
  };
}
