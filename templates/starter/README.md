# goodnight-web starter

A company website with news, a blog, and a contact form. It runs on
Cloudflare only: one Worker serves the pages, the contact form API, and an
admin screen for reading inquiries, and one D1 database stores the inquiries.

[日本語](README.ja.md)

- Pages: home, about (company profile), services, news, blog, contact,
  privacy policy, and a 404 page, in Japanese and English.
- Content: Markdown files in `src/content/`.
- Settings: company details, menu, colors, and contact form categories in
  `site.config.ts`.
- The contact form API and the admin screen come from the
  `@goodnight-web/server` package. You do not edit it; updates arrive as
  pull requests.

There is no server, language runtime, or database server for you to
maintain. What remains is reviewing and merging update pull requests (see
[Updates](#updates)).

## Deploy

> **DRAFT.** These steps have not been tested end to end yet.

1. Click **Deploy to Cloudflare**.
   <!-- The button is added when the starter repository is published. -->
2. In the setup form, tick **Create private Git repository**. If you leave it
   unticked, the new repository is public.
3. Enter the secrets listed below. Cloudflare creates the Worker and the D1
   database and deploys the site.
4. If the repository was created as public anyway, make it private on
   GitHub: **Settings > General > Danger Zone > Change visibility >
   Private**. The **Visibility check** workflow fails while the repository is
   public.

If you use `npm create cloudflare` instead, it creates the project on your
computer only. Create the GitHub repository yourself and choose **Private**.

## Secrets

Set these as Worker secrets in the Cloudflare dashboard (or in the deploy
form). Never write them in a file in this repository. `.dev.vars.example`
lists them with notes.

| Name                 | Required | Purpose                                                                                               |
| -------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `SETUP_TOKEN`        | yes      | A random string (32 characters or more). You enter it once at `/admin` to create the first admin.     |
| `ADMIN_EMAILS`       | yes      | Email addresses that may become admins, separated by commas.                                          |
| `BETTER_AUTH_SECRET` | yes      | A long random string (32 characters or more) that signs admin sessions.                               |
| `IP_HASH_SECRET`     | yes      | A random string (32 characters or more) used to hash IP addresses. Raw IP addresses are never stored. |
| `TURNSTILE_SECRET`   | yes      | The Turnstile secret key. Without it, the contact form does not accept inquiries.                     |
| `SLACK_WEBHOOK_URL`  | no       | A Slack incoming webhook for new-inquiry notices. Notices contain no names or message text.           |

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

The documentation has a step-by-step page (Setup > Turnstile).
<!-- Link added when the documentation site is published. -->

## First admin

1. Open `https://<your-site>/admin`.
2. Enter `SETUP_TOKEN` and an email address listed in `ADMIN_EMAILS`.
3. Register a passkey (for example with your phone or your computer's
   fingerprint or face sign-in). There are no passwords.

Setup closes once the first admin exists.

## Edit the site

- Company details, menu, and colors: `site.config.ts`
- Pages: `src/pages/`
- News and blog posts: `src/content/news/` and `src/content/blog/`
- Privacy policy: `src/content/pages/`. It is a template, not legal advice.
  Have it reviewed before you publish.

Keep the Japanese and English versions in step. If you edit with an AI tool,
it reads [AGENTS.md](AGENTS.md) for the rules.

Check your changes before you push:

```sh
npm install
npm run check
npm run build
npm run dev
```

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
goodnight-web updates (`@goodnight-web/*`) come in one pull request, after a
5-day cooldown. Security updates are not delayed.

The **Update check** workflow comments on every pull request:

- "Official goodnight-web update": the pull request was opened by Dependabot
  in this repository, changes only `package.json` and the lockfile, and
  changes only `@goodnight-web/*` versions in `package.json`. The lockfile
  may also change packages that `@goodnight-web/*` uses. Check the preview,
  then merge.
- "This is not an official update": anything else. If you don't understand
  the changes, don't merge.

**Merge only pull requests that have the official update comment.** Updates
of other packages (such as Astro) also come from Dependabot and get the
warning comment; ask someone who can review them.

## Keep the repository private

This repository holds your site's settings and drafts. Keep it private. The
**Visibility check** workflow fails when it is public.
