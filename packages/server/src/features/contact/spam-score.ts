import type { FormField } from '../contact-form/form-definition.ts';
import type { FieldValues } from '../contact-form/form-values-schema.ts';

/** A submission with this score or more is saved with status `held`. */
export const SPAM_HOLD_THRESHOLD = 3;

/** Submissions sent faster than this after the form was shown score points. */
export const SPAM_MIN_ELAPSED_MS = 3000;

/** Result of {@link scoreSubmission}. */
export interface SpamScore {
  score: number;
  /** Names of the rules that added points, for example `["links:2"]`. */
  reasons: string[];
}

const LINKS = /https?:\/\/|www\./gi;
const HAS_LINK = /https?:\/\/|www\./i;

/**
 * Scores a validated submission with simple, documented rules. Higher means
 * more likely spam. The rules only hold a submission for review; nothing is
 * thrown away.
 *
 * - `links:N`: N links (`http://`, `https://`, `www.`) in `textarea` fields
 *   add N points, at most 3.
 * - `link_in_field`: a link in a one-line `text` field (such as a name or a
 *   company) adds 3 points. `url` fields are expected to hold links and are
 *   not counted.
 * - `too_fast`: sent less than {@link SPAM_MIN_ELAPSED_MS} after the form was
 *   shown adds 3 points.
 *
 * The honeypot is handled before scoring and never stores anything.
 *
 * @param fields - The form fields the values were validated against.
 */
export const scoreSubmission = ({
  fields,
  values,
  elapsedMs,
}: {
  fields: readonly FormField[];
  values: FieldValues;
  elapsedMs: number | undefined;
}): SpamScore => {
  const reasons: string[] = [];
  let score = 0;
  const textOf = (type: FormField['type']) =>
    fields
      .filter((field) => field.type === type)
      .map((field) => values[field.id])
      .filter((value): value is string => typeof value === 'string');
  const links = textOf('textarea').join('\n').match(LINKS)?.length ?? 0;
  if (links > 0) {
    score += Math.min(links, 3);
    reasons.push(`links:${links}`);
  }
  if (textOf('text').some((value) => HAS_LINK.test(value))) {
    score += 3;
    reasons.push('link_in_field');
  }
  if (elapsedMs !== undefined && elapsedMs < SPAM_MIN_ELAPSED_MS) {
    score += 3;
    reasons.push('too_fast');
  }
  return { score, reasons };
};
