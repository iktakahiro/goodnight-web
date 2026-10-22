# 0004. Deliver the admin UI from the Worker bundle

- Status: accepted
- Date: 2026-10-22

## Context

The admin UI is a React SPA built with Vite and shipped prebuilt in
`@goodnight-web/server`. It lives at `/admin/*` on the user's site. Users
never edit it and get updates through npm. The public site is a static Astro
build served by Workers Static Assets.

Two ways to deliver it:

- **Option A:** an Astro integration (`@goodnight-web/astro`) copies the
  prebuilt files into the site's `dist/admin` at build time. Static Assets
  serve them.
- **Option B:** the package embeds the files in its JavaScript. The Worker
  serves `/admin/*` with `run_worker_first`.

We compared bundle size, deep links (an SPA needs `/admin/inquiries/123` to
return `index.html`), security headers, and how updates reach users. The goal
is the simplest setup that a user's repository cannot break by accident.

## What we tested

Versions: `wrangler` 4.151.2, `astro` 7.4.1, `vite` 8.3.4, `react` 19.1.10,
`@base-ui/react` 1.9.0, `tailwindcss` 4.3.3, `better-auth` 1.7.11.

- A stand-in admin SPA with the planned dependencies (React, Base UI Dialog,
  Menu, Select, Tabs and Toast, Tailwind v4, the Better Auth client with the
  passkey plugin) and a small router. Vite build with `base: "/admin/"`:
  `index.html` (0.37 kB), one CSS file (4.66 kB), one JS file (413.57 kB,
  135.18 kB gzip).
- A static Astro site (home, about, `404.astro`) with a prototype integration
  that copies the admin build into `dist/admin` in `astro:build:done`.
- One Worker with three modes, all with
  `assets.not_found_handling: "404-page"` (the site needs its own 404 page):
  - **A, static only:** `run_worker_first: ["/api/*"]`. SPA fallback through
    `_redirects` and CSP through `_headers` at the root of the assets
    directory.
  - **A, Worker route:** `run_worker_first: ["/api/*", "/admin", "/admin/*"]`.
    The Worker calls `env.ASSETS.fetch()`, falls back to `/admin/` for paths
    without a file extension, and adds security headers.
  - **B, embedded:** a build step turns the Vite output into one JS module
    (path, content type, ETag, body). The Worker serves it with
    `run_worker_first: ["/api/*", "/admin", "/admin/*"]`, `Cache-Control:
    immutable` for hashed files and `no-cache` for `index.html`, 304 on
    `If-None-Match`, and security headers.
- `curl` against each mode for `/`, `/nope`, `/admin`, `/admin/`,
  `/admin/inquiries/abc`, `/admin/login`, a hashed JS file, and a missing JS
  file. Chromium (Playwright 1.64.1) opened the deep links and Base UI popups
  under the CSP.
- `wrangler deploy --dry-run` for size and `wrangler check startup` for
  startup CPU.

## Results

### Deep links

- **A, static only:** with `not_found_handling: "404-page"`,
  `/admin/inquiries/abc` returns the site's 404 page with status 404. The
  usual SPA rule does not help:
  - `/admin/* /admin/index.html 200` is rejected by wrangler: "Infinite loop
    detected in this rule and has been ignored".
  - `/admin/* /admin/ 200` is accepted, but it also rewrites real files. The
    JS bundle and a missing file were both served as `index.html`, so the app
    would not load.
  - Listing each SPA route works (`/admin/inquiries/* /admin/ 200`,
    `/admin/login /admin/ 200`), and real files are still served. But every
    new admin route needs a new line in a file in the user's repository.
  - `not_found_handling: "single-page-application"` would apply to the whole
    site and remove the site's 404 page.
- **A, Worker route:** works after one fix. Falling back to
  `/admin/index.html` made Static Assets answer `307 Location: /admin/` (its
  HTML handling drops `index.html`), and the deep link was lost. Falling back
  to `/admin/` returns the HTML with 200.
- **B, embedded:** works. `run_worker_first: ["/admin/*"]` does not match the
  bare `/admin`, so `/admin` must be listed too, or it falls through to the
  site's 404 page.

