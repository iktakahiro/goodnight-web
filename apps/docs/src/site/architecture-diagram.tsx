import { Fragment, useId } from 'react';
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
    hono: ['Hono app', 'createGoodnightWorker()'],
    routes: [
      ['/api/contact/*', 'form fields, submissions'],
      ['/api/setup', 'first admin only'],
      ['/api/auth/*', 'Better Auth, passkeys'],
      ['/api/admin/*', 'inquiry API'],
      ['/admin/*', 'prebuilt admin UI'],
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
    hono: ['Hono アプリ', 'createGoodnightWorker()'],
    routes: [
      ['/api/contact/*', 'フォームの項目と送信'],
      ['/api/setup', '最初の管理者だけ'],
      ['/api/auth/*', 'Better Auth（パスキー）'],
      ['/api/admin/*', '問い合わせの API'],
      ['/admin/*', 'ビルド済みの管理画面'],
    ],
    d1: ['D1', '問い合わせ・フォーム・設定・認証'],
    rateLimit: ['Rate Limiting', 'binding（ip_hash ごと）'],
    turnstile: ['Turnstile', 'サーバー側で siteverify'],
    slack: ['Slack（任意）', '件数・受信日時・リンクだけ'],
    waitUntil: 'ctx.waitUntil',
  },
} as const;

/** One box with a title, a smaller second line, and an optional code note. */
function Box({
  lines,
  note,
  optional = false,
}: {
  lines: readonly [string, string];
  note?: string;
  optional?: boolean;
}) {
  return (
    <div className={optional ? 'ad-box ad-optional' : 'ad-box'}>
      <span className='ad-title'>{lines[0]}</span>
      <span className='ad-sub'>{lines[1]}</span>
      {note ? <code className='ad-note'>{note}</code> : null}
    </div>
  );
}

/** A downward connector. Screen readers skip it; the text carries the meaning. */
function Arrow() {
  return <span className='ad-arrow' aria-hidden='true' />;
}

/**
 * The runtime architecture as boxes and arrows with English or Japanese
 * labels. It is plain HTML and CSS rendered at build time, so the static page
 * needs no script, and the text wraps and stacks on narrow screens.
 */
export function ArchitectureDiagram({ locale }: { locale: 'en' | 'ja' }) {
  const text = copy[locale];
  const descriptionId = useId();
  return (
    <figure
      className='architecture-diagram not-prose'
      aria-describedby={descriptionId}
    >
      <p id={descriptionId} className='ad-visually-hidden'>
        {text.label}
      </p>
      <div className='ad-clients'>
        <div className='ad-lane'>
          <Box lines={text.visitors} />
          <Arrow />
        </div>
        <div className='ad-lane'>
          <Box lines={text.admins} />
          <Arrow />
          <Box lines={text.access} optional />
          <Arrow />
        </div>
      </div>

      <div className='ad-worker'>
        <span className='ad-worker-label'>{text.worker}</span>
        <div className='ad-worker-parts'>
          <div className='ad-box'>
            <span className='ad-title'>{text.assets[0]}</span>
            <span className='ad-sub'>{text.assets[1]}</span>
            <span className='ad-sub'>{text.assets[2]}</span>
          </div>
          <div className='ad-box ad-accent'>
            <span className='ad-title'>{text.hono[0]}</span>
            <code className='ad-note'>{text.hono[1]}</code>
            <dl className='ad-routes'>
              {text.routes.map(([path, role]) => (
                <Fragment key={path}>
                  <dt>
                    <code>{path}</code>
                  </dt>
                  <dd>{role}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <div className='ad-uses'>
        <Arrow />
      </div>
      <div className='ad-services'>
        <Box lines={text.d1} />
        <Box lines={text.rateLimit} />
        <Box lines={text.turnstile} />
        <Box lines={text.slack} note={text.waitUntil} optional />
      </div>

      <figcaption>{text.caption}</figcaption>
    </figure>
  );
}
