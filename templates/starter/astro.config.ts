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
  vite: {
    plugins: [tailwindcss()],
  },
});
