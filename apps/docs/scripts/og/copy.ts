import { resolve } from 'node:path';
import { openGraphImages } from '../../src/site/open-graph.ts';

/** What one share image says, and which admin screenshot it shows. */
export interface OgCopy {
  locale: 'ja' | 'en';
  /** Hero title lines; the last line carries the highlight. */
  title: string[];
  highlight: string;
  /** The sub line under the title, one string per line of the image. */
  eyebrow: string[];
  /** Screenshot shown in the browser frame, relative to `public/`. */
  screenshot: string;
  /** Output file, relative to `public/`. */
  output: string;
}

const root = resolve(import.meta.dirname, '../..');

/**
 * Reads the `hero` block of a docs top page, so the title never drifts from
 * the page. The sub line is written here instead: the image says where the
 * kit runs, while the page eyebrow says who it is for.
 */
async function readHero(file: string) {
  const source = await Bun.file(`${root}/src/content/docs/${file}`).text();
  const frontmatter = /^---\n([\s\S]*?)\n---/u.exec(source)?.[1];
  const hero = (Bun.YAML.parse(frontmatter ?? '') as { hero?: unknown })
    .hero as { title: string; highlight: string; eyebrow: string } | undefined;
  if (!hero) throw new Error(`${file} has no hero block.`);
  return hero;
}

export async function readOgCopy(): Promise<OgCopy[]> {
  const ja = await readHero('ja/index.mdx');
  const en = await readHero('index.mdx');
  return [
    {
      locale: 'ja',
      title: ja.title.split('\n'),
      highlight: ja.highlight,
      eyebrow: ['Cloudflareではじめる', 'Webサイトスターターキット'],
      screenshot: 'images/admin/inquiry-list-ja-light.webp',
      output: openGraphImages.ja.path,
    },
    {
      locale: 'en',
      title: en.title.split('\n'),
      highlight: en.highlight,
      eyebrow: ['A website starter kit, on Cloudflare'],
      screenshot: 'images/admin/inquiry-list-en-light.webp',
      output: openGraphImages.en.path,
    },
  ];
}
