import { BellOff, ExternalLink, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { MIN_SECRET_LENGTH } from '../../../../src/shared/secret-length.ts';
import { useAdminSession } from '../auth/admin-session.tsx';
import { docsUrl } from '../../shared/docs-links.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Notice } from '../../shared/ui/notice.tsx';

/**
 * Notices about missing settings, from `GET /api/admin/status`:
 *
 * - Turnstile not configured: the contact form refuses submissions (fail
 *   closed). Links to the Turnstile setup page in the documentation.
 * - Another setting the contact API needs is missing or too short: lists
 *   the names.
 * - Slack not configured: a quiet note, because Slack is optional. Shown
 *   only where `showSlack` is set (the list).
 */
export const SetupNotices = ({
  showSlack = false,
}: {
  showSlack?: boolean;
}) => {
  const { locale, t } = useI18n();
  const { status } = useAdminSession();
  const [slackDismissed, setSlackDismissed] = useState(false);
  if (!status) return null;
  const otherMissing = status.contactMissing.filter(
    (name) => !name.startsWith('TURNSTILE_'),
  );
  const showContact = status.turnstileConfigured && otherMissing.length > 0;
  const showSlackNote = showSlack && !status.slackConfigured && !slackDismissed;
  if (status.turnstileConfigured && !showContact && !showSlackNote) {
    return null;
  }
  return (
    <div className='flex flex-col gap-3'>
      {!status.turnstileConfigured ? (
        <Notice
          tone='warning'
          data-testid='turnstile-notice'
          icon={<TriangleAlert aria-hidden='true' />}
          title={t('notice.turnstileTitle')}
        >
          <p>{t('notice.turnstileBody')}</p>
          <p>
            <a
              href={docsUrl(locale, '/docs/setup/turnstile/')}
              target='_blank'
              rel='noreferrer'
              className='inline-flex items-center gap-1 rounded-sm font-semibold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/60'
            >
              {t('admin.turnstileNoticeLink')}
              <ExternalLink aria-hidden='true' className='size-3.5' />
            </a>
          </p>
        </Notice>
      ) : null}
      {showContact ? (
        <Notice
          tone='warning'
          icon={<TriangleAlert aria-hidden='true' />}
          title={t('notice.contactTitle')}
        >
          <p>{t('notice.contactBody', { names: otherMissing.join(', ') })}</p>
          {status.contactTooShort.length > 0 ? (
            <p>
              {t('notice.contactTooShort', {
                names: status.contactTooShort.join(', '),
                min: MIN_SECRET_LENGTH,
              })}
            </p>
          ) : null}
        </Notice>
      ) : null}
      {showSlackNote ? (
        <Notice
          tone='info'
          data-testid='slack-notice'
          className='items-center py-3 sm:py-3'
          icon={<BellOff aria-hidden='true' />}
        >
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
            <p>{t('notice.slack')}</p>
            <a
              href={docsUrl(locale, '/docs/how-it-works/notifications/')}
              target='_blank'
              rel='noreferrer'
              className='rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60'
            >
              {t('notice.slackLink')}
            </a>
            <button
              type='button'
              onClick={() => setSlackDismissed(true)}
              className='rounded-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60'
            >
              {t('notice.close')}
            </button>
          </div>
        </Notice>
      ) : null}
    </div>
  );
};
