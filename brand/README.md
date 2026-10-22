# goodnight web brand assets

The goodnight web logo is a crescent moon holding a sleeping cat. The cat lies
on its back and hugs a body pillow, with its front paws over the pillow's upper
edge. The wordmark reads `goodnight web`.

## Files

| File                                   | Use                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `goodnight-web-lockup-light.svg`       | Symbol and wordmark, for white or light backgrounds.                                         |
| `goodnight-web-lockup-dark.svg`        | Symbol and wordmark, for the dark background `#111113`.                                      |
| `goodnight-web-symbol-light.svg`       | Symbol only, for white or light backgrounds.                                                 |
| `goodnight-web-symbol-dark.svg`        | Symbol only, for the dark background `#111113`.                                              |
| `goodnight-web-icon.svg`               | App icon: the symbol on a rounded violet tile. Works on any background.                      |
| `goodnight-web-favicon.svg`            | Simplified tile for browser tabs: a thick moon and a cat silhouette (head, ears, body).      |
| `png/favicon.ico`                      | 16, 32, and 48 px. The 16 px frame is drawn by hand; 32 and 48 px come from the favicon SVG. |
| `png/apple-touch-icon.png`             | 180 x 180, full-bleed square without transparency. iOS rounds the corners.                   |
| `png/icon-192.png`, `png/icon-512.png` | Rounded tile for the web app manifest.                                                       |
| `scripts/`                             | The geometry and the build script that writes every file above.                              |

The dark files draw the cat's eyes in `#111113`. On any other dark color, use
the icon instead.

## Where the files are used

- Admin UI (`packages/server/admin-ui`): `public/favicon.svg`,
  `public/favicon.ico`, and `public/apple-touch-icon.png` are copies. The
  header and the sign-in screen draw the symbol and the lockup inline from
  `src/features/layout/logo-shapes.gen.ts`, colored by the `logo-*` theme
  tokens.
- Docs site (`apps/docs`): `public/favicon.svg`, `public/favicon.ico`,
  `public/apple-touch-icon.png`, `public/icon-192.png`, and
  `public/icon-512.png` are copies. The navigation shows
  `src/assets/logo-lockup-light.svg` or `logo-lockup-dark.svg`, also copies.
- `README.md` and `README.ja.md` show the lockups from this directory.

The starter template does not use these files. Its favicon belongs to the
sample site.

## Colors

| Role                        | Light       | Dark (on `#111113`)                  | Icon tile |
| --------------------------- | ----------- | ------------------------------------ | --------- |
| Moon and cat                | `#743bc4`   | `#ffffff`                            | `#ffffff` |
| Pillow                      | `#e4d8fb`   | `#bfabfc`                            | `#d9c9fb` |
| Eyes and toes               | `#e4d8fb`   | `#111113`                            | `#743bc4` |
| `goodnight`                 | `#341065`   | `#ffffff`                            | —         |
| `web` and the star on the i | `#743bc4`   | `#bfabfc`                            | —         |
| Background                  | transparent | `#111113` (not included in the file) | `#743bc4` |

Contrast against the background: `#341065` on white is 14.9:1. `#743bc4` on
white is 6.6:1. `#bfabfc` on `#111113` is 9.4:1.

## Usage rules

- Write the name as `goodnight web`: lowercase, two words, a space, no hyphen.
- Use the SVG files as they are. Do not recolor, stretch, rotate, outline, or
  add effects, and do not rebuild the wordmark in a live font.
- Keep clear space around the logo of at least the height of the letter `o`.
- Minimum sizes: the lockup 160 px wide on screen (30 mm in print), the symbol
  32 px. Below 32 px, use the favicon.
- Use the light files on white or light backgrounds and the dark files on
  `#111113`. On photos or other colors, use the icon tile.

## Wordmark font

The wordmark is set in Nunito ExtraBold (weight 800) and converted to outlines,
so no font is loaded. The dot of the `i` is replaced with a star. Nunito is
Copyright 2014 The Nunito Project Authors
(<https://github.com/googlefonts/nunito>) and is licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org). The logo contains
outlined glyph shapes, not the font software. `scripts/wordmark.ts` holds those
outlines.

## Changing the logo

The SVG, PNG, and ICO files are generated. Change the geometry in
`scripts/logo.ts` (or the 16 px frame in `scripts/favicon.ts`), then run:

```sh
bun run brand:build
bun brand/scripts/preview.ts /tmp/brand-preview
```

`brand:build` writes every file in this directory, copies the favicon files
into the admin UI and the docs site, and regenerates the admin UI's
`logo-shapes.gen.ts`. `preview.ts` renders the lockups, symbols, and icon,
and the favicon frames scaled up 8x on white and on `#111113`, so you can check
them before you commit. Both scripts render with the Playwright Chromium that
the end-to-end tests use; run `bunx playwright install chromium` if it is
missing.
