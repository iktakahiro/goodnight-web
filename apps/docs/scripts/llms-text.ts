import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { readPages } from './content';
import { i18n, localeFromPath } from '../src/site/i18n';
import { markdownFile } from '../src/site/paths';
import { defaultSiteUrl } from './site-url';

const root = resolve(import.meta.dirname, '..');
const content = `${root}/src/content/docs`;
const dist = `${root}/dist`;
const base = process.env.DOCS_BASE_PATH ?? '/';
const site = `${new URL(process.env.DOCS_SITE_URL ?? defaultSiteUrl).origin}${base}`;
const files = new Map(
  (await readPages(content)).map((page) => [page.slug, page.file]),
);
const slugs = new Set(files.keys());

const intro: Record<string, (other: string) => string> = {
  en: (other) =>
    `Each link points to the Markdown version of a documentation page. [llms-full.txt](${site}llms-full.txt) contains every page in one file. Japanese: [ja/llms.txt](${other}).`,
  ja: (other) =>
    `各リンクはドキュメントページの Markdown 版です。全ページを1ファイルにまとめたものは [llms-full.txt](${site}ja/llms-full.txt) にあります。English: [llms.txt](${other}).`,
};

type Page = { slug: string; title: string; description: string; body: string };

/** Splits validated frontmatter from the MDX body of one page. */
async function readPage(slug: string): Promise<Page> {
  const file = files.get(slug);
  if (!file) throw new Error(`Unknown page: ${slug}`);
  const source = await Bun.file(`${content}/${file}`).text();
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(source);
  const data: unknown = match ? Bun.YAML.parse(match[1] ?? '') : undefined;
  if (
    !match ||
    typeof data !== 'object' ||
    data === null ||
    !('title' in data) ||
    typeof data.title !== 'string' ||
    !('description' in data) ||
    typeof data.description !== 'string'
  )
    throw new Error(`Missing title or description frontmatter: ${slug}`);
  return {
    slug,
    title: data.title,
    description: data.description,
    body: toMarkdown(source.slice(match[0].length).trim()),
  };
}

/** Resolves a router path to an absolute URL, preferring a page's Markdown. */
function absolute(path: string): string {
  const [pathname = '', hash] = path.split('#');
  const slug = pathname.replace(/\/$/u, '');
  const target = slugs.has(slug) ? markdownFile(slug) : pathname;
  return `${site}${target}${hash === undefined ? '' : `#${hash}`}`;
}

const alerts: Record<string, string> = { info: 'NOTE', warn: 'WARNING' };

/**
 * Makes router-relative links absolute and turns callouts into GitHub alerts,
 * leaving fenced code untouched. The architecture diagram is dropped because
 * each page describes it in text as well, and so are MDX comments; other MDX
 * components stay as JSX.
 */
