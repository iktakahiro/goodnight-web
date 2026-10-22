import type { Locale } from './shared/messages.ts';

/** A text in every admin and site language. */
export type LocalizedLabel = Readonly<Record<Locale, string>>;

/**
 * A contact category with labels. `value` is what the form sends, what D1
 * stores, and what Slack shows; `label` is what the admin UI shows.
 */
export interface ContactCategory {
  value: string;
  label: LocalizedLabel;
}

/**
 * Options for {@link createGoodnightWorker}. Everything is optional; secrets
 * and bindings come from `env`, not from here.
 */
export interface GoodnightWorkerOptions {
  /**
   * Language for Slack notifications and for API messages when the request's
   * `Accept-Language` matches neither `ja` nor `en`. Defaults to `en`.
   */
  locale?: Locale;
  /** Contact API settings. */
  contact?: {
    /**
     * Allowed values of the `category` field, as plain values (`'sales'`) or
     * as {@link ContactCategory} entries with ja/en labels for the admin UI.
     * When set, any other value is rejected. Slack notifications show the
     * value only when it is in this list, so free text never reaches Slack.
     */
    categories?: readonly (string | ContactCategory)[];
    /**
     * Hostnames accepted in the Turnstile siteverify result. Defaults to the
     * hostname of the request.
     */
    turnstileHostnames?: readonly string[];
  };
}

/**
 * A configured category after {@link resolveOptions}. `label` is `null` when
 * the category was given as a plain string.
 */
export interface ResolvedContactCategory {
  value: string;
  label: LocalizedLabel | null;
}

/** Options with defaults applied. */
export interface ResolvedOptions {
  locale: Locale;
  contact: {
    /** Allowed category values, or `undefined` when any value is accepted. */
    categories: readonly string[] | undefined;
    /** The same categories with their labels, in the configured order. */
    categoryLabels: readonly ResolvedContactCategory[];
    turnstileHostnames: readonly string[] | undefined;
  };
}

const resolveCategory = (
  category: string | ContactCategory,
): ResolvedContactCategory =>
  typeof category === 'string'
    ? { value: category, label: null }
    : {
        value: category.value,
        label: { ja: category.label.ja, en: category.label.en },
      };

/** Applies defaults to {@link GoodnightWorkerOptions}. */
export const resolveOptions = (
  options: GoodnightWorkerOptions = {},
): ResolvedOptions => {
  const categoryLabels = options.contact?.categories?.map(resolveCategory);
  return {
    locale: options.locale ?? 'en',
    contact: {
      categories: categoryLabels?.map((category) => category.value),
      categoryLabels: categoryLabels ?? [],
      turnstileHostnames: options.contact?.turnstileHostnames,
    },
  };
};
