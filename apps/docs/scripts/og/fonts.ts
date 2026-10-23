/**
 * Rebuilds the font subsets in `scripts/og/fonts/` that the share-image
 * generator embeds, so that its output does not depend on the fonts installed
 * on the machine. Run `bun run og:fonts` after the hero copy gains a
 * character that `fonts/glyphs.txt` does not list.
 *
 * Needs Python `fonttools` (`pip install fonttools`) and two source fonts,
 * both under the SIL Open Font License:
 *   NOTO_SANS_CJK_REGULAR / NOTO_SANS_CJK_BOLD  NotoSansCJK-*.ttc  (Noto Sans CJK JP)
 *   INTER_VARIABLE                              Inter variable TTF
 */
import { resolve } from 'node:path';
import { glyphsFor } from './glyphs.ts';
import { readOgCopy } from './copy.ts';

const fonts = resolve(import.meta.dirname, 'fonts');
const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} to the path of the source font.`);
  return value;
};

const glyphs = await glyphsFor(await readOgCopy());
await Bun.write(`${fonts}/glyphs.txt`, `${glyphs}\n`);

const subset = (source: string, output: string, extra: string[] = []): void => {
  const run = Bun.spawnSync([
    'pyftsubset',
    source,
    `--text=${glyphs}`,
    `--output-file=${fonts}/${output}`,
    '--layout-features=*',
    '--no-hinting',
    ...extra,
  ]);
  if (run.exitCode !== 0) throw new Error(run.stderr.toString());
};
// Index 0 of the Noto Sans CJK collections is the Japanese face.
subset(env('NOTO_SANS_CJK_REGULAR'), 'noto-sans-cjk-jp-regular.otf', [
  '--font-number=0',
]);
subset(env('NOTO_SANS_CJK_BOLD'), 'noto-sans-cjk-jp-bold.otf', [
  '--font-number=0',
]);
subset(env('INTER_VARIABLE'), 'inter-variable.ttf');
console.log(`Wrote the font subsets for ${glyphs.length} characters.`);
