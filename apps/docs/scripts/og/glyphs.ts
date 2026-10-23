import type { OgCopy } from './copy.ts';

/** Text that is not in the hero, but is drawn on the image. */
const fixedText = 'example.com/admin';

/** Every character the image can draw: printable ASCII and the hero copy. */
export async function glyphsFor(copies: OgCopy[]): Promise<string> {
  const characters = new Set<string>();
  const add = (text: string) => {
    for (const character of text) characters.add(character);
  };
  for (let code = 0x20; code < 0x7f; code++) add(String.fromCharCode(code));
  add(fixedText);
  for (const copy of copies) add([...copy.title, ...copy.eyebrow].join(''));
  return [...characters].sort().join('');
}
