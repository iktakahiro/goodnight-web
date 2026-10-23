import { createFileRoute, notFound } from '@tanstack/react-router';
import { Suspense, use } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { docs, source } from '../site/source';
import { mdxComponents } from '../site/mdx-components';
import { homeLayoutOptions, layoutOptions } from '../site/navigation';
import { docsSection, groupSections } from '../site/navigation-tree';
import { openGraphImages, openGraphSize } from '../site/open-graph';
import { markdownFile, sitePath } from '../site/paths';
import { i18n, localeFromPath } from '../site/i18n';
import { MotionConfig } from 'motion/react';
import { heroTitleText, LandingHero } from '../site/landing/landing-hero';
import { landingMdxComponents } from '../site/landing/landing-mdx-components';
import { SiteFooter } from '../site/site-footer';

/** Open Graph locale for each documentation language. */
const openGraphLocales = { en: 'en_US', ja: 'ja_JP' } as const;

/** Resolves every English/Japanese MDX page without a server function. */
export const Route = createFileRoute('/$')({
  loader: async ({ params }) => {
    const slug = (params._splat ?? '').replace(/\/$/u, '');
    const locale = localeFromPath(slug);
    const slugs = slug
      .split('/')
      .filter(Boolean)
      .slice(locale === i18n.defaultLanguage ? 0 : 1);
    const page = source.getPage(slugs, locale);
    if (!page) throw notFound();
    await page.data.preload();
    return {
      slug,
      locale,
      slugs,
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      hero: page.data.hero,
    };
  },
  head: ({ loaderData: page }) => {
    if (!page) return {};
    const url = `${__DOCS_SITE_URL__}${sitePath(page.slug ? `${page.slug}/` : '')}`;
    const title = `${page.hero ? heroTitleText(page.hero.title) : page.title} | goodnight-web`;
    // Every page shares its language's image; the origin is DOCS_SITE_URL.
    const image = openGraphImages[page.locale === 'ja' ? 'ja' : 'en'];
    const imageUrl = `${__DOCS_SITE_URL__}${sitePath(image.path)}`;
    return {
      meta: [
        { title },
        { name: 'description', content: page.description },
        { property: 'og:site_name', content: 'goodnight-web' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: page.description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: url },
        {
          property: 'og:locale',
          content:
            page.locale === 'ja' ? openGraphLocales.ja : openGraphLocales.en,
        },
        { property: 'og:image', content: imageUrl },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:width', content: String(openGraphSize.width) },
        { property: 'og:image:height', content: String(openGraphSize.height) },
        { property: 'og:image:alt', content: image.alt },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: page.description },
        { name: 'twitter:image', content: imageUrl },
        { name: 'twitter:image:alt', content: image.alt },
      ],
      links: [
        { rel: 'canonical', href: url },
        {
          rel: 'alternate',
          type: 'text/markdown',
          href: `${__DOCS_SITE_URL__}${sitePath(markdownFile(page.slug))}`,
        },
        ...i18n.languages.flatMap((locale) => {
          const alternate = source.getPage(page.slugs, locale);
          if (!alternate) return [];
          // Page URLs omit the trailing slash that every canonical URL carries.
          const href = `${__DOCS_SITE_URL__}${sitePath(`${alternate.url.replace(/\/$/u, '')}/`)}`;
          return [
            { rel: 'alternate', hrefLang: locale, href },
            ...(locale === i18n.defaultLanguage
              ? [{ rel: 'alternate', hrefLang: 'x-default', href }]
              : []),
          ];
        }),
      ],
    };
  },
  component: Page,
});

function Content() {
  const page = Route.useLoaderData();
  const content = docs.getPage(page.path);
  if (!content) throw notFound();
  const { toc } = use(content.load());
  const MDX = content.body;
  const japanese = page.locale === 'ja';
  if (page.hero)
    return (
      <HomeLayout {...homeLayoutOptions(page.slug)}>
        {/* Motion follows the reduced motion setting; landing.css also shows
            the final state then, and when scripting is off. */}
        <MotionConfig reducedMotion='user'>
          <div className='landing' id='main-content'>
            <LandingHero page={page} />
            <MDX components={landingMdxComponents} />
          </div>
          <SiteFooter japanese={japanese} />
        </MotionConfig>
      </HomeLayout>
    );
  return (
    <DocsLayout
      {...layoutOptions(page.slug)}
      tree={groupSections(docsSection(source.getPageTree(page.locale)))}
    >
      <DocsPage toc={toc} id='main-content'>
        <DocsTitle>{page.title}</DocsTitle>
        <DocsDescription className='page-description'>
          {page.description}
        </DocsDescription>
        <DocsBody>
          <MDX components={mdxComponents} />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}

function Page() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
