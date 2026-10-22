import Archive from '@gravity-ui/icons/Archive';
import ArrowLeft from '@gravity-ui/icons/ArrowLeft';
import ArrowShapeTurnUpLeft from '@gravity-ui/icons/ArrowShapeTurnUpLeft';
import Calendar from '@gravity-ui/icons/Calendar';
import Envelope from '@gravity-ui/icons/Envelope';
import EnvelopeOpen from '@gravity-ui/icons/EnvelopeOpen';
import FileText from '@gravity-ui/icons/FileText';
import Globe from '@gravity-ui/icons/Globe';
import ListCheck from '@gravity-ui/icons/ListCheck';
import PlanetEarth from '@gravity-ui/icons/PlanetEarth';
import ShieldCheck from '@gravity-ui/icons/ShieldCheck';
import ShieldExclamation from '@gravity-ui/icons/ShieldExclamation';
import TrashBin from '@gravity-ui/icons/TrashBin';
import {
  Link,
  useCanGoBack,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import type { AdminSubmission } from '../../../../src/features/admin-api/admin-routes.ts';
import type { AdminFieldEntry } from '../../../../src/features/admin-api/admin-view.ts';
import { ApiError } from '../../shared/api/api-client.ts';
import { errorMessage } from '../../shared/api/error-message.ts';
import { useAsync } from '../../shared/api/use-async.ts';
import { formatDateTime } from '../../shared/i18n/format.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../shared/ui/alert-dialog.tsx';
import { Badge } from '../../shared/ui/badge.tsx';
import { Button, buttonVariants } from '../../shared/ui/button.tsx';
import { Card } from '../../shared/ui/card.tsx';
import { Notice } from '../../shared/ui/notice.tsx';
import { Skeleton } from '../../shared/ui/skeleton.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';
import { showToast } from '../../shared/ui/toast.tsx';
import {
  useAdminSession,
  useSignInOnUnauthorized,
} from '../auth/admin-session.tsx';
import { MessageCard, PageError } from '../layout/page-states.tsx';
import { SetupNotices } from '../layout/setup-notices.tsx';
import { fieldValueText, labelText } from './field-value.ts';
import {
  deleteInquiry,
  fetchInquiry,
  updateInquiry,
  type InquiryUpdate,
} from './inquiries-api.ts';
import { spamReasonText } from './spam-reason.ts';
import { StatusBadge, SuspectedSpamBadge } from './status-badge.tsx';

const toApiError = (error: unknown) =>
  error instanceof ApiError
    ? error
    : new ApiError(0, 'server_error', 'unexpected error');

const InfoRow = ({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) => (
  <div className='flex gap-3 py-3'>
    <span className='mt-0.5 text-primary/80 [&_svg]:size-4'>{icon}</span>
    <dt className='sr-only'>{label}</dt>
    <dd className='min-w-0 flex-1 text-[0.95rem] break-words'>
      <span className='block text-xs text-muted-foreground' aria-hidden='true'>
        {label}
      </span>
      {children}
    </dd>
  </div>
);

/**
 * A button that sends one change to the inquiry and shows a toast. Used for
 * the read/unread switch and the suspected spam switch.
 */
const UpdateButton = ({
  inquiry,
  update,
  done,
  failed,
  onChanged,
  icon,
  label,
  testId,
}: {
  inquiry: AdminSubmission;
  update: InquiryUpdate;
  done: string;
  failed: string;
  onChanged: (next: AdminSubmission) => void;
  icon: ReactNode;
  label: string;
  testId: string;
}) => {
  const { t } = useI18n();
  const { refreshStatus } = useAdminSession();
  const [busy, setBusy] = useState(false);

  const change = async () => {
    setBusy(true);
    try {
      const next = await updateInquiry(inquiry.id, update);
      onChanged(next);
      refreshStatus();
      showToast(done);
    } catch (error) {
      showToast(`${failed} ${errorMessage(t, toApiError(error))}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant='outline'
      className='w-full'
      onClick={() => void change()}
      disabled={busy}
      data-testid={testId}
    >
      {busy ? <Spinner /> : icon}
      {label}
    </Button>
  );
};

const ReadControl = ({
  inquiry,
  onChanged,
}: {
  inquiry: AdminSubmission;
  onChanged: (next: AdminSubmission) => void;
}) => {
  const { t } = useI18n();
  const unread = inquiry.status === 'unread';
  return (
    <UpdateButton
      inquiry={inquiry}
      update={{ status: unread ? 'read' : 'unread' }}
      done={unread ? t('detail.markedRead') : t('detail.markedUnread')}
      failed={t('detail.statusFailed')}
      onChanged={onChanged}
      icon={
        unread ? (
          <EnvelopeOpen aria-hidden='true' />
        ) : (
          <Envelope aria-hidden='true' />
        )
      }
      label={unread ? t('list.markRead') : t('list.markUnread')}
      testId='read-toggle'
    />
  );
};

const SpamControl = ({
  inquiry,
  onChanged,
}: {
  inquiry: AdminSubmission;
  onChanged: (next: AdminSubmission) => void;
}) => {
  const { t } = useI18n();
  const flagged = inquiry.suspectedSpam;
  return (
    <UpdateButton
      inquiry={inquiry}
      update={{ suspectedSpam: !flagged }}
      done={flagged ? t('detail.notSpamDone') : t('detail.markSpamDone')}
      failed={t('detail.spamFailed')}
      onChanged={onChanged}
      icon={
        flagged ? (
          <ShieldCheck aria-hidden='true' />
        ) : (
          <ShieldExclamation aria-hidden='true' />
        )
      }
      label={flagged ? t('detail.notSpam') : t('detail.markSpam')}
      testId='spam-toggle'
    />
  );
};

/**
 * The heading of an inquiry: the first filled-in one-line text field (usually
 * the name), or the email address.
 */
export const inquiryTitle = (inquiry: AdminSubmission): string => {
  const entry = inquiry.entries.find(
    (candidate) =>
      candidate.type === 'text' && candidate.value?.kind === 'text',
  );
  return entry?.value?.kind === 'text' && entry.value.text
    ? entry.value.text
    : inquiry.email;
};

const AnswerRow = ({
  entry,
  version,
}: {
  entry: AdminFieldEntry;
  version: number;
}) => {
  const { locale, t } = useI18n();
  if (!entry.value) return null;
  const text = fieldValueText(entry.value, locale);
  const long = entry.type === 'textarea';
  return (
    <div
      data-testid='inquiry-answer'
      data-field-id={entry.id}
      className='flex flex-col gap-1.5 py-4'
    >
      <dt className='flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground'>
        {labelText(entry.label, locale, entry.id)}
        {entry.inCurrentForm ? null : (
          <Badge tone='slate'>
            <Archive aria-hidden='true' />
            {t('detail.archivedField', { version })}
          </Badge>
        )}
      </dt>
      <dd
        className={
          long
            ? 'rounded-xl bg-muted/70 px-5 py-4 text-[0.98rem] leading-[1.9] break-words whitespace-pre-wrap'
            : 'text-[0.98rem] break-words whitespace-pre-wrap'
        }
        data-testid={long ? 'inquiry-body' : undefined}
      >
        {entry.type === 'url' && /^https?:\/\//i.test(text) ? (
          <a
            href={text}
            target='_blank'
            rel='noopener noreferrer nofollow'
            className='rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring'
          >
            {text}
          </a>
        ) : entry.type === 'tel' ? (
          <a
            href={`tel:${text}`}
            className='rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring'
          >
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
};

const DeleteControl = ({ inquiry }: { inquiry: AdminSubmission }) => {
  const { t } = useI18n();
  const { refreshStatus } = useAdminSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await deleteInquiry(inquiry.id);
      setOpen(false);
      refreshStatus();
      showToast(t('detail.deleted'));
      void navigate({ to: '/', replace: true });
    } catch (error) {
      showToast(
        `${t('detail.deleteFailed')} ${errorMessage(t, toApiError(error))}`,
        'error',
      );
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant='destructive-outline' className='w-full' />}
      >
        <TrashBin aria-hidden='true' />
        {t('admin.delete')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <div className='flex gap-4'>
          <div className='flex size-11 shrink-0 items-center justify-center rounded-full bg-destructive-soft text-destructive'>
            <TrashBin aria-hidden='true' className='size-5' />
          </div>
          <div className='flex flex-col gap-1.5'>
            <AlertDialogTitle>{t('detail.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('detail.deleteBody', { name: inquiryTitle(inquiry) })}
            </AlertDialogDescription>
          </div>
        </div>
        <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          <AlertDialogClose render={<Button variant='outline' />}>
            {t('detail.cancel')}
          </AlertDialogClose>
          <Button
            variant='destructive'
            onClick={() => void remove()}
            disabled={busy}
          >
            {busy ? <Spinner /> : null}
            {t('detail.deleteConfirm')}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const DetailSkeleton = () => {
  const { t } = useI18n();
  return (
    <Card className='flex flex-col gap-4 p-6 sm:p-8'>
      <span role='status' className='sr-only'>
        {t('app.loading')}
      </span>
      <Skeleton className='h-7 w-56' />
      <Skeleton className='h-4 w-40' />
      <Skeleton className='mt-4 h-32 w-full' />
    </Card>
  );
};

/**
 * One inquiry: the message, contact details, the read/unread switch, the
 * suspected spam mark with its reasons, and delete with a confirmation
 * dialog. Opening it marks an unread inquiry as read (server side). This is
 * the page that Slack notifications link to.
 */
export const InquiryDetailPage = ({ id }: { id: string }) => {
  const { locale, t } = useI18n();
  const { refreshStatus } = useAdminSession();
  const inquiry = useAsync(async () => {
    const result = await fetchInquiry(id);
    // Opening an unread inquiry marks it read: update the header count.
    refreshStatus();
    return result;
  }, id);
  useSignInOnUnauthorized(inquiry.status === 'error' ? inquiry.error : null);
  const router = useRouter();
  const navigate = useNavigate();
  // Back to the list, keeping its filter and page when we came from it. A
  // deep link (for example from Slack) has no history to go back to.
  const canGoBack = useCanGoBack();
  const backToList = () => {
    if (canGoBack) router.history.back();
    else void navigate({ to: '/' });
  };

  const back = (
    <button
      type='button'
      onClick={backToList}
      className='inline-flex items-center gap-1.5 self-start rounded-full py-1 pr-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring'
    >
      <ArrowLeft aria-hidden='true' className='size-4' />
      {t('app.backToList')}
    </button>
  );

  if (inquiry.status === 'loading') {
    return (
      <div className='flex flex-col gap-5'>
        {back}
        <DetailSkeleton />
      </div>
    );
  }
  if (inquiry.status === 'error') {
    return (
      <div className='flex flex-col gap-5'>
        {back}
        {inquiry.error.code === 'not_found' ? (
          <MessageCard
            icon={<FileText aria-hidden='true' />}
            title={t('error.not_found')}
            action={
              <Link to='/' className={buttonVariants({ variant: 'outline' })}>
                {t('app.backToList')}
              </Link>
            }
          >
            {t('detail.notFound')}
          </MessageCard>
        ) : (
          <PageError
            message={errorMessage(t, inquiry.error)}
            onRetry={inquiry.reload}
          />
        )}
      </div>
    );
  }

  const item = inquiry.data;
  const received = formatDateTime(item.createdAt, locale);
  const answers = item.entries.filter((entry) => entry.value !== null);
  const oldVersion = item.formVersion !== item.currentFormVersion;
  return (
    <div className='flex flex-col gap-5'>
      <SetupNotices />
      {back}
      <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]'>
        <Card className='overflow-hidden'>
          <div className='flex flex-col gap-3 border-b border-border/70 bg-gradient-to-b from-muted to-card px-6 pt-6 pb-5 sm:px-8 sm:pt-8'>
            <div className='flex flex-wrap items-center gap-2'>
              <StatusBadge status={item.status} />
              {item.suspectedSpam ? <SuspectedSpamBadge /> : null}
            </div>
            <h1 className='text-2xl leading-snug font-bold tracking-tight break-words'>
              {inquiryTitle(item)}
            </h1>
            <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
              <Calendar aria-hidden='true' className='size-4' />
              <span className='sr-only'>{t('detail.receivedAt')}: </span>
              <time dateTime={new Date(item.createdAt).toISOString()}>
                {received}
              </time>
            </p>
          </div>
          <section
            aria-labelledby='answers-heading'
            className='flex flex-col px-6 pt-5 pb-3 sm:px-8 sm:pt-6'
          >
            <h2
              id='answers-heading'
              className='text-sm font-semibold text-muted-foreground'
            >
              {t('detail.answers')}
            </h2>
            {oldVersion ? (
              <p className='mt-2 rounded-xl bg-muted/70 px-4 py-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground'>
                {t('detail.oldVersion', { version: item.formVersion })}
              </p>
            ) : null}
            {answers.length > 0 ? (
              <dl className='divide-y divide-border/60'>
                {answers.map((entry) => (
                  <AnswerRow
                    key={entry.id}
                    entry={entry}
                    version={item.formVersion}
                  />
                ))}
              </dl>
            ) : (
              <p className='py-4 text-sm text-muted-foreground'>
                {t('detail.noAnswers')}
              </p>
            )}
          </section>
          <section
            aria-labelledby='contact-heading'
            className='border-t border-border/70 px-6 py-5 sm:px-8'
          >
            <h2
              id='contact-heading'
              className='text-sm font-semibold text-muted-foreground'
            >
              {t('detail.contact')}
            </h2>
            <dl className='mt-1 grid divide-border/60 sm:grid-cols-2 sm:gap-x-6'>
              <InfoRow
                icon={<Envelope aria-hidden='true' />}
                label={t('field.email')}
              >
                <a
                  href={`mailto:${item.email}`}
                  data-testid='inquiry-email'
                  className='rounded-sm break-all text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring'
                >
                  {item.email}
                </a>
              </InfoRow>
              <InfoRow
                icon={<ListCheck aria-hidden='true' />}
                label={t('detail.formVersion')}
              >
                <span data-testid='inquiry-form-version'>
                  {t('form.version', { version: item.formVersion })}
                </span>
              </InfoRow>
              {item.locale ? (
                <InfoRow
                  icon={<Globe aria-hidden='true' />}
                  label={t('detail.locale')}
                >
                  {t(`language.${item.locale}`)}
                </InfoRow>
              ) : null}
              {item.pagePath ? (
                <InfoRow
                  icon={<FileText aria-hidden='true' />}
                  label={t('detail.pagePath')}
                >
                  <span className='font-mono text-sm'>{item.pagePath}</span>
                </InfoRow>
              ) : null}
              {item.country ? (
                <InfoRow
                  icon={<PlanetEarth aria-hidden='true' />}
                  label={t('detail.country')}
                >
                  {item.country}
                </InfoRow>
              ) : null}
            </dl>
          </section>
        </Card>

        <aside className='flex flex-col gap-4'>
          <Card className='flex flex-col gap-4 p-5'>
            <ReadControl inquiry={item} onChanged={inquiry.setData} />
            <SpamControl inquiry={item} onChanged={inquiry.setData} />
            <a
              href={`mailto:${item.email}`}
              className={buttonVariants({
                variant: 'secondary',
                className: 'w-full',
              })}
            >
              <ArrowShapeTurnUpLeft aria-hidden='true' />
              {t('detail.reply')}
            </a>
            <DeleteControl inquiry={item} />
          </Card>
          {item.suspectedSpam || item.spamScore > 0 ? (
            <Notice
              tone={item.suspectedSpam ? 'warning' : 'info'}
              icon={<ShieldExclamation aria-hidden='true' />}
              title={
                item.suspectedSpam
                  ? t('spam.badge')
                  : `${t('detail.spamScore')}: ${item.spamScore}`
              }
              data-testid='spam-notice'
            >
              {item.suspectedSpam ? <p>{t('detail.spamNote')}</p> : null}
              {item.spamReasons.length > 0 ? (
                <div className='flex flex-col gap-1'>
                  <p className='font-medium'>{t('detail.spamReasons')}:</p>
                  <ul className='flex list-disc flex-col gap-0.5 pl-5'>
                    {item.spamReasons.map((reason) => (
                      <li key={reason} data-reason={reason}>
                        {spamReasonText(t, reason)}
                      </li>
                    ))}
                  </ul>
                  {item.suspectedSpam ? (
                    <p className='text-[0.8125rem]'>
                      {t('detail.spamScore')}: {item.spamScore}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p>{t('detail.spamManual')}</p>
              )}
            </Notice>
          ) : null}
        </aside>
      </div>
    </div>
  );
};
