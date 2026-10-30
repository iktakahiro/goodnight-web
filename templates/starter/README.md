# goodnight-web starter

A website with news, a blog, and a contact form. It runs on
Cloudflare only: one Worker serves the pages, the contact form API, and an
admin screen for reading inquiries, and one D1 database stores the inquiries.

[日本語](README.ja.md)

- Pages: home, about (company profile), services, news, blog, contact,
  privacy policy, and a 404 page, in Japanese and English.
- Content: Markdown files in `src/content/`.
- Settings: company details, menu, and colors in `site.config.ts`.
- Contact form fields: edited in the admin screen (`/admin`, **Form** page),
  not in the code. See [Contact form](#contact-form).
- The contact form API and the admin screen come from the
  `@goodnight-web/server` package. You do not edit it; updates arrive as
  pull requests.

There is no server, language runtime, or database server for you to
maintain. What remains is reviewing and merging update pull requests (see
[Updates](#updates)).

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iktakahiro/goodnight-web/tree/main/templates/starter)

1. Click **Deploy to Cloudflare** above.
2. In the setup form, tick **Create private Git repository**. If you leave it
   unticked, the new repository is public, and the **Visibility check**
   workflow in it fails on every push.
3. Enter the secrets listed below. Two are required: `APP_SECRET` and
   `ADMIN_EMAILS`. Cloudflare creates the Worker and the D1 database and
   deploys the site.
4. If the repository was created as public anyway, make it private on
   GitHub: **Settings > General > Danger Zone > Change visibility >
   Private**.

If you use `npm create cloudflare` instead, it creates the project on your
computer only. Create the GitHub repository yourself and choose **Private**.

## Secrets

Set these as Worker secrets in the Cloudflare dashboard (or in the deploy
form). Never write them in a file in this repository. `.dev.vars.example`
lists them with notes. The deploy form does not generate values for you:
create `APP_SECRET` with `openssl rand -base64 32`. A value that is too short
or clearly not random (such as one character repeated) keeps the features that
use it off.

| Name                               | Required | Purpose                                                                                                                                                                                                             |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_SECRET`                       | yes      | A random string (32 characters or more). You enter it once at `/admin` to create the first admin. The keys for admin sessions and IP address hashes are derived from it. Create one with `openssl rand -base64 32`. |
| `ADMIN_EMAILS`                     | yes      | Email addresses that may become admins, separated by commas.                                                                                                                                                        |
| `TURNSTILE_SECRET`                 | yes      | The Turnstile secret key. Without it, the contact form does not accept inquiries.                                                                                                                                   |
| `SLACK_WEBHOOK_URL`                | no       | A Slack incoming webhook for new-inquiry notices. Notices contain no names or form contents.                                                                                                                        |
| `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN` | no       | Cloudflare Access in front of the admin screen. Set both or neither.                                                                                                                                                |

Keep `APP_SECRET` after setup. If you delete it, sign-in and the contact form
stop working. If you change it, every admin is signed out and IP address
hashes change. Keep a copy in a password manager.

If you prefer separate keys, you can also set `SETUP_TOKEN`,
`BETTER_AUTH_SECRET`, and `IP_HASH_SECRET` (each 32 characters or more). A
value that is set is used instead of the one derived from `APP_SECRET`. Sites
that already set these three keep working as before.

## Contact form

The fields of the contact form (name, company, category, message, and any
fields you add) are edited in the admin screen: open `/admin` and go to the
**Form** page. Each save creates a new version, and a change shows on the
site within about a minute, without a deploy. The contact page loads the
fields from the Worker (`GET /api/contact/form`) when it opens.

Some parts are fixed and cannot be removed: the email address field, the
privacy policy consent, the hidden spam trap (honeypot), and the Turnstile
check. When you change the fields, also update the list of collected
information in the privacy policy (`src/content/pages/`).

## Turnstile

The contact form uses Cloudflare Turnstile to stop spam. Until Turnstile is
set up, the contact page says that the form is not available yet, and the
API refuses submissions.

1. Create a Turnstile widget in the Cloudflare dashboard for your site's
   domain.
2. Put the **site key** in `wrangler.jsonc` (`vars.TURNSTILE_SITE_KEY`) and
   commit it. It is public. The contact form reads it from the Worker, so
   this is the only place to set it. A value set only in the dashboard is
   replaced by the one in `wrangler.jsonc` on the next deploy.
3. Set the **secret key** as the `TURNSTILE_SECRET` Worker secret.

The documentation has a step-by-step page:
[Setup > Turnstile](https://goodnight-web.dev/docs/setup/turnstile/).

## First admin

1. Open `https://<your-site>/admin`.
2. Enter the value of `APP_SECRET` and an email address listed in
   `ADMIN_EMAILS`. If you set `SETUP_TOKEN`, enter that instead.
3. Register a passkey (for example with your phone or your computer's
   fingerprint or face sign-in). There are no passwords.

Setup closes once the first admin exists. Do not delete `APP_SECRET`
afterwards; the site still uses it.

A passkey works only on the domain it was registered on, so attach your own
domain to the Worker before step 1 if you have one. Then set
`"workers_dev": false` in `wrangler.jsonc` and commit it, so the
`workers.dev` address is turned off. Do not use the switch in the Cloudflare
dashboard: every deploy applies `wrangler.jsonc` again. Preview URLs are off
(`"preview_urls": false`): each preview version would run with your
production database and secrets at a public address.

## Edit the site

- Company details, menu, and colors: `site.config.ts`. See
  [Change the site colors](#change-the-site-colors).
- Fonts: `src/styles/global.css`. See [Fonts](#fonts).
- Pages: `src/pages/`
- Search engines: `sitemap.xml` lists published pages and `robots.txt` points to it.
- News and blog posts: `src/content/news/` and `src/content/blog/`
- Privacy policy: `src/content/pages/`. It is a template, not legal advice.
  Have it reviewed before you publish.

Keep the Japanese and English versions in step. If you edit with an AI tool,
it reads [AGENTS.md](AGENTS.md) for the rules.

### Change the site colors

The sample site uses a green theme. To use your own colors, change the three
values in `theme` in `site.config.ts`:

| Key          | Used for                                                   |
| ------------ | ---------------------------------------------------------- |
| `primary`    | Buttons, links, highlights, and the keyboard focus outline |
| `background` | Page background                                            |
| `foreground` | Main text                                                  |

The lighter and darker shades (for example the light tint behind badges and
the darker color of links) are mixed from these three in
`src/styles/global.css`. That file also sets the colors that do not follow
them: error (`--color-danger`), success (`--color-success`), and the soft
shapes on the home page (`--color-decor-wood`, `--color-decor-leaf`).

Keep the text readable. White text on `primary`, and `foreground` text on
`background`, need a contrast ratio of at least 4.5:1 (WCAG AA). Check your
colors with a contrast checker.

These colors apply only to your site. The admin screen (`/admin`) comes with
`@goodnight-web/server` and keeps its own theme.

### Fonts

The site loads no web fonts. It uses the fonts installed on the visitor's
device. The font lists are `--font-sans` (all text) and `--font-mono` (code)
in `src/styles/global.css`; change them there to change the fonts on every
page. If you add a web font service, mention it in the privacy policy.

Check your changes before you push:

```sh
npm install
npm run check
npm run build
npm run dev
```

`package-lock.json` records the exact version of every package. Cloudflare
installs with `npm ci` from it, so the first deploy and every later build get
exactly the committed packages. Do not edit versions in `package.json` by
hand without updating the lockfile: run `npm install` (or
`npm install <package>@<version>`) and commit `package.json` and
`package-lock.json` together. If they do not match, `npm ci` and the build
fail.

`npm run dev` shows the pages only. To try the contact form and the admin
screen on your computer, copy `.dev.vars.example` to `.dev.vars`, fill it
in, and run `npm run preview`. It builds the site, creates the tables in a
local database, and starts the Worker with `wrangler dev`.

Cloudflare's Turnstile test keys (site key `1x00000000000000000000AA`,
secret key `1x0000000000000000000000000000000AA`) show the widget on your
computer, but the server rejects them: Turnstile then reports the hostname
`example.com` and no action, and the server checks both.
`npm run test:e2e` runs the end-to-end test, which uses the test keys with
`e2e/worker.ts` to get past this check. It needs
`npx playwright install chromium` once.

## Updates

Dependabot opens pull requests that update packages (`.github/dependabot.yml`).
It updates `package.json` and `package-lock.json` together. goodnight-web
updates (`@goodnight-web/*`) come in one pull request, after a 5-day
cooldown. Security updates are not delayed.

The **Update check** workflow comments on every pull request and sets the
check `goodnight-web/update-check` on its latest commit:

- "Official goodnight-web update" and a passing check: the pull request was
  opened by Dependabot in this repository, every commit in it was made by
  Dependabot, it changes only `package.json` and the lockfile, and it changes
  only `@goodnight-web/*` versions in `package.json`. The lockfile may also
  change packages that `@goodnight-web/*` uses, but only to packages from
  the npm registry. Safe to merge.
- "This is not an official update": anything else. If you don't understand
  the changes, don't merge.

**Merge only pull requests that have the official update comment and a
passing `goodnight-web/update-check` check.** Updates
of other packages (such as Astro) also come from Dependabot and get the
warning comment; ask someone who can review them.

## Keep the repository private

This repository holds your site's settings and drafts. Keep it private. The
**Visibility check** workflow fails when it is public.
