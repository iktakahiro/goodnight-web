import type { Localized } from '../../site.config';

/** Texts shared by the header, footer, and lists on every page. */
export const ui = {
  skipToContent: { ja: '本文へ移動', en: 'Skip to content' },
  home: { ja: 'ホーム', en: 'Home' },
  menu: { ja: 'メニュー', en: 'Menu' },
  closeMenu: { ja: 'メニューを閉じる', en: 'Close menu' },
  mainNav: { ja: 'メインメニュー', en: 'Main menu' },
  footerNav: { ja: 'フッターメニュー', en: 'Footer menu' },
  language: { ja: '言語', en: 'Language' },
  privacy: { ja: 'プライバシーポリシー', en: 'Privacy policy' },
  contactUs: { ja: 'お問い合わせ', en: 'Contact us' },
  readMore: { ja: '続きを読む', en: 'Read more' },
  viewAll: { ja: '一覧を見る', en: 'View all' },
  noPosts: { ja: 'まだ記事はありません。', en: 'No posts yet.' },
  published: { ja: '公開日', en: 'Published' },
  updated: { ja: '更新日', en: 'Updated' },
  backToNews: { ja: 'お知らせ一覧へ戻る', en: 'Back to news' },
  backToBlog: { ja: 'ブログ一覧へ戻る', en: 'Back to blog' },
} satisfies Record<string, Localized>;
