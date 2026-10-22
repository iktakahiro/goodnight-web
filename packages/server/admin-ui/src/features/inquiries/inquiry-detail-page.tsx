import {
  ArrowLeft,
  Building2,
  CalendarClock,
  FileText,
  Globe,
  Mail,
  Phone,
  Reply,
  ShieldAlert,
  Tag,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AdminSubmission } from '../../../../src/features/admin-api/admin-routes.ts';
import {
  SUBMISSION_STATUSES,
  isSubmissionStatus,
} from '../../../../src/features/submissions/submission-status.ts';
import { ApiError } from '../../shared/api/api-client.ts';
import { errorMessage } from '../../shared/api/error-message.ts';
import { useAsync } from '../../shared/api/use-async.ts';
import { formatDateTime } from '../../shared/i18n/format.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Link, cameFromApp, navigate } from '../../shared/router/router.tsx';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/select.tsx';
import { Skeleton } from '../../shared/ui/skeleton.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';
import { showToast } from '../../shared/ui/toast.tsx';
import {
  useAdminSession,
  useSignInOnUnauthorized,
} from '../auth/admin-session.tsx';
import { MessageCard, PageError } from '../layout/page-states.tsx';
import { SetupNotices } from '../layout/setup-notices.tsx';
import { categoryLabel } from './category-label.ts';
import {
  deleteInquiry,
  fetchInquiry,
  updateInquiryStatus,
} from './inquiries-api.ts';
import { StatusBadge } from './status-badge.tsx';

const toApiError = (error: unknown) =>
  error instanceof ApiError
    ? error
    : new ApiError(0, 'server_error', 'unexpected error');

/** Goes back to the list, keeping its filter when we came from it. */
const backToList = () => {
  if (cameFromApp()) window.history.back();
  else navigate('/admin');
};

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

