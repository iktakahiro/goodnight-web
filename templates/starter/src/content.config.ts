import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Fields at the top of every news and blog Markdown file.
 * Files live in `src/content/<collection>/<locale>/<slug>.md`.
 */
const postSchema = z.object({
  title: z.string(),
  /** One or two sentences shown in lists and used for search engines. */
  description: z.string(),
  /** Publication date, written as `2026-10-01`. */
  date: z.coerce.date(),
  /** Date of the last important change, written as `2026-10-15`. */
  updated: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  /** Set to `true` to keep the post out of the built site. */
  draft: z.boolean().default(false),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: postSchema,
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: postSchema,
});

/** Long text pages written in Markdown, such as the privacy policy. */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date(),
  }),
});

/** The content collections of the site. */
export const collections = { news, blog, pages };
