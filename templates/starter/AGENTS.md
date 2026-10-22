# Instructions for AI coding tools

This repository is a company website built with goodnight-web. The people
who ask you for changes are often not engineers. Make the change they ask
for, keep the site working, and explain what you changed in plain words.

The site is an Astro static site. The contact form API and the admin screen
come from the `@goodnight-web/server` package. Everything runs on one
Cloudflare Worker with one D1 database.

## What you may edit

- `site.config.ts`: company name, address, phone, email, the company profile
  table, navigation, theme colors, the Turnstile site key, and the contact
  form categories.
- `src/pages/`: the pages. Pages in `src/pages/[...lang]/` are built once per
  language. Each page keeps its Japanese and English text side by side in a
  `text` object at the top of the file.
- `src/content/`: Markdown for news (`news/`), blog posts (`blog/`), and the
  privacy policy (`pages/`). Each language has its own folder (`ja/`, `en/`).
- `src/components/`, `src/layouts/`, `src/features/`: the look of the site,
  including the contact form layout and labels.
- `src/styles/`: CSS. Theme colors are set in `site.config.ts`.
- `public/`: images, the favicon, and other files served as they are.

## What you must not change

- `src/worker.ts`: keep the `createGoodnightWorker(...)` call as it is.
- `wrangler.jsonc`: do not rename the bindings (`DB`, the rate limit binding,
  `ASSETS`), and do not remove `/api/*`, `/admin`, or `/admin/*` from
  `run_worker_first`. The contact form and the admin screen stop working
  without them.
- `@goodnight-web/*` packages: do not edit files in `node_modules`, do not
  copy their code into this repository, and do not change their version by
  hand. Updates arrive as pull requests from Dependabot.
- `.github/workflows/` and `.github/scripts/`: these check update pull
  requests and the repository visibility.
- The field names in the contact form (`name`, `email`, `company`, `phone`,
  `category`, `body`, `consent`, and the hidden `website`). The server reads
  them. You may change labels, order, and styles.
- Do not run `wrangler d1 migrations create`. Database migrations ship inside
  `@goodnight-web/server`.
- Do not add secrets, API keys, or passwords to any file. Secrets are set in
  the Cloudflare dashboard. The Turnstile site key in `site.config.ts` is
  public and is the only key that belongs in the code.

## Japanese and English

Every page exists in Japanese (`ja`) and English (`en`).

- When you add or change text in one language, change the other language in
  the same edit.
- For Markdown, create the file in both `src/content/<collection>/ja/` and
  `src/content/<collection>/en/` with the same file name.
- Links inside Markdown need the language prefix of the page. With the
  default settings, Japanese pages are at `/` (for example `/contact/`) and
  English pages are under `/en/` (for example `/en/contact/`).
- Shared texts (menu, footer, "Read more") are in `src/i18n/ui.ts`.

## How to check your change

Run both commands. Both must finish without errors.

```sh
npm run check
npm run build
```

To look at the site, run `npm run dev` and open the URL it prints.

## Updates and pull requests

- Merge only pull requests that have the "official goodnight-web update"
  comment from the Update check workflow. If a pull request has the warning
  comment, do not merge it unless a person who understands the change has
  reviewed it.
- Do not merge pull requests on your own. Tell the person what the pull
  request changes and let them decide.

## Repository visibility

This repository must stay private. Never change it to public. If the
Visibility check workflow fails, the repository is public; tell the person to
make it private (GitHub: Settings > General > Danger Zone > Change
visibility > Private).
