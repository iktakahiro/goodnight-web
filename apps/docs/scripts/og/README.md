# Share images

`bun run og` renders the Open Graph and X card images, 1200 x 630 px:

- `public/images/og/og-ja.png` (the default for the site and every Japanese page)
- `public/images/og/og-en.png` (every English page)

The title and highlight come from the `hero` block of
`src/content/docs/ja/index.mdx` and `src/content/docs/index.mdx`. The sub line
under the title (where the kit runs) is written in `copy.ts`, because it
differs from the page eyebrow. The stars are drawn from a seeded generator and
keep clear of the text, logo, and screenshot, so a run always gives the same sky. The logo is
`brand/goodnight-web-lockup-dark.svg`, and the screenshot is the inquiry list
in `public/images/admin/`. Run `bun run og` and commit the PNGs whenever the
hero copy, the logo, or that screenshot changes. The alt text and file names
are in `src/site/open-graph.ts`.

Run `bunx playwright install chromium` once before the first run.

## Fonts

The images embed the subsets in `fonts/`, so a run gives the same PNG on any
machine (no system fonts are used): Noto Sans CJK JP (Regular, Bold) for
Japanese and Inter for Latin letters. Both are licensed under the SIL Open Font
License 1.1 (`fonts/OFL-*.txt`). Noto Sans CJK is Copyright 2014-2021 Adobe
(<https://github.com/notofonts/noto-cjk>), and Inter is Copyright 2016 The Inter
Project Authors (<https://github.com/rsms/inter>).

`fonts/glyphs.txt` lists the characters in the subsets. If the hero copy gains
a character that is not listed, `bun run og` stops and asks you to run
`bun run og:fonts`, which needs Python `fonttools` and the three source fonts
(see the comment in `fonts.ts`).
