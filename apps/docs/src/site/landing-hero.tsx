import type { PageMetadata } from './source';
import { sitePath } from './paths';
import '../styles/landing.css';

/** Product introduction with the project status and localized entry points. */
export function LandingHero({ page }: { page: PageMetadata }) {
  const japanese = page.slug === 'ja';
  const prefix = japanese ? 'ja/' : '';
  return (
    <header className='landing-hero'>
      <p className='eyebrow'>
        <span className='eyebrow-chip'>
          {japanese ? '開発中' : 'In development'}
        </span>
        <span className='eyebrow-text'>
          {japanese
            ? 'M1 の作業中です。まだ公開していません。'
            : 'Milestone 1 is in progress. Nothing is published yet.'}
        </span>
      </p>
      <h1>{page.hero?.title}</h1>
      <p className='hero-description'>{page.hero?.tagline}</p>
      <div className='hero-actions'>
        <a className='site-button' href={sitePath(`${prefix}docs/`)}>
          {japanese ? 'ドキュメントを読む' : 'Read the documentation'}{' '}
          <span aria-hidden='true'>→</span>
        </a>
        <a
          className='site-button secondary'
          href={sitePath(`${prefix}docs/architecture/`)}
        >
          {japanese ? 'しくみを見る' : 'See the architecture'}
        </a>
      </div>
    </header>
  );
}
