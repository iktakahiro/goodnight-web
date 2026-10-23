# Contributing

Thank you for your interest in goodnight-web. Issues and pull requests are
welcome, in English or Japanese.

- Found a bug or a wrong or unclear page in the documentation? Open an issue
  with the template.
- Want to change behavior or add a feature? Open an issue first, so that we
  can agree on the direction before you spend time on code.
- Found a vulnerability? Do not open an issue. Follow [SECURITY.md](SECURITY.md).

## Set up

You need [Bun](https://bun.sh) (the version is in `.bun-version`).

```sh
bun install
bun run validate
bun run build
```

Run `bun run deploy:check` as well when a change touches a Worker,
`wrangler.jsonc`, or D1 migrations. CI runs the same checks.

## Pull requests

- Branch from `main` and keep the change small.
- Write commit messages and the pull request title as English
  [Conventional Commits](https://www.conventionalcommits.org), for example
  `fix(server): reject an empty setup token`. Pull requests are squash-merged.
- Add or update tests for a change in behavior.
- The code rules (exact dependency versions, no `sql.raw()`, migrations are
  never edited after a release, and others) are in [AGENTS.md](AGENTS.md).
  Read it before you change code.

## License

The code is under the [MIT License](LICENSE). By contributing, you agree that
your contribution is licensed in the same way. The logo and the share images
are not part of the MIT License; see [brand/LICENSE](brand/LICENSE).
