import { useI18n } from 'fumadocs-ui/contexts/i18n';
import {
  Database,
  GitBranch,
  Globe,
  Hammer,
  KeyRound,
  LayoutDashboard,
  Send,
  ShieldCheck,
  User,
  UserCog,
} from 'lucide-react';

const copy = {
  en: {
    label: 'Architecture of a goodnight-web website',
    visitor: ['Visitor', 'Reads pages, sends the form'],
    owner: ['Admin', 'Reads inquiries'],
    waf: ['Cloudflare WAF', 'Filters requests by rules you set'],
    access: ['Cloudflare Access', 'A second sign-in for the admin panel'],
    optional: 'Optional',
    account: 'Your Cloudflare account',
    workers: 'Workers',
    website: ['Website', 'Static files built with Astro'],
    form: ['Contact form API', 'Hono · Turnstile · rate limit'],
    admin: ['Admin panel', 'Hono · sign in with a passkey'],
    d1: ['D1', 'Stores inquiries'],
    builds: ['Workers Builds', 'Builds and deploys'],
    github: ['GitHub', 'Your files and history'],
  },
  ja: {
    label: 'goodnight-web のWebサイト構成図',
    visitor: ['訪問者', 'ページを見る・フォームを送る'],
    owner: ['管理者', '問い合わせを確認'],
    waf: ['Cloudflare WAF', '設定したルールでリクエストを制限'],
    access: ['Cloudflare Access', '管理画面に二段目のログインを追加'],
    optional: '任意',
    account: '自分の Cloudflare アカウント',
    workers: 'Workers',
    website: ['Webサイト', 'Astro で生成した静的ファイル'],
    form: ['問い合わせフォーム API', 'Hono · Turnstile · レート制限'],
    admin: ['管理画面', 'Hono · Passkey でログイン'],
    d1: ['D1', '問い合わせを保存'],
    builds: ['Workers Builds', 'ビルドとデプロイ'],
    github: ['GitHub', 'ファイルと履歴を管理'],
  },
} as const;

/**
 * The top page architecture, drawn as an infrastructure diagram: the visitor
 * and the admin on the left, the optional Cloudflare WAF and Cloudflare Access
 * layers (dashed), the Worker with the website, the contact form API and the
 * admin panel inside your Cloudflare account, the D1 database, and the path
 * from GitHub through Workers Builds. Cloudflare products are plain text
 * labels. The grid areas are set in landing.css; on narrow screens the boxes
 * stack in reading order.
 */
export function LandingArchitecture() {
  const text = useI18n().locale === 'ja' ? copy.ja : copy.en;
  return (
    <div className='arch' role='group' aria-label={text.label}>
      <div className='arch-frame arch-frame-account' aria-hidden='true' />
      <div className='arch-frame arch-frame-workers' aria-hidden='true' />
      <p className='arch-label arch-label-account'>{text.account}</p>
      <p className='arch-label arch-label-workers'>{text.workers}</p>

      <Node area='visitor' icon={User} title={text.visitor[0]}>
        {text.visitor[1]}
      </Node>
      <Node
        area='waf'
        icon={ShieldCheck}
        title={text.waf[0]}
        optional={text.optional}
      >
        {text.waf[1]}
      </Node>
      <Node area='website' icon={Globe} title={text.website[0]}>
        {text.website[1]}
      </Node>
      <Node area='form' icon={Send} title={text.form[0]}>
        {text.form[1]}
      </Node>
      <Node area='admin' icon={LayoutDashboard} title={text.admin[0]}>
        {text.admin[1]}
      </Node>
      <Node area='d1' icon={Database} title={text.d1[0]}>
        {text.d1[1]}
      </Node>
      <Node area='owner' icon={UserCog} title={text.owner[0]}>
        {text.owner[1]}
      </Node>
      <Node
        area='access'
        icon={KeyRound}
        title={text.access[0]}
        optional={text.optional}
      >
        {text.access[1]}
      </Node>
      <Node area='builds' icon={Hammer} title={text.builds[0]}>
        {text.builds[1]}
      </Node>
      <Node area='github' icon={GitBranch} title={text.github[0]}>
        {text.github[1]}
      </Node>

      {(
        [
          'visitor-waf',
          'waf-website',
          'waf-form',
          'form-d1',
          'owner-access',
          'access-admin',
          'admin-d1',
          'github-builds',
        ] as const
      ).map((name) => (
        <span
          key={name}
          className={`arch-arrow arch-arrow-${name}`}
          aria-hidden='true'
        />
      ))}
    </div>
  );
}

/** One box of the diagram. `optional` draws it dashed with the label. */
function Node({
  area,
  icon: Icon,
  title,
  optional,
  children,
}: {
  area: string;
  icon: typeof Globe;
  title: string;
  optional?: string;
  children: string;
}) {
  return (
    <div
      className={
        optional
          ? `arch-node arch-${area} is-optional`
          : `arch-node arch-${area}`
      }
    >
      <Icon aria-hidden='true' />
      <b>{title}</b>
      {optional ? <em>{optional}</em> : null}
      <span>{children}</span>
    </div>
  );
}
