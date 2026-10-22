/**
 * Site settings: company information, navigation, languages, theme colors,
 * and the contact form categories. Edit the values in `siteConfig` below.
 *
 * Every text that visitors see has a Japanese (`ja`) and an English (`en`)
 * version. When you change one, change the other in the same edit.
 */

/** A language the site is published in. */
export type Locale = 'ja' | 'en';

/** A text with one value per language. */
export type Localized<T = string> = Record<Locale, T>;

/** A link in the header and footer navigation. */
export interface NavItem {
  /**
   * Path without the language prefix, with a trailing slash, for example
   * `/about/`. The site adds `/en/` (or the other language prefix) itself.
   */
  path: string;
  label: Localized;
}

/** One row of the company profile table on the about page. */
export interface ProfileRow {
  label: Localized;
  value: Localized;
}

/** One choice in the contact form's category select. */
export interface ContactCategory {
  /**
   * Value sent to the server and stored with the inquiry. Use lowercase ASCII.
   * The server accepts only the values listed here (`src/worker.ts` passes
   * them on), and the optional Slack notification shows this value.
   */
  value: string;
  label: Localized;
}

/** Colors used across the site. Use 6-digit hex values such as `#7c5fd3`. */
export interface ThemeColors {
  /** Buttons, links, and highlights. White text must stay readable on it. */
  primary: string;
  /** Page background. */
  background: string;
  /** Main text color. */
  foreground: string;
}

/** The shape of {@link siteConfig}. */
export interface SiteConfig {
  /** The public URL of the site, without a trailing slash. Used for links in page metadata. */
  url: string;
  /** Languages the site is published in. */
  locales: readonly Locale[];
  /**
   * The language served at the root (`/`). The other languages are served
   * under their own prefix, for example `/en/`.
   */
  defaultLocale: Locale;
  company: {
    name: Localized;
    /** A short line shown under the company name on the home page. */
    tagline: Localized;
    /** Used as the default page description for search engines. */
    description: Localized;
    email: string;
    /** Leave empty (`''`) to hide the phone number. */
    phone: string;
    address: Localized;
    /** Rows of the company profile table on the about page, in order. */
    profile: ProfileRow[];
  };
  nav: NavItem[];
  theme: ThemeColors;
  /**
   * Choices for "category" in the contact form, in order. The Turnstile keys
   * are not set here: the site key is `TURNSTILE_SITE_KEY` in
   * `wrangler.jsonc`, and the secret key is a Worker secret.
   */
  contactCategories: ContactCategory[];
}

/** The settings for this site. */
export const siteConfig: SiteConfig = {
  url: 'https://example.com',
  locales: ['ja', 'en'],
  defaultLocale: 'ja',

  company: {
    name: {
      ja: '株式会社ゆうなぎ工房',
      en: 'Yunagi Works Co., Ltd.',
    },
    tagline: {
      ja: '店舗とオフィスの家具を、つくって直す小さな工房です。',
      en: 'A small workshop that makes and repairs furniture for shops and offices.',
    },
    description: {
      ja: '株式会社ゆうなぎ工房は、石川県金沢市で店舗・オフィス向けの家具の製作と修理を行っています。',
      en: 'Yunagi Works makes and repairs furniture for shops and offices in Kanazawa, Ishikawa, Japan.',
    },
    email: 'info@example.com',
    phone: '076-000-0000',
    address: {
      ja: '〒920-0000 石川県金沢市ゆうなぎ町1-2-3',
      en: '1-2-3 Yunagi-machi, Kanazawa, Ishikawa 920-0000, Japan',
    },
    profile: [
      {
        label: { ja: '会社名', en: 'Company name' },
        value: { ja: '株式会社ゆうなぎ工房', en: 'Yunagi Works Co., Ltd.' },
      },
      {
        label: { ja: '代表者', en: 'Representative' },
        value: { ja: '代表取締役 山田 花子', en: 'Hanako Yamada, CEO' },
      },
      {
        label: { ja: '設立', en: 'Founded' },
        value: { ja: '2012年4月', en: 'April 2012' },
      },
      {
        label: { ja: '資本金', en: 'Capital' },
        value: { ja: '1,000万円', en: '10 million yen' },
      },
      {
        label: { ja: '従業員数', en: 'Employees' },
        value: { ja: '12名（2026年4月時点）', en: '12 (as of April 2026)' },
      },
      {
        label: { ja: '所在地', en: 'Address' },
        value: {
          ja: '〒920-0000 石川県金沢市ゆうなぎ町1-2-3',
          en: '1-2-3 Yunagi-machi, Kanazawa, Ishikawa 920-0000, Japan',
        },
      },
      {
        label: { ja: '事業内容', en: 'Business' },
        value: {
          ja: '店舗・オフィス家具の製作、家具の修理と張り替え、店舗内装の設計',
          en: 'Custom furniture for shops and offices, furniture repair and reupholstery, shop interior design',
        },
      },
      {
        label: { ja: '取引銀行', en: 'Bank' },
        value: {
          ja: 'ゆうなぎ信用金庫 本店',
          en: 'Yunagi Shinkin Bank, Head Office',
        },
      },
    ],
  },

  nav: [
    { path: '/about/', label: { ja: '会社概要', en: 'About' } },
    { path: '/services/', label: { ja: 'サービス', en: 'Services' } },
    { path: '/news/', label: { ja: 'お知らせ', en: 'News' } },
    { path: '/blog/', label: { ja: 'ブログ', en: 'Blog' } },
    { path: '/contact/', label: { ja: 'お問い合わせ', en: 'Contact' } },
  ],

  theme: {
    primary: '#7357c8',
    background: '#fcfbff',
    foreground: '#2f2a40',
  },

  contactCategories: [
    { value: 'service', label: { ja: 'サービスについて', en: 'Our services' } },
    { value: 'press', label: { ja: '取材', en: 'Press' } },
    { value: 'recruit', label: { ja: '採用', en: 'Careers' } },
    { value: 'sales', label: { ja: '営業・ご提案', en: 'Sales proposal' } },
    { value: 'other', label: { ja: 'その他', en: 'Other' } },
  ],
};
