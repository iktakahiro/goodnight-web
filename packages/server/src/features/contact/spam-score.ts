import type { ContactRequest } from './contact-schema.ts';

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
 * - `links:N`: N links (`http://`, `https://`, `www.`) in the message add N
 *   points, at most 3.
 * - `link_in_name`: a link in the name or company adds 3 points.
 * - `too_fast`: sent less than {@link SPAM_MIN_ELAPSED_MS} after the form was
 *   shown adds 3 points.
 *
 * The honeypot is handled before scoring and always holds the submission.
 */
export const scoreSubmission = (
  input: Pick<ContactRequest, 'name' | 'company' | 'message' | 'elapsedMs'>,
): SpamScore => {
  const reasons: string[] = [];
  let score = 0;
  const links = input.message.match(LINKS)?.length ?? 0;
  if (links > 0) {
    score += Math.min(links, 3);
    reasons.push(`links:${links}`);
  }
  if (HAS_LINK.test(`${input.name} ${input.company ?? ''}`)) {
    score += 3;
    reasons.push('link_in_name');
  }
  if (input.elapsedMs !== undefined && input.elapsedMs < SPAM_MIN_ELAPSED_MS) {
    score += 3;
    reasons.push('too_fast');
  }
  return { score, reasons };
};
