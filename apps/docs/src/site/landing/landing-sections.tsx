import type { ReactNode } from 'react';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { BookOpen } from 'lucide-react';
import logoOnDark from '../../assets/logo-lockup-dark.svg';
import { sitePath } from '../paths';
import { DeployButton } from './deploy-button';
import { FeatureVignette, type FeatureVignetteName } from './feature-vignettes';
import { NightSky } from './night-sky';
import { ThemedImage } from './themed-image';
import { WindowBar } from './window-bar';

/** Returns true when the current page is Japanese. */
function useJapanese(): boolean {
  return useI18n().locale === 'ja';
}

/**
 * The "built on" strip under the hero: the official Astro logo, linked to
 * astro.build, and "Cloudflare Stack" as plain text. The brand name carries
 * `data-brand` so that it can become a logo later.
 */
export function BuiltOn() {
  const japanese = useJapanese();
  const astro = (
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
  );
  const stack = (
    <span className='built-on-name' data-brand='cloudflare'>
      Cloudflare Stack
    </span>
  );
  return (
    <div className='built-on'>
      <div className='landing-wrap'>
        {japanese ? (
          <>
            {astro}
            <span className='built-on-text'>と</span>
            {stack}
            <span className='built-on-text'>で構築</span>
          </>
        ) : (
          <>
            <span className='built-on-text'>Built on</span>
            {astro}
            <span className='built-on-text'>and</span>
            {stack}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A top page section: spacing, a hairline above, and the page width.
 *
 * @param tone - `night` draws the section as a full-width deep violet band
 *   with a few stars and a moon, in the light and the dark theme.
 */
export function LandingSection({
  id,
  tone,
  children,
}: {
  id?: string;
  tone?: 'night';
  children: ReactNode;
}) {
  return (
    <section
      className={
        tone === 'night' ? 'landing-section landing-night' : 'landing-section'
      }
      id={id}
    >
      {tone === 'night' ? <NightSky variant='architecture' /> : null}
      <div className='landing-wrap'>{children}</div>
    </section>
  );
}

/**
 * The four feature cards as a bento grid: on wide screens the first and the
 * last card are wider than the two between them.
 */
export function FeatureGrid({ children }: { children: ReactNode }) {
  return <div className='feature-grid'>{children}</div>;
}

/**
 * One feature card: an illustration above the title, the lead sentence, and
 * an optional {@link FeatureNote}, all from the children.
 *
 * @param visual - The illustration drawn above the title.
 * @param wide - Spans seven of twelve columns instead of five on wide screens.
 */
export function Feature({
  visual,
  wide = false,
  title,
  children,
}: {
  visual: FeatureVignetteName;
  wide?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'feature feature-wide' : 'feature'}>
      <FeatureVignette name={visual} />
      <div className='feature-body'>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** The small print under a feature's lead sentence. */
export function FeatureNote({ children }: { children: ReactNode }) {
  return <div className='feature-note'>{children}</div>;
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
        <WindowBar address='example.com/admin' />
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
 * The closing call to action, drawn as a calm night band: the full logo, the
 * heading and paragraph from the children, then the same two buttons as
 * the hero: the documentation link and Deploy to Cloudflare.
 */
export function ClosingCta({ children }: { children: ReactNode }) {
  const japanese = useJapanese();
  return (
    <section className='closing-cta landing-night'>
      <NightSky variant='closing' />
      <div className='landing-wrap'>
        {/* The band is dark in both themes, so it always uses the lockup
            made for dark backgrounds. */}
        <img
          className='closing-logo'
          src={logoOnDark}
          alt='goodnight-web'
          width={320}
          height={83}
          loading='lazy'
        />
        {children}
        <div className='landing-actions closing-actions'>
          <a
            className='landing-button primary'
            href={sitePath(japanese ? 'ja/docs/' : 'docs/')}
          >
            <BookOpen aria-hidden='true' />
            {japanese ? 'ドキュメントを読む' : 'Read the docs'}
          </a>
          <DeployButton />
        </div>
      </div>
    </section>
  );
}
