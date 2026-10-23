import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { siteConfig } from './site.config';

export default defineConfig({
  site: siteConfig.url,
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    locales: [...siteConfig.locales],
    defaultLocale: siteConfig.defaultLocale,
    routing: { prefixDefaultLocale: false },
  },
  // Keep every script and stylesheet in its own file under /_astro/.
  // public/_headers sends a Content Security Policy with `script-src 'self'`
  // and no 'unsafe-inline', so an inlined script would be blocked. A static
  // _headers file cannot list per-page hashes, so external files are the
  // way to stay without 'unsafe-inline'.
  build: { inlineStylesheets: 'never' },
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
  },
});
