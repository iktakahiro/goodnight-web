import { resolve } from 'node:path';
import { readPages } from './content';
import { i18n, localeFromPath } from '../src/site/i18n';
import { markdownFile } from '../src/site/paths';
import { openGraphImages, openGraphSize } from '../src/site/open-graph';
import { defaultSiteUrl } from './site-url';

const root = resolve(import.meta.dirname, '..');
const base = process.env.DOCS_BASE_PATH ?? '/';
const origin = new URL(process.env.DOCS_SITE_URL ?? defaultSiteUrl).origin;
const pages = await readPages(`${root}/src/content/docs`);
const errors: string[] = [];
const documents = new Map<
  string,
  { ids: Set<string>; links: string[]; alternates: string[] }
>();

for await (const file of new Bun.Glob('**/*.html').scan(`${root}/dist`)) {
  const html = await Bun.file(`${root}/dist/${file}`).text();
  const ids = new Set<string>();
  const links: string[] = [];
  let language = '';
  let title = '';
  let headings = 0;
  let canonical = '';
  const alternates: string[] = [];
  const meta: Record<string, string> = {};
  const assets: string[] = [];
  await new HTMLRewriter()
    .on('[id]', {
      element(element) {
        const id = element.getAttribute('id');
        if (id) ids.add(id);
      },
    })
    .on('a[href]', {
      element(element) {
        links.push(element.getAttribute('href') ?? '');
      },
    })
    .on('html', {
      element(element) {
        language = element.getAttribute('lang') ?? '';
      },
    })
    .on('title', {
      text(chunk) {
        title += chunk.text;
      },
    })
    .on('h1', {
      element() {
        headings++;
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        canonical = element.getAttribute('href') ?? '';
      },
    })
    .on('meta[property], meta[name]', {
      element(element) {
        const key =
          element.getAttribute('property') ?? element.getAttribute('name');
        if (key) meta[key] = element.getAttribute('content') ?? '';
      },
    })
    .on('link[rel="alternate"][hreflang]', {
      element(element) {
        alternates.push(element.getAttribute('href') ?? '');
      },
    })
    .on(
      'script[src], link[rel="stylesheet"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], img[src]',
      {
        element(element) {
          assets.push(
            element.getAttribute('src') ?? element.getAttribute('href') ?? '',
          );
        },
      },
    )
    .transform(new Response(html))
    .text();
  const pathname = `${base}${file === 'index.html' ? '' : file.replace(/index\.html$/u, '')}`;
  documents.set(pathname, { ids, links, alternates });
  if (language !== localeFromPath(file))
    errors.push(`${file}: incorrect html lang (${language})`);
  if (!title || headings !== 1)
    errors.push(
      `${file}: missing title or expected one rendered h1, got ${headings}`,
    );
  if (file !== '404.html' && canonical !== `${origin}${pathname}`)
    errors.push(`${file}: incorrect canonical URL (${canonical})`);
  if (file !== '404.html') {
    // Share images: an absolute URL on the configured origin, for X and others.
    const image = openGraphImages[language === 'ja' ? 'ja' : 'en'];
    const expected = `${origin}${base}${image.path}`;
    if (meta['og:image'] !== expected || meta['twitter:image'] !== expected)
      errors.push(`${file}: og:image and twitter:image must be ${expected}`);
    if (meta['twitter:card'] !== 'summary_large_image')
      errors.push(`${file}: twitter:card must be summary_large_image`);
    for (const key of ['og:title', 'og:description', 'og:type', 'og:url'])
      if (!meta[key]) errors.push(`${file}: missing ${key}`);
    if (!meta['og:image:alt'] || !meta['twitter:image:alt'])
      errors.push(`${file}: missing share image alt text`);
    const png = Bun.file(`${root}/dist/${image.path}`);
    if (!(await png.exists())) {
      errors.push(`${file}: missing share image ${image.path}`);
    } else {
      const bytes = new DataView(await png.arrayBuffer());
      if (
        bytes.getUint32(16) !== openGraphSize.width ||
        bytes.getUint32(20) !== openGraphSize.height ||
        png.size > 1_000_000
      )
        errors.push(`${image.path} must be a PNG of 1200 x 630 px under 1 MB`);
    }
  }
  if (html.includes('/api/search') || html.includes('/_serverFn/'))
    errors.push(`${file}: runtime API dependency`);
  for (const href of assets) {
    // Small images such as the logo are inlined by Vite.
    if (href.startsWith('data:')) continue;
    // Every asset is served from the same Worker; pages load nothing remote.
    if (/^(?:https?:)?\/\//u.test(href)) {
      errors.push(`${file}: unexpected remote asset ${href}`);
      continue;
    }
    const url = new URL(href, `${origin}${pathname}`);
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    if (
      !url.pathname.startsWith(base) ||
      !(await Bun.file(`${root}/dist/${relative}`).exists())
    )
      errors.push(`${file}: missing asset ${href}`);
  }
}
for (const [pathname, { links, alternates }] of documents) {
  // Language alternates must name the canonical URL, not one that redirects.
  for (const href of alternates) {
    const target = new URL(href);
    if (target.origin !== origin || !documents.has(target.pathname))
      errors.push(`${pathname}: hreflang is not a canonical page ${href}`);
  }
  for (const href of links) {
    const target = new URL(href, `${origin}${pathname}`);
    if (target.origin !== origin) continue;
    const destination = documents.get(target.pathname);
    if (!destination) {
      if (
        !target.pathname.startsWith(base) ||
        !(await Bun.file(
          `${root}/dist/${decodeURIComponent(target.pathname.slice(base.length))}`,
        ).exists())
      )
        errors.push(`${pathname}: broken link ${href}`);
    } else if (
      target.hash &&
      !destination.ids.has(decodeURIComponent(target.hash.slice(1)))
    ) {
      errors.push(`${pathname}: broken anchor ${href}`);
    }
  }
}
for (const page of pages) {
  if (!documents.has(`${base}${page.slug ? `${page.slug}/` : ''}`))
    errors.push(`Missing generated page: ${page.slug}`);
}
// Agent-readable text must cover every page and link only to published files.
const texts = i18n.languages.flatMap((locale) => {
  const prefix = locale === i18n.defaultLanguage ? '' : `${locale}/`;
  return [`${prefix}llms.txt`, `${prefix}llms-full.txt`];
});
for (const page of pages) texts.push(markdownFile(page.slug));
for (const file of texts) {
  const text = Bun.file(`${root}/dist/${file}`);
  if (!(await text.exists())) {
    errors.push(`Missing agent-readable text: ${file}`);
    continue;
  }
  for (const [, href = ''] of (await text.text()).matchAll(
    /\]\((https?:\/\/[^)\s]+)\)/gu,
  )) {
    const target = new URL(href);
    if (target.origin !== origin || documents.has(target.pathname)) continue;
    if (
      !target.pathname.startsWith(base) ||
      !(await Bun.file(
        `${root}/dist/${decodeURIComponent(target.pathname.slice(base.length))}`,
      ).exists())
    )
      errors.push(`${file}: broken link ${href}`);
  }
}
if (documents.size !== pages.length + 1)
  errors.push('Unexpected number of generated HTML pages.');
if (await Bun.file(`${root}/dist/server/server.js`).exists())
  errors.push('Server bundle must not be published.');

// Translations must preserve executable examples exactly, including tab contents.
for (const page of pages.filter(
  (item) => item.slug !== 'ja' && !item.slug.startsWith('ja/'),
)) {
  const file = page.file;
  const en = await Bun.file(`${root}/src/content/docs/${file}`).text();
  const ja = await Bun.file(`${root}/src/content/docs/ja/${file}`).text();
  const code = (source: string) =>
    Array.from(
      source.matchAll(/^\s*```[^\n]*\n([\s\S]*?)^\s*```/gmu),
      (match) => match[0],
    );
  if (JSON.stringify(code(en)) !== JSON.stringify(code(ja)))
    errors.push(`Code examples differ between languages: ${file}`);
}
if (errors.length)
  throw new Error(
    `Static documentation validation failed:\n${errors.join('\n')}`,
  );
console.log(
  `Validated ${documents.size} static pages, ${texts.length} agent-readable texts, localized metadata, links, anchors, assets, and bilingual code examples.`,
);