const StatusControl = ({
  inquiry,
  onChanged,
}: {
  inquiry: AdminSubmission;
  onChanged: (next: AdminSubmission) => void;
}) => {
  const { t } = useI18n();
  const { refreshStatus } = useAdminSession();
  const [busy, setBusy] = useState(false);
  const items = SUBMISSION_STATUSES.map((value) => ({
    value,
    label: t(`status.${value}`),
  }));

  const change = async (value: unknown) => {
    if (!isSubmissionStatus(value) || value === inquiry.status) return;
    setBusy(true);
    try {
      const next = await updateInquiryStatus(inquiry.id, value);
      onChanged(next);
      refreshStatus();
      showToast(t('detail.statusChanged', { status: t(`status.${value}`) }));
    } catch (error) {
      const apiError = toApiError(error);
      showToast(
        `${t('detail.statusFailed')} ${errorMessage(t, apiError)}`,
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select
      items={items}
      value={inquiry.status}
      onValueChange={(value: unknown) => void change(value)}
      disabled={busy}
    >
      <div className='flex flex-col gap-2'>
        <SelectLabel>{t('detail.statusLabel')}</SelectLabel>
        <SelectTrigger data-testid='status-select'>
          <SelectValue />
          {busy ? <Spinner className='ml-auto text-primary' /> : null}
        </SelectTrigger>
      </div>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const DeleteControl = ({ inquiry }: { inquiry: AdminSubmission }) => {
  const { t } = useI18n();
  const { refreshStatus } = useAdminSession();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await deleteInquiry(inquiry.id);
      setOpen(false);
      refreshStatus();
      showToast(t('detail.deleted'));
      navigate('/admin', { replace: true });
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
        <Trash2 aria-hidden='true' />
        {t('admin.delete')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <div className='flex gap-4'>
          <div className='flex size-11 shrink-0 items-center justify-center rounded-full bg-destructive-soft text-destructive'>
            <Trash2 aria-hidden='true' className='size-5' />
          </div>
          <div className='flex flex-col gap-1.5'>
            <AlertDialogTitle>{t('detail.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('detail.deleteBody', { name: inquiry.name })}
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
 * One inquiry: the message, contact details, status change, and delete with
 * a confirmation dialog. Opening it marks a new inquiry as read (server side).
 * This is the page that Slack notifications link to.
 */
export const InquiryDetailPage = ({ id }: { id: string }) => {
  const { locale, t } = useI18n();
  const { status, refreshStatus } = useAdminSession();
  const inquiry = useAsync(async () => {
    const result = await fetchInquiry(id);
    // Opening a new inquiry marks it read: update the header count.
    refreshStatus();
    return result;
  }, id);
  useSignInOnUnauthorized(inquiry.status === 'error' ? inquiry.error : null);

  const back = (
    <button
      type='button'
      onClick={backToList}
      className='inline-flex items-center gap-1.5 self-start rounded-full py-1 pr-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/60'
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
              <Link
                href='/admin'
                className={buttonVariants({ variant: 'outline' })}
              >
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
  const category = item.category
    ? categoryLabel(item.category, status?.categories, locale)
    : null;
  return (
    <div className='flex flex-col gap-5'>
      <SetupNotices />
      {back}
      <div className='grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]'>
        <Card className='overflow-hidden'>
          <div className='flex flex-col gap-3 border-b border-border/70 bg-gradient-to-b from-accent/50 to-card px-6 pt-6 pb-5 sm:px-8 sm:pt-8'>
            <div className='flex flex-wrap items-center gap-2'>
              <StatusBadge status={item.status} />
              {category ? <Badge tone='outline'>{category}</Badge> : null}
            </div>
            <h1 className='text-2xl leading-snug font-bold tracking-tight break-words'>
              {item.name}
            </h1>
            <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
              <CalendarClock aria-hidden='true' className='size-4' />
              <span className='sr-only'>{t('detail.receivedAt')}: </span>
              <time dateTime={new Date(item.createdAt).toISOString()}>
                {received}
              </time>
            </p>
          </div>
          <section
            aria-labelledby='message-heading'
            className='flex flex-col gap-3 px-6 py-6 sm:px-8 sm:py-7'
          >
            <h2
              id='message-heading'
              className='text-sm font-semibold text-muted-foreground'
            >
              {t('detail.message')}
            </h2>
            <div
              data-testid='inquiry-body'
              className='rounded-xl bg-muted/70 px-5 py-4 text-[0.98rem] leading-[1.9] break-words whitespace-pre-wrap'
            >
              {item.body}
            </div>
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
                icon={<Mail aria-hidden='true' />}
                label={t('field.email')}
              >
                <a
                  href={`mailto:${item.email}`}
                  className='rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60'
                >
                  {item.email}
                </a>
              </InfoRow>
              {item.company ? (
                <InfoRow
                  icon={<Building2 aria-hidden='true' />}
                  label={t('field.company')}
                >
                  {item.company}
                </InfoRow>
              ) : null}
              {item.phone ? (
                <InfoRow
                  icon={<Phone aria-hidden='true' />}
                  label={t('field.phone')}
                >
                  <a
                    href={`tel:${item.phone}`}
                    className='rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/60'
                  >
                    {item.phone}
                  </a>
                </InfoRow>
              ) : null}
              {category ? (
                <InfoRow
                  icon={<Tag aria-hidden='true' />}
                  label={t('field.category')}
                >
                  {category}
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
                  icon={<Globe aria-hidden='true' />}
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
            <StatusControl inquiry={item} onChanged={inquiry.setData} />
            <a
              href={`mailto:${item.email}`}
              className={buttonVariants({
                variant: 'secondary',
                className: 'w-full',
              })}
            >
              <Reply aria-hidden='true' />
              {t('detail.reply')}
            </a>
            <DeleteControl inquiry={item} />
          </Card>
          {item.spamScore > 0 || item.status === 'held' ? (
            <Notice
              tone='warning'
              icon={<ShieldAlert aria-hidden='true' />}
              title={`${t('detail.spamScore')}: ${item.spamScore}`}
            >
              {item.spamReasons.length > 0 ? (
                <p>
                  {t('detail.spamReasons')}:{' '}
                  <span className='font-mono text-[0.8125rem]'>
                    {item.spamReasons.join(', ')}
                  </span>
                </p>
              ) : null}
              {item.status === 'held' ? <p>{t('detail.spamNote')}</p> : null}
            </Notice>
          ) : null}
        </aside>
      </div>
    </div>
  );
};
