import { Circle, CircleCheck, CircleDot, CirclePause, Ban } from 'lucide-react';
import type { SubmissionStatus } from '../../../../src/features/submissions/submission-status.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Badge } from '../../shared/ui/badge.tsx';

const TONE = {
  new: 'violet',
  read: 'slate',
  done: 'mint',
  held: 'amber',
  spam: 'rose',
} as const satisfies Record<SubmissionStatus, string>;

const ICON = {
  new: CircleDot,
  read: Circle,
  done: CircleCheck,
  held: CirclePause,
  spam: Ban,
} as const satisfies Record<SubmissionStatus, unknown>;

/** A colored label for an inquiry's status. The icon differs per status. */
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
