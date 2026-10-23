/** The share image (Open Graph and X card) of each documentation language. */
export const openGraphImages = {
  ja: {
    path: 'images/og/og-ja.png',
    alt: 'goodnight web のシェア画像。「これからのWebサイトは、シンプルな構成で。」の文と、お問い合わせの一覧を表示した管理画面',
  },
  en: {
    path: 'images/og/og-en.png',
    alt: 'goodnight web share image: "Your next website, built on a simple setup." beside the admin panel showing the inquiry list',
  },
} as const;

/** Every share image is this many pixels; X shows 1.91:1 as a large card. */
export const openGraphSize = { width: 1200, height: 630 } as const;
