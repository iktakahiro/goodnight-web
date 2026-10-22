import { sitePath } from './paths';

/** Landing page footer: project links, the license, and the project status. */
export function SiteFooter({ japanese }: { japanese: boolean }) {
  const prefix = japanese ? 'ja/' : '';
  const links = [
    {
      text: japanese ? 'ドキュメント' : 'Documentation',
      url: sitePath(`${prefix}docs/`),
    },
    {
      text: japanese ? 'はじめかた' : 'Getting started',
      url: sitePath(`${prefix}docs/getting-started/`),
    },
    {
      text: japanese ? 'セキュリティモデル' : 'Security model',
      url: sitePath(`${prefix}docs/security/`),
    },
  ];

  return (
    <footer className='site-footer'>
      <nav className='site-footer-links' aria-label='Footer'>
        {links.map((link) => (
          <a key={link.url} href={link.url}>
            {link.text}
          </a>
        ))}
      </nav>
      <p className='site-footer-meta'>
        goodnight-web · MIT License ·{' '}
        {japanese
          ? '開発中（M1）。まだ公開していません。'
          : 'Work in progress (M1). Not published yet.'}
      </p>
    </footer>
  );
}
