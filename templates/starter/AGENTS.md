# Instructions for AI coding tools

This repository is a company website built with goodnight-web. The people
who ask you for changes are often not engineers. Make the change they ask
for, keep the site working, and explain what you changed in plain words.

The site is an Astro static site. The contact form API and the admin screen
come from the `@goodnight-web/server` package. Everything runs on one
Cloudflare Worker with one D1 database.

## What you may edit

- `site.config.ts`: company name, address, phone, email, the company profile
  table, navigation, theme colors, and the contact form categories.
- `wrangler.jsonc`: only the value of `vars.TURNSTILE_SITE_KEY` (the public
  Turnstile site key) and the Worker `name`.
- `src/pages/`: the pages. Pages in `src/pages/[...lang]/` are built once per
  language. Each page keeps its Japanese and English text side by side in a
  `text` object at the top of the file.
- `src/content/`: Markdown for news (`news/`), blog posts (`blog/`), and the
  privacy policy (`pages/`). Each language has its own folder (`ja/`, `en/`).
- `src/components/`, `src/layouts/`, `src/features/`: the look of the site,
  including the contact form layout and labels.
- `src/styles/`: CSS. See "Site colors" and "Fonts" below.
- `public/`: images, the favicon, and other files served as they are.

## Site colors

The site's colors belong to this repository. The admin screen (`/admin`)
comes from `@goodnight-web/server` with its own fixed theme; it does not use
these colors and you cannot change it here.

- `site.config.ts`, `theme`: the three main colors. `primary` is used for
  buttons, links, highlights, and the keyboard focus outline; `background` is
  the page background; `foreground` is the main text color. Use 6-digit hex
  values.
- `src/styles/global.css`, `@theme inline`: the shades mixed from the main
  colors (`--color-primary-soft`, `--color-primary-strong`,
  `--color-border`, `--color-muted`, and others), and the colors that do not
  follow them: `--color-danger`, `--color-success`, and the home page
  decorations `--color-decor-wood` and `--color-decor-leaf`.
- When you change a color, keep the text readable (WCAG AA): white text on
  `primary`, and `foreground` text on `background`, need a contrast ratio of
  at least 4.5:1. Form field borders and the focus outline need 3:1. Check
  the result with a contrast checker before you finish.
- Use the color names (`bg-primary`, `text-muted`, `border-border`) in
  classes, not hex values, so a color change in one place reaches every page.

## Fonts

The site uses the fonts installed on the visitor's device and loads no web
fonts. The font stacks are defined once, in `src/styles/global.css`
(`@theme inline`): `--font-sans` for all text and `--font-mono` for code.
Change them there, and use the `font-sans` and `font-mono` classes instead of
writing `font-family` in components.

Do not add web fonts (font packages, font files in `public/`, or links to a
font service) unless the site owner asks for them. A font service receives a
request from every visitor, and the privacy policy would need to mention it.

## What you must not change

- `src/worker.ts`: keep the `createGoodnightWorker(...)` call as it is.
- `wrangler.jsonc`: do not rename the bindings (`DB`, `CONTACT_RATE_LIMITER`,
  `ASSETS`), do not change `migrations_dir`, and do not remove `/api/*`,
  `/admin`, or `/admin/*` from `run_worker_first`. The contact form and the
  admin screen stop working without them.
- `e2e/`: the end-to-end test. `e2e/worker.ts` is for the test only; never
  use it as the site's Worker.
- `@goodnight-web/*` packages: do not edit files in `node_modules`, do not
  copy their code into this repository, and do not change their version by
  hand. Updates arrive as pull requests from Dependabot.
- `.github/workflows/` and `.github/scripts/`: these check update pull
  requests and the repository visibility.
- The field names in the contact form (`name`, `email`, `company`, `phone`,
  `category`, `message`, `consent`, and the hidden `website`) and the
  `data-*` attributes in `src/features/contact/contact-form.astro`. The
  server and the form script read them. You may change labels, order, and
  styles.
- Do not run `wrangler d1 migrations create`. Database migrations ship inside
  `@goodnight-web/server`.
- Do not add secrets, API keys, or passwords to any file. Secrets are set in
  the Cloudflare dashboard. The Turnstile site key (`TURNSTILE_SITE_KEY` in
  `wrangler.jsonc`) is public and is the only key that belongs in the code.

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

To look at the site, run `npm run dev` and open the URL it prints. The
contact form and the admin screen need the Worker: run `npm run preview`
(it reads secrets from `.dev.vars`; see `.dev.vars.example`).

When you change the contact form, the Worker, or `wrangler.jsonc`, also run
`npm run test:e2e` (it needs `npx playwright install chromium` once and
network access to Cloudflare Turnstile).

## Updates and pull requests

- Merge only pull requests that have the "official goodnight-web update"
  comment from the Update check workflow. The workflow gives that comment
  only to a Dependabot pull request from this repository that changes only
  `package.json` and the lockfile, and only `@goodnight-web/*` versions in
  `package.json`. The lockfile may also change packages that
  `@goodnight-web/*` uses. If a pull request has the warning
  comment, do not merge it unless a person who understands the change has
  reviewed it.
- Do not merge pull requests on your own. Tell the person what the pull
  request changes and let them decide.

## Repository visibility

This repository must stay private. Never change it to public. If the
Visibility check workflow fails, the repository is public; tell the person to
make it private (GitHub: Settings > General > Danger Zone > Change
visibility > Private).
