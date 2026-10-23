<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/goodnight-web-lockup-dark.svg">
  <img src="brand/goodnight-web-lockup-light.svg" alt="goodnight web" width="360">
</picture>

# goodnight-web

goodnight-web is a starter kit for a website with a blog and a contact
form. It runs on Cloudflare® only: one Worker serves the static site, the
contact API, and an admin screen for reading inquiries, and one D1 database
stores the inquiries.

[日本語](README.ja.md) · [Documentation](https://goodnight-web.dev)

## Quick start

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iktakahiro/goodnight-web/tree/main/templates/starter)

1. Press the button. It copies the starter (`templates/starter`) into a new
   repository in your GitHub account. In the setup form, tick **Create private
   Git repository** and enter the secrets it asks for.
2. Cloudflare Workers® creates the D1 database, builds the site, and deploys it
   to your Cloudflare account.
3. Open `/admin` on the new site, enter the setup token, and register a passkey
   for the first admin.

The [documentation](https://goodnight-web.dev/docs/getting-started/) walks
through each step, including your own domain and Turnstile. The
[starter README](templates/starter/README.md) lists the settings and secrets.

## Goal

- Run a small company's website without maintaining a server, a language
  runtime, or a database server.
- Receive inquiries reliably: each one is saved to D1 before the visitor sees
  a reply. Spam protection uses Turnstile, Workers Rate Limiting, and a
  honeypot field.
- Let people who are not engineers edit the site, for example with AI tools,
  while the contact API and the admin screen come from a package that they do
  not edit.
- Deliver fixes as dependency update pull requests. Site owners still need to
  review and merge those pull requests; that maintenance remains.

Everything user-facing is available in Japanese and English.

## Layout

| Path                         | Contents                                                                   |
| ---------------------------- | -------------------------------------------------------------------------- |
| `packages/server`            | `@goodnight-web/server`: Worker, contact API, admin API and UI, migrations |
| `packages/typescript-config` | Shared TypeScript presets                                                  |
| `templates/starter`          | The Astro site that users copy and edit (what the Deploy button copies)    |
| `apps/docs`                  | Documentation site                                                         |
| `docs`                       | Developer documentation                                                    |
| `brand`                      | Logo, favicon, and app icon files and their build script (see License)     |

See [docs/architecture.md](docs/architecture.md) for details.

## Development

Requires [Bun](https://bun.sh) (version in `.bun-version`).

```sh
bun install
bun run validate
bun run build
```

Contributor rules are in [AGENTS.md](AGENTS.md). To report a vulnerability,
see [SECURITY.md](SECURITY.md).

## License

The code is under the [MIT License](LICENSE). The logo, wordmark, icons, and
share images are not: all rights reserved, with a few permitted uses. See
[brand/LICENSE](brand/LICENSE). You can use the name goodnight-web to refer to
the project.

Cloudflare, the Cloudflare logo, and Cloudflare Workers are trademarks and/or
registered trademarks of Cloudflare, Inc. in the United States and other
jurisdictions. goodnight-web is not affiliated with or endorsed by
Cloudflare, Inc.
