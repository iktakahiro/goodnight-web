import type { ReactNode } from 'react';
import { BookOpen, Globe, Inbox } from 'lucide-react';
import { BlurFade } from '../../components/magicui/blur-fade';
import { Highlighter } from '../../components/magicui/highlighter';
import type { PageMetadata } from '../source';
import { sitePath } from '../paths';
import { DeployButton } from './deploy-button';
import { ThemedImage } from './themed-image';
import { WindowBar } from './window-bar';
import '../../styles/landing.css';

const copy = {
  en: {
    gloss: 'Everything runs in your own Cloudflare® account.',
    whatIsCloudflare: 'What is Cloudflare?',
    docs: 'Read the docs',
    stage: 'Example screens: the website and the admin panel',
    adminAlt: 'Inquiry list in the admin panel',
    siteAlt: 'Example website built with the starter kit',
    admin: 'Admin panel',
    site: 'Your website',
  },
  ja: {
    gloss: 'すべて自分の Cloudflare® アカウントで動きます。',
    whatIsCloudflare: 'Cloudflare とは',
    docs: 'ドキュメントを読む',
    stage: 'Webサイトと管理画面の表示例',
    adminAlt: '管理画面の問い合わせ一覧',
    siteAlt: 'スターターキットで作るWebサイトの例',
    admin: '管理画面',
    site: 'あなたのWebサイト',
  },
} as const;

/**
 * Joins the lines of a hero title for `<title>` and Open Graph: no space
 * after Japanese punctuation, one space otherwise.
 */
export function heroTitleText(title: string): string {
  return title
    .split('\n')
    .reduce((text, line) =>
      /[、。，．]$/u.test(text) ? `${text}${line}` : `${text} ${line}`,
    );
}

/** One title line, with the highlight phrase underlined if it is there. */
function TitleLine({ line, highlight }: { line: string; highlight: string }) {
  const start = line.indexOf(highlight);
  if (start < 0) return <span className='hero-line'>{line}</span>;
  return (
    <span className='hero-line'>
      {line.slice(0, start)}
      <Highlighter color='var(--landing-accent)'>
        <em>{highlight}</em>
      </Highlighter>
      {line.slice(start + highlight.length)}
    </span>
  );
}

/**
 * The tagline. A tagline written on several lines keeps each line together
 * on wide screens, so a word such as 問い合わせ is never split; a one-line
 * tagline wraps normally.
 */
function TaglinePhrases({ tagline }: { tagline: string }) {
  const phrases = tagline.split('\n');
  if (phrases.length === 1) return tagline;
  return phrases.map((phrase) => (
    <span key={phrase} className='hero-phrase'>
      {phrase}
    </span>
  ));
}

/** A browser-like frame with a decorative address bar. */
function Window({
  className,
  address,
  children,
}: {
  className: string;
  address: string;
  children: ReactNode;
}) {
  return (
    <div className={`hero-window ${className}`}>
      <WindowBar address={address} />
      {children}
    </div>
  );
}

/**
 * The top page hero: the eyebrow, the title with its underlined phrase, the
 * tagline, the two entry points (the docs and Deploy to Cloudflare), and the website and admin screenshots. Text is never animated, so the prerendered HTML shows it.
 */
export function LandingHero({ page }: { page: PageMetadata }) {
  const japanese = page.slug === 'ja';
  const text = japanese ? copy.ja : copy.en;
  const prefix = japanese ? 'ja/' : '';
  const hero = page.hero;
  if (!hero) return null;
  return (
    <header className='landing-hero'>
      <div className='landing-wrap'>
        <p className='hero-eyebrow'>{hero.eyebrow}</p>
        <h1 className='hero-title'>
          {hero.title.split('\n').map((line) => (
            <TitleLine key={line} line={line} highlight={hero.highlight} />
          ))}
        </h1>
        <p className='hero-tagline'>
          <TaglinePhrases tagline={hero.tagline} />
        </p>
        <p className='hero-gloss'>
          {text.gloss} <a href='#cloudflare'>{text.whatIsCloudflare}</a>
        </p>
        <div className='landing-actions'>
          <a
            className='landing-button primary'
            href={sitePath(`${prefix}docs/`)}
          >
            <BookOpen aria-hidden='true' />
            {text.docs}
          </a>
          <DeployButton />
        </div>
        <div className='hero-stage' role='group' aria-label={text.stage}>
          <BlurFade
            className='hero-shots'
            delay={0.15}
            duration={0.7}
            offset={10}
            direction='up'
          >
            <Window className='hero-window-admin' address='example.com/admin'>
              <ThemedImage
                path={`images/admin/inquiry-list-${japanese ? 'ja' : 'en'}`}
                alt={text.adminAlt}
                width={1024}
                height={682}
              />
            </Window>
            <Window className='hero-window-site' address='example.com'>
              <img
                className='hero-site-image'
                src={sitePath('images/site.webp')}
                alt={text.siteAlt}
                width={1600}
                height={1000}
              />
            </Window>
          </BlurFade>
          <span className='hero-label hero-label-admin'>
            <Inbox aria-hidden='true' />
            {text.admin}
          </span>
          <span className='hero-label hero-label-site'>
            <Globe aria-hidden='true' />
            {text.site}
          </span>
        </div>
      </div>
    </header>
  );
}
