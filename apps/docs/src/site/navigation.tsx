import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import logoDark from '../assets/logo-lockup-dark.svg';
import logoLight from '../assets/logo-lockup-light.svg';
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
          {/* theme.css shows one of the two lockups for the light or dark theme. */}
          <img
            className='site-logo site-logo-light'
            src={logoLight}
            width={162}
            height={40}
            alt='goodnight-web'
          />
          <img
            className='site-logo site-logo-dark'
            src={logoDark}
            width={162}
            height={40}
            alt='goodnight-web'
          />
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