In Chromium, `/admin/inquiries/abc`, `/admin/login`, and `/admin` rendered the
right screen in both working modes, with no console errors.

### Security headers

- **A, static only:** a `_headers` rule for `/admin/*` added the CSP to
  admin files and to 404 responses under `/admin/`. It works, but `_headers`
  and `_redirects` are single files at the root of the user's assets
  directory. The integration would have to merge its rules with the user's own
  rules, and the user (or an AI tool) can edit or delete them.
- **A, Worker route** and **B:** the Worker sets the headers on every admin
  response. Nothing in the user's repository controls them.
- This CSP worked with React, Base UI, and Tailwind. Menu and Dialog opened
  with no CSP violations, without `'unsafe-inline'` for styles:
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`.

### Size and startup

| Worker                                                                    | `wrangler deploy --dry-run`   |
| ------------------------------------------------------------------------- | ----------------------------- |
| A (admin files in Static Assets)                                          | 2.37 KiB, 0.96 KiB gzip       |
| B (admin files embedded)                                                  | 411.80 KiB, 133.56 KiB gzip   |
| Auth Worker from [0001](0001-passkey-auth-on-workers.md) + embedded admin | 2,945.61 KiB, 596.96 KiB gzip |

Embedding adds about 134 KiB gzip. With Better Auth the Worker is about 600 KiB
gzip, well under the 3 MB gzip limit for free-plan Workers (from Cloudflare's
documentation, not tested). `wrangler check startup` showed no measurable
startup CPU for the embedded files (the module is one large string literal).
The 41–63 ms of startup CPU in the combined Worker comes from Better Auth.

### Cost per request

- A, static only: admin files never run the Worker.
- A, Worker route and B: every admin page load runs the Worker for
  `index.html` and the hashed files. With `immutable` caching for hashed files
  and ETags, repeat visits are mostly 304s or browser cache hits. Admin
  traffic is small (a few people), so this is not a concern for the free
  plan's daily request limit.

### Updates

Both options update through npm: a new `@goodnight-web/server` version
contains the new admin build. Option A also depends on
`@goodnight-web/astro` being installed, listed in `astro.config`, and the
same version as the server package, and on the site being rebuilt.

## Decision

Use **option B**: embed the prebuilt admin UI in `@goodnight-web/server` and
serve it from the Worker.

- The starter's `wrangler.jsonc` has
  `run_worker_first: ["/api/*", "/admin", "/admin/*"]` and
  `not_found_handling: "404-page"` for the site.
- The package build turns the Vite output into a module with path, content
  type, ETag, and body. The Worker serves hashed files with
  `Cache-Control: public, max-age=31536000, immutable`, `index.html` with
  `no-cache`, answers `If-None-Match` with 304, falls back to `index.html` for
  paths without a file extension, and returns 404 for missing files.
- The Worker adds the CSP and other security headers to every admin response.
- No `@goodnight-web/astro` package is needed for the admin UI.

Reasons:

- Nothing the user owns can break it. There is no integration to remove from
  `astro.config`, no `_redirects` or `_headers` lines to keep in sync, and no
  second package version to match. The only requirement is the
  `run_worker_first` entry, which the starter ships and its `AGENTS.md` marks
  as do-not-edit.
- Deep links and headers are handled in code we test and release, not in
  routing rules in the user's repository.
- The admin UI and the admin API always come from the same package version.
- It does not depend on Astro, so the site generator can change later.
- The costs are acceptable: about 134 KiB gzip in the Worker, and Worker
  requests for admin page loads only.

## Open issues

- Fonts or images in the admin UI must be text (SVG) or base64-encoded in the
  module. Keep the admin UI free of large binary assets.
- Watch the gzip size of the Worker in CI as the admin UI grows.
- Decide whether `/admin` redirects to `/admin/` or serves `index.html`
  directly (the spike served it directly; Vite's absolute `/admin/` paths make
  both work).
- Option A's prototype integration (`astro:build:done` copy) worked and stays
  possible if the Worker size ever becomes a problem.
