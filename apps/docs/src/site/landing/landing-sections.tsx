import type { ReactNode } from 'react';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import {
  ArrowRight,
  Database,
  FilePenLine,
  GitPullRequest,
  LayoutTemplate,
} from 'lucide-react';
import { sitePath } from '../paths';
import { DeployButton } from './deploy-button';
import { ThemedImage } from './themed-image';

/** Returns true when the current page is Japanese. */
function useJapanese(): boolean {
  return useI18n().locale === 'ja';
}

/**
 * The "built on" strip under the hero: the official Astro logo, linked to
 * astro.build, and Cloudflare product names as text. Brand names carry
 * `data-brand` so that they can become logos later.
 */
export function BuiltOn() {
  return (
    <div className='built-on'>
      <div className='landing-wrap'>
        <p lang='en'>Built on</p>
        <a className='built-on-astro' href='https://astro.build'>
          <img
            className='themed-image themed-image-light'
            src={sitePath('images/third-party/astro-logo-on-light.svg')}
            alt='Astro'
            width={138}
            height={48}
          />
          <img
            className='themed-image themed-image-dark'
            src={sitePath('images/third-party/astro-logo-gradient-on-dark.svg')}
            alt='Astro'
            width={138}
            height={48}
            loading='lazy'
          />
        </a>
        <span className='built-on-name' data-brand='cloudflare-workers'>
          Cloudflare Workers®
        </span>
        <span className='built-on-name' data-brand='cloudflare-d1'>
          Cloudflare D1
        </span>
      </div>
    </div>
  );
}

/** A top page section: spacing, a hairline above, and the page width. */
export function LandingSection({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className='landing-section' id={id}>
      <div className='landing-wrap'>{children}</div>
    </section>
  );
}

/** The four feature cards, two per row on wide screens. */
export function FeatureGrid({ children }: { children: ReactNode }) {
  return <div className='feature-grid'>{children}</div>;
}

const featureIcons = {
  'file-pen': FilePenLine,
  database: Database,
  'git-pull-request': GitPullRequest,
  'layout-template': LayoutTemplate,
} as const;

/**
 * One feature card. The children are the lead sentence and an optional
 * {@link FeatureNote}.
 *
 * @param icon - A key of the small icon set used on the top page.
 */
export function Feature({
  icon,
  title,
  children,
}: {
  icon: keyof typeof featureIcons;
  title: string;
  children: ReactNode;
}) {
  const Icon = featureIcons[icon];
  return (
    <div className='feature'>
      <Icon className='feature-icon' aria-hidden='true' />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** The small print under a feature's lead sentence. */
export function FeatureNote({ children }: { children: ReactNode }) {
  return <div className='feature-note'>{children}</div>;
}

/**
 * The "What is Cloudflare?" block. The hero links to its `#cloudflare` id.
 * The children are a heading and the paragraphs.
 */
export function CloudflareNote({ children }: { children: ReactNode }) {
  return (
    <div className='cloudflare-note' id='cloudflare'>
      {children}
    </div>
  );
}

/**
 * The admin section: the heading and the feature list from the children, and
 * the inquiry detail screenshot in the page's language.
 */
export function AdminShowcase({ children }: { children: ReactNode }) {
  const japanese = useJapanese();
  return (
    <div className='admin-showcase'>
      <div className='admin-showcase-text'>{children}</div>
      <div className='landing-shot'>
        <div className='hero-window-bar' aria-hidden='true'>
          <i />
          <i />
          <i />
          <span>example.com/admin</span>
        </div>
        <ThemedImage
          path={`images/admin/inquiry-detail-${japanese ? 'ja' : 'en'}`}
          alt={
            japanese
              ? '管理画面の問い合わせ詳細'
              : 'Inquiry detail in the admin panel'
          }
          width={1024}
          height={1325}
        />
      </div>
    </div>
  );
}

/**
 * The closing call to action: the heading and paragraph from the children,
 * then the documentation link and the Deploy to Cloudflare button.
 */
export function ClosingCta({ children }: { children: ReactNode }) {
  const japanese = useJapanese();
  return (
    <section className='closing-cta'>
      <div className='landing-wrap'>
        {children}
        <div className='landing-actions closing-actions'>
          <a
            className='landing-button primary'
            href={sitePath(japanese ? 'ja/docs/' : 'docs/')}
          >
            {japanese ? 'ドキュメントを読む' : 'Read the docs'}
            <ArrowRight aria-hidden='true' />
          </a>
          <DeployButton />
        </div>
      </div>
    </section>
  );
}