function toMarkdown(body: string): string {
  let fence = '';
  let quote = false;
  const lines: string[] = [];
  for (const line of body.split('\n')) {
    let text = line;
    const marker = /^\s*(`{3,}|~{3,})(.*)$/u.exec(line);
    if (marker?.[1]) {
      if (!fence) fence = marker[1];
      else if (
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2]?.trim()
      )
        fence = '';
    } else if (!fence) {
      const callout = /^<Callout(?:\s+type=["'](\w+)["'])?\s*>$/u.exec(line);
      if (callout) {
        const alert = alerts[callout[1] ?? 'info'];
        if (!alert) throw new Error(`Unsupported callout type: ${callout[1]}`);
        lines.push(`> [!${alert}]`);
        quote = true;
        continue;
      }
      if (quote && line === '</Callout>') {
        quote = false;
        continue;
      }
      if (/^<ArchitectureDiagram\b.*\/>$/u.test(line)) {
        continue;
      }
      // MDX comments, such as `{/* prettier-ignore */}` above a code excerpt.
      if (/^\{\/\*.*\*\/\}$/u.test(line.trim())) {
        continue;
      }
      text = line.replace(
        /(\]\(|href=["'])\/(?!\/)([^)"'\s]*)/gu,
        (_, opening: string, path: string) => `${opening}${absolute(path)}`,
      );
    }
    lines.push(quote ? (text ? `> ${text}` : '>') : text);
  }
  return lines.join('\n');
}

/** Renders one page as standalone Markdown, optionally naming its HTML URL. */
function markdown(page: Page, source = false): string {
  const url = source
    ? `Source: ${site}${page.slug ? `${page.slug}/` : ''}\n\n`
    : '';
  return `# ${page.title}\n\n> ${page.description}\n\n${url}${page.body}\n`;
}

/** Reads one meta.json file, which must list its pages in order. */
async function readMeta(
  directory: string,
): Promise<{ title: string; pages: string[] }> {
  const meta: unknown = await Bun.file(
    `${content}/${directory}meta.json`,
  ).json();
  if (
    typeof meta !== 'object' ||
    meta === null ||
    !('title' in meta) ||
    typeof meta.title !== 'string' ||
    !('pages' in meta) ||
    !Array.isArray(meta.pages) ||
    !meta.pages.every((entry) => typeof entry === 'string')
  )
    throw new Error(`Invalid navigation: ${directory}meta.json`);
  return { title: meta.title, pages: meta.pages };
}

/**
 * Reads meta.json navigation as sections in reading order. A `---Label---`
 * separator starts a section, and a folder with its own meta.json becomes a
 * section named by that file's title.
 */
async function readSections(
  locale: string,
): Promise<{ title: string; pages: string[] }[]> {
  const prefix = locale === i18n.defaultLanguage ? '' : `${locale}/`;
  const sections: { title: string; pages: string[] }[] = [];
  const add = (title: string, slug: string) => {
    const section = sections.at(-1);
    if (section?.title === title) section.pages.push(slug);
    else sections.push({ title, pages: [slug] });
  };
  const walk = async (directory: string, heading: string) => {
    const meta = await readMeta(directory);
    let title = heading || meta.title;
    // Fumadocs uses an unlisted index.mdx as the folder's own page.
    if (
      !meta.pages.includes('index') &&
      (await Bun.file(`${content}/${directory}index.mdx`).exists())
    )
      add(title, directory.replace(/\/$/u, ''));
    for (const entry of meta.pages) {
      const separator = /^---(?:\[[^\]]+\])?(.+)---$/u.exec(entry);
      if (separator?.[1]) {
        title = separator[1];
        continue;
      }
      if (
        await Bun.file(`${content}/${directory}${entry}/meta.json`).exists()
      ) {
        await walk(`${directory}${entry}/`, '');
        continue;
      }
      add(
        title,
        `${directory}${entry === 'index' ? '' : entry}`.replace(/\/$/u, ''),
      );
    }
  };
  await walk(prefix, '');
  return sections;
}

async function write(path: string, text: string): Promise<void> {
  await mkdir(dirname(`${dist}/${path}`), { recursive: true });
  await Bun.write(`${dist}/${path}`, text);
}

for (const locale of i18n.languages) {
  const prefix = locale === i18n.defaultLanguage ? '' : `${locale}/`;
  const sections = await readSections(locale);
  const ordered = sections.flatMap((section) => section.pages);
  const localized = [...slugs].filter(
    (slug) => localeFromPath(slug) === locale,
  );
  const missing = localized.filter((slug) => !ordered.includes(slug));
  if (missing.length)
    throw new Error(`Pages missing from navigation: ${missing.join(', ')}`);
  const pages = new Map<string, Page>();
  for (const slug of ordered) pages.set(slug, await readPage(slug));

  for (const page of pages.values())
    await write(markdownFile(page.slug), markdown(page));

  const home = pages.get(prefix.replace(/\/$/u, ''));
  if (!home) throw new Error(`Missing home page for ${locale}`);
  const other =
    locale === i18n.defaultLanguage ? `${site}ja/llms.txt` : `${site}llms.txt`;
  const index = [
    `# goodnight-web\n\n> ${home.description}\n\n${intro[locale]?.(other) ?? ''}`,
    ...sections.map(
      (section) =>
        `## ${section.title}\n\n${section.pages
          .map((slug) => {
            const page = pages.get(slug);
            return `- [${page?.title}](${site}${markdownFile(slug)}): ${page?.description}`;
          })
          .join('\n')}`,
    ),
  ].join('\n\n');
  await write(`${prefix}llms.txt`, `${index}\n`);

  const full = [...pages.values()].map((page) => markdown(page, true));
  await write(`${prefix}llms-full.txt`, full.join('\n'));
}
console.log('Generated llms.txt, llms-full.txt, and per-page Markdown.');
