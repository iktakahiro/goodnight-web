import {
  BookOpen,
  Compass,
  Database,
  Layers,
  Package,
  Rocket,
  Settings,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

const icons = {
  BookOpen,
  Compass,
  Database,
  Layers,
  Package,
  Rocket,
  Settings,
  ShieldCheck,
  Wrench,
};

function isIconName(name: string): name is keyof typeof icons {
  return Object.hasOwn(icons, name);
}

/**
 * Resolves a sidebar icon named in page frontmatter (`icon: Rocket`), in a
 * folder's `meta.json` (`"icon": "Wrench"`), or in a `meta.json` separator
 * (`---[Wrench]How it works---`).
 *
 * @throws Error when the name is not in the allowlist, so a typo fails the
 * build instead of rendering an empty slot.
 */
export function navigationIcon(name: string | undefined) {
  if (name === undefined) return undefined;
  if (!isIconName(name)) throw new Error(`Unknown sidebar icon: ${name}`);
  const Icon = icons[name];
  return <Icon />;
}
