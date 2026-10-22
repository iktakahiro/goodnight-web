import { Circle, CircleDot, ShieldAlert } from 'lucide-react';
import type { SubmissionStatus } from '../../../../src/features/submissions/submission-status.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Badge } from '../../shared/ui/badge.tsx';

const TONE = {
  unread: 'violet',
  read: 'slate',
} as const satisfies Record<SubmissionStatus, string>;

const ICON = {
  unread: CircleDot,
  read: Circle,
} as const satisfies Record<SubmissionStatus, unknown>;

/** A colored label for an inquiry's status (unread or read). */
export const StatusBadge = ({ status }: { status: SubmissionStatus }) => {
  const { t } = useI18n();
  const Icon = ICON[status];
  return (
    <Badge tone={TONE[status]} data-status={status}>
      <Icon aria-hidden='true' />
      {t(`status.${status}`)}
    </Badge>
  );
};

/** The label for an inquiry flagged as suspected spam. */
export const SuspectedSpamBadge = () => {
  const { t } = useI18n();
  return (
    <Badge tone='amber' data-testid='suspected-spam-badge'>
      <ShieldAlert aria-hidden='true' />
      {t('spam.badge')}
    </Badge>
  );
};
