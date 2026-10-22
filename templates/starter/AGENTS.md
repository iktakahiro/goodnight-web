# Instructions for AI coding tools

This repository is a company website built with goodnight-web. The people
who ask you for changes are often not engineers. Make the change they ask
for, keep the site working, and explain what you changed in plain words.

The site is an Astro static site. The contact form API and the admin screen
come from the `@goodnight-web/server` package. Everything runs on one
Cloudflare Worker with one D1 database.

## What you may edit

- `site.config.ts`: company name, address, phone, email, the company profile
  table, navigation, and theme colors.
- `wrangler.jsonc`: only the value of `vars.TURNSTILE_SITE_KEY` (the public
  Turnstile site key) and the Worker `name`.
- `src/pages/`: the pages. Pages in `src/pages/[...lang]/` are built once per
  language. Each page keeps its Japanese and English text side by side in a
  `text` object at the top of the file.
- `src/content/`: Markdown for news (`news/`), blog posts (`blog/`), and the
  privacy policy (`pages/`). Each language has its own folder (`ja/`, `en/`).
- `src/components/`, `src/layouts/`, `src/features/`: the look of the site,
  including the look of the contact form and its fixed texts.
- `src/styles/`: CSS. Theme colors are set in `site.config.ts`.
- `public/`: images, the favicon, and other files served as they are.

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
- The `data-*` attributes in `src/features/contact/contact-form.astro`
  and the request the form script sends. The form script and the server
  read them. You may change the fixed texts, the layout, and the styles.
- Do not run `wrangler d1 migrations create`. Database migrations ship inside
  `@goodnight-web/server`.
- Do not add secrets, API keys, or passwords to any file. Secrets are set in
  the Cloudflare dashboard. The Turnstile site key (`TURNSTILE_SITE_KEY` in
  `wrangler.jsonc`) is public and is the only key that belongs in the code.

## Contact form fields

The fields of the contact form are not in the code. Admins edit them in the
admin screen (`/admin`, "Form" page); the server stores them in D1, and the
contact page loads them from `GET /api/contact/form` and renders them in the
browser. So:

- To add, remove, rename, or reorder a field, or to change its choices, tell
  the person to do it on the Form page of the admin screen. Do not add form
  fields to the page yourself: the server accepts only the fields of the
  current form and rejects anything else.
- Never write field ids (such as `f_name`) or option values into pages,
  scripts, or tests. They come from the API.
- Fixed parts that cannot be removed: the email address field, the privacy
  policy consent, the hidden honeypot, and the Turnstile check.
- When the fields change, update the list of collected information in the
  privacy policy (`src/content/pages/ja/privacy.md` and `en/privacy.md`).

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
