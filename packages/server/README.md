# @goodnight-web/server

The server side of a goodnight-web site: one Hono app for a Cloudflare Worker
with the contact API, first-admin setup, passkey sign-in (Better Auth), the
admin API, the prebuilt admin UI, security headers, and the D1 migrations.

Sites use it from `src/worker.ts` and do not edit it:

```ts
import { createGoodnightWorker } from '@goodnight-web/server';

export default createGoodnightWorker({
  locale: 'ja',
  contact: { categories: ['sales', 'press', 'other'] },
});
```

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

```sh
bun run test       # unit and HTTP tests (in-memory D1 stand-in)
bun run test:e2e   # wrangler dev + Chromium passkeys; needs `bunx playwright install chromium`
bun run build      # embeds the admin UI into src/features/admin-ui/admin-files.gen.ts
bun run deploy:check
```
