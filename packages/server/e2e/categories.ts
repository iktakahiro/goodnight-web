import type { ContactCategory } from '../src/options.ts';

/** Contact categories of the test Worker (e2e/worker.ts). */
export const e2eCategories = [
  { value: 'sales', label: { ja: '製品・料金について', en: 'Sales' } },
  { value: 'press', label: { ja: '取材・メディア', en: 'Press' } },
  { value: 'other', label: { ja: 'その他', en: 'Other' } },
] as const satisfies readonly ContactCategory[];
