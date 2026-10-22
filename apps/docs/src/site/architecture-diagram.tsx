import './architecture-diagram.css';

const copy = {
  en: {
    label:
      'Architecture: visitors and admins reach one Worker. Static Assets serve the site. A Hono app handles the API and the admin UI and uses D1, the Rate Limiting binding, Turnstile, and an optional Slack webhook. Cloudflare Access can protect the admin paths.',
    caption:
      'One Worker serves everything. Dashed boxes are optional. Only the API and admin paths run Worker code.',
    visitors: ['Visitors', 'read pages, send the form'],
    admins: ['Admins', 'read inquiries'],
    access: ['Cloudflare Access (optional)', '/admin/*, /api/admin/*'],
    worker: 'One Worker',
    assets: [
      'Static Assets',
      'Astro build: /, /blog/, /contact/',
      'served without running Worker code',
    ],
    hono: 'Hono app · createGoodnightWorker()',
    routes: [
      '/api/contact/* — form fields, submissions',
      '/api/setup — first admin only',
      '/api/auth/* — Better Auth, passkeys',
      '/api/admin/* — inquiry API',
      '/admin/* — prebuilt admin UI',
    ],
    d1: ['D1', 'inquiries, form, settings, auth'],
    rateLimit: ['Rate Limiting', 'binding, keyed by ip_hash'],
    turnstile: ['Turnstile', 'siteverify on the server'],
    slack: ['Slack (optional)', 'count, time, link'],
    waitUntil: 'ctx.waitUntil',
  },
  ja: {
    label:
      '構成図: 訪問者と管理者は 1 つの Worker にアクセスします。サイトは Static Assets が配信します。API と管理画面は Hono アプリが担当し、D1、Rate Limiting binding、Turnstile、任意の Slack Webhook を使います。管理画面のパスは Cloudflare Access で保護することもできます。',
    caption:
      'すべてを 1 つの Worker が配信します。破線は任意の部品です。Worker のコードが動くのは API と管理画面のパスだけです。',
    visitors: ['訪問者', 'ページを見る・フォームを送る'],
    admins: ['管理者', '問い合わせを読む'],
    access: ['Cloudflare Access（任意）', '/admin/*, /api/admin/*'],
    worker: 'Worker（1 つ）',
    assets: [
      'Static Assets',
      'Astro のビルド: /, /blog/, /contact/',
      'Worker のコードを動かさずに配信',
    ],
    hono: 'Hono アプリ · createGoodnightWorker()',
    routes: [
      '/api/contact/* — フォームの項目と送信',
      '/api/setup — 最初の管理者だけ',
      '/api/auth/* — Better Auth（パスキー）',
      '/api/admin/* — 問い合わせの API',
      '/admin/* — ビルド済みの管理画面',
    ],
    d1: ['D1', '問い合わせ・フォーム・設定・認証'],
    rateLimit: ['Rate Limiting', 'binding（ip_hash ごと）'],
    turnstile: ['Turnstile', 'サーバー側で siteverify'],
    slack: ['Slack（任意）', '件数・受信日時・リンクだけ'],
    waitUntil: 'ctx.waitUntil',
  },
} as const;

/** One box with a title and a smaller second line. */
function Node({
  x,
  y,
  width,
  lines,
  optional = false,
}: {
  x: number;
  y: number;
  width: number;
  lines: readonly [string, string];
  optional?: boolean;
}) {
  return (
    <g>
      <rect
        className={optional ? 'ad-box ad-optional' : 'ad-box'}
        x={x}
        y={y}
        width={width}
        height={56}
        rx={12}
      />
      <text className='ad-title' x={x + width / 2} y={y + 23}>
        {lines[0]}
      </text>
      <text className='ad-sub' x={x + width / 2} y={y + 42}>
        {lines[1]}
      </text>
    </g>
  );
}

/**
 * Inline SVG of the runtime architecture with English or Japanese labels.
 * It renders at build time, so the static HTML needs no script to show it.
 */
export function ArchitectureDiagram({ locale }: { locale: 'en' | 'ja' }) {
  const text = copy[locale];
  const bottom = [
    { x: 30, lines: text.d1 },
    { x: 220, lines: text.rateLimit },
    { x: 410, lines: text.turnstile },
    { x: 600, lines: text.slack, optional: true },
  ];
  return (
    <figure className='architecture-diagram not-prose'>
      <svg viewBox='0 0 800 520' role='img' aria-label={text.label}>
        <defs>
          <marker
            id='ad-arrow'
            viewBox='0 0 10 10'
            refX='9'
            refY='5'
            markerWidth='7'
            markerHeight='7'
            orient='auto-start-reverse'
          >
            <path className='ad-arrowhead' d='M0 0L10 5L0 10z' />
          </marker>
        </defs>

        <Node x={60} y={16} width={220} lines={text.visitors} />
        <Node x={520} y={16} width={220} lines={text.admins} />
        <Node x={500} y={96} width={260} lines={text.access} optional />

        <rect
          className='ad-worker'
          x={16}
          y={172}
          width={768}
          height={208}
          rx={20}
        />
        <text className='ad-worker-label' x={36} y={196}>
          {text.worker}
        </text>

        <rect
          className='ad-box'
          x={36}
          y={212}
          width={276}
          height={150}
          rx={14}
        />
        <text className='ad-title' x={174} y={262}>
          {text.assets[0]}
        </text>
        <text className='ad-sub' x={174} y={290}>
          {text.assets[1]}
        </text>
        <text className='ad-sub' x={174} y={312}>
          {text.assets[2]}
        </text>

        <rect
          className='ad-box ad-accent'
          x={332}
          y={212}
          width={432}
          height={150}
          rx={14}
        />
        <text className='ad-title' x={548} y={238}>
          {text.hono}
        </text>
        {text.routes.map((route, index) => (
          <text key={route} className='ad-route' x={352} y={264 + index * 21}>
            {route}
          </text>
        ))}

        {bottom.map((node) => (
          <Node
            key={node.x}
            x={node.x}
            y={448}
            width={170}
            lines={node.lines}
            optional={node.optional}
          />
        ))}

        <line className='ad-line' x1={150} y1={72} x2={150} y2={210} />
        <line className='ad-line' x1={240} y1={72} x2={420} y2={210} />
        <line className='ad-line' x1={630} y1={72} x2={630} y2={94} />
        <line className='ad-line' x1={630} y1={152} x2={630} y2={210} />
        <line className='ad-line' x1={420} y1={362} x2={115} y2={446} />
        <line className='ad-line' x1={480} y1={362} x2={305} y2={446} />
        <line className='ad-line' x1={540} y1={362} x2={495} y2={446} />
        <line
          className='ad-line ad-optional'
          x1={620}
          y1={362}
          x2={685}
          y2={446}
        />
        <text className='ad-note' x={668} y={410}>
          {text.waitUntil}
        </text>
      </svg>
      <figcaption>{text.caption}</figcaption>
    </figure>
  );
}
