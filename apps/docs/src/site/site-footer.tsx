const trademarks = {
  en: 'Cloudflare, the Cloudflare logo, and Cloudflare Workers are trademarks and/or registered trademarks of Cloudflare, Inc. in the United States and other jurisdictions.',
  ja: 'Cloudflare、Cloudflare のロゴ、Cloudflare Workers は、米国およびその他の地域における Cloudflare, Inc. の商標または登録商標です。',
} as const;

/**
 * Landing page footer: the license and the Cloudflare trademark attribution.
 * The Japanese page shows the attribution in Japanese and in English.
 */
export function SiteFooter({ japanese }: { japanese: boolean }) {
  return (
    <footer className='site-footer'>
      <div className='landing-wrap'>
        <div className='site-footer-row'>
          <p className='site-footer-meta'>goodnight-web · MIT License</p>
        </div>
        <div className='site-footer-trademarks'>
          {japanese ? <p>{trademarks.ja}</p> : null}
          <p lang={japanese ? 'en' : undefined}>{trademarks.en}</p>
        </div>
      </div>
    </footer>
  );
}
