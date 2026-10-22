# @goodnight-web/server

The server side of a goodnight-web site: one Hono app for a Cloudflare Worker
with the contact API, first-admin setup, passkey sign-in (Better Auth), the
admin API, the prebuilt admin UI, security headers, and the D1 migrations.

Sites use it from `src/worker.ts` and do not edit it:

```ts
import { createGoodnightWorker } from '@goodnight-web/server';

export default createGoodnightWorker({
  locale: 'ja',
  contact: {
    categories: [
      { value: 'sales', label: { ja: '製品・料金について', en: 'Sales' } },
      { value: 'press', label: { ja: '取材・メディア', en: 'Press' } },
      'other',
    ],
  },
});
```

Each category is a plain value (`'other'`) or `{ value, label: { ja, en } }`.
The contact API accepts, stores, and sends to Slack only the `value`; the
admin UI shows the label in the admin's language, or the value when there is
no label.

`wrangler.jsonc` needs:

- `assets.run_worker_first: ["/api/*", "/admin", "/admin/*"]`
- a D1 binding `DB` with
  `"migrations_dir": "node_modules/@goodnight-web/server/migrations"`
- a Rate Limiting binding `CONTACT_RATE_LIMITER`
- the variable `TURNSTILE_SITE_KEY` and the secrets `SETUP_TOKEN`,
  `ADMIN_EMAILS`, `BETTER_AUTH_SECRET`, `IP_HASH_SECRET`, `TURNSTILE_SECRET`,
  and optionally `SLACK_WEBHOOK_URL`

A feature whose settings are missing is turned off: for example, the contact
API answers 503 until Turnstile is set up.

The contact form uses `@goodnight-web/server/client` (`getContactConfig()`,
`submitContact()`) and, for client-side checks, the schema in
`@goodnight-web/server/contact`. Japanese and English strings are in
`@goodnight-web/server/messages`.

See `docs/architecture.md` in the repository for the request flows and the
security rules.

## Development

The admin UI source is in `admin-ui/`: a Vite-built React SPA with Base UI,
Tailwind v4, TanStack Router (typed code-based routes under `/admin`, search
parameters validated with zod), TanStack Form (setup and sign-in; the setup
form uses the exported `setupInputSchema`), and TanStack Table (the inquiry
list, with server-side pagination; the order is fixed to newest first because
the admin API has no other sort). It does not use TanStack Start.
`bun run build` builds it and embeds it in
`src/features/admin-ui/admin-files.gen.ts`, which is not committed. Run the
build before `type-check` or `test` when you call them directly in this
directory (Turborepo does it for you from the repository root).

```sh
bun run build        # builds admin-ui/ and writes admin-files.gen.ts
bun run test         # unit and HTTP tests (in-memory D1 stand-in) and admin UI unit tests
bun run test:e2e     # wrangler dev + the admin UI in Chromium with passkeys; needs `bunx playwright install chromium`
bun run screenshots <dir>  # admin UI screenshots with fictional sample data
bun run deploy:check
```
