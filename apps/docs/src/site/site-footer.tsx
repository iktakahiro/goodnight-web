import { sitePath } from './paths';

const trademarks = {
  en: 'Cloudflare, the Cloudflare logo, and Cloudflare Workers are trademarks and/or registered trademarks of Cloudflare, Inc. in the United States and other jurisdictions.',
  ja: 'Cloudflare、Cloudflare のロゴ、Cloudflare Workers は、米国およびその他の地域における Cloudflare, Inc. の商標または登録商標です。',
} as const;

/**
 * Landing page footer: project links, the license, and the Cloudflare
 * trademark attribution. The Japanese page shows the attribution in Japanese
 * and in English.
 */
export function SiteFooter({ japanese }: { japanese: boolean }) {
  const prefix = japanese ? 'ja/' : '';
  const links = [
    {
      text: japanese ? '構成' : 'Architecture',
      url: sitePath(`${prefix}docs/architecture/`),
    },
    {
      text: japanese ? '配布と更新のしくみ' : 'Distribution and updates',
      url: sitePath(`${prefix}docs/distribution/`),
    },
    {
      text: japanese ? 'セキュリティモデル' : 'Security model',
      url: sitePath(`${prefix}docs/security/`),
    },
  ];

  return (
    <footer className='site-footer'>
      <div className='landing-wrap'>
        <div className='site-footer-row'>
          <p className='site-footer-meta'>goodnight-web · MIT License</p>
          <nav className='site-footer-links' aria-label='Footer'>
            {links.map((link) => (
              <a key={link.url} href={link.url}>
                {link.text}
              </a>
            ))}
          </nav>
        </div>
        <div className='site-footer-trademarks'>
          {japanese ? <p>{trademarks.ja}</p> : null}
          <p lang={japanese ? 'en' : undefined}>{trademarks.en}</p>
        </div>
      </div>
    </footer>
  );
}
