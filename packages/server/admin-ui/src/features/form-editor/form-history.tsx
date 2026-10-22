import ArrowRotateLeft from '@gravity-ui/icons/ArrowRotateLeft';
import ClockArrowRotateLeft from '@gravity-ui/icons/ClockArrowRotateLeft';
import Eye from '@gravity-ui/icons/Eye';
import { useState } from 'react';
import type { FormVersionSummary } from '../../../../src/features/contact-form/form-store.ts';
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
} from '../../shared/ui/alert-dialog.tsx';
import { Badge } from '../../shared/ui/badge.tsx';
import { Button } from '../../shared/ui/button.tsx';
import { Card } from '../../shared/ui/card.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '../../shared/ui/dialog.tsx';
import { Skeleton } from '../../shared/ui/skeleton.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';
import { fetchFormVersion } from './form-api.ts';
import { FormPreview, previewFromField } from './form-preview.tsx';

const VersionPreview = ({ version }: { version: number }) => {
  const { locale, t } = useI18n();
  const loaded = useAsync(() => fetchFormVersion(version), String(version));
  if (loaded.status === 'loading') {
    return (
      <div className='flex flex-col gap-3'>
        <span role='status' className='sr-only'>
          {t('app.loading')}
        </span>
        <Skeleton className='h-4 w-40' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    );
  }
  if (loaded.status === 'error') {
    return (
      <p role='alert' className='text-sm text-destructive'>
        {errorMessage(t, loaded.error)}
      </p>
    );
  }
  return (
    <FormPreview
      fields={loaded.data.definition.fields.map(previewFromField)}
      locale={locale}
      untitled={t('form.untitled')}
    />
  );
};

/**
 * The saved versions, newest first, with who saved each one and when. Each
 * version can be viewed, and earlier ones restored (after a confirmation).
 */
export const FormHistory = ({
  history,
  currentVersion,
  dirty,
  onRestore,
}: {
  history: readonly FormVersionSummary[];
  currentVersion: number;
  dirty: boolean;
  /** Restores a version; rejects with an `ApiError` when it fails. */
  onRestore: (version: number) => Promise<void>;
}) => {
  const { locale, t } = useI18n();
  const [viewing, setViewing] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    if (restoring === null) return;
    setBusy(true);
    setError(null);
    try {
      await onRestore(restoring);
      setRestoring(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? errorMessage(t, caught)
          : t('form.restoreFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className='flex flex-col gap-4 p-5'>
      <div className='flex flex-col gap-1'>
        <h2 className='flex items-center gap-2 text-base font-semibold'>
          <ClockArrowRotateLeft
            aria-hidden='true'
            className='size-4 text-muted-foreground'
          />
          {t('form.historyHeading')}
        </h2>
        <p className='text-[0.8125rem] leading-relaxed text-muted-foreground'>
          {t('form.historyLead')}
        </p>
      </div>
      <ol
        className='flex flex-col divide-y divide-border/70'
        data-testid='form-history'
      >
        {history.map((entry) => {
          const current = entry.version === currentVersion;
          return (
            <li key={entry.version} className='flex flex-col gap-1.5 py-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-semibold tabular-nums'>
                  {t('form.version', { version: entry.version })}
                </span>
                {current ? (
                  <Badge tone='violet'>{t('form.current')}</Badge>
                ) : null}
              </div>
              <p className='text-[0.8125rem] leading-relaxed text-muted-foreground'>
                <time dateTime={new Date(entry.createdAt).toISOString()}>
                  {formatDateTime(entry.createdAt, locale)}
                </time>
                {' · '}
                <span className='break-all'>
                  {entry.createdBy ?? t('form.builtIn')}
                </span>
                {' · '}
                {t('form.fieldCount', { count: entry.fieldCount })}
                {entry.restoredFrom ? (
                  <>
                    <br />
                    {t('form.restoredFrom', { version: entry.restoredFrom })}
                  </>
                ) : null}
              </p>
              <div className='flex gap-1.5'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-8 px-2.5'
                  aria-label={t('form.viewLabel', { version: entry.version })}
                  onClick={() => setViewing(entry.version)}
                >
                  <Eye aria-hidden='true' />
                  {t('form.view')}
                </Button>
                {current ? null : (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-8 px-2.5'
                    aria-label={t('form.restoreLabel', {
                      version: entry.version,
                    })}
                    onClick={() => {
                      setError(null);
                      setRestoring(entry.version);
                    }}
                  >
                    <ArrowRotateLeft aria-hidden='true' />
                    {t('form.restore')}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <DialogContent>
          <div className='flex items-center justify-between gap-4'>
            <DialogTitle>
              {t('form.version', { version: viewing ?? 0 })}
            </DialogTitle>
            <DialogClose render={<Button variant='outline' size='sm' />}>
              {t('form.close')}
            </DialogClose>
          </div>
          {viewing !== null ? <VersionPreview version={viewing} /> : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={restoring !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRestoring(null);
        }}
      >
        <AlertDialogContent>
          <div className='flex flex-col gap-2'>
            <AlertDialogTitle>
              {t('form.restoreTitle', { version: restoring ?? 0 })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('form.restoreBody', { version: restoring ?? 0 })}
            </AlertDialogDescription>
            {dirty ? (
              <p className='text-[0.95rem] font-medium text-destructive'>
                {t('form.restoreUnsaved')}
              </p>
            ) : null}
            {error ? (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            ) : null}
          </div>
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
            <AlertDialogClose render={<Button variant='outline' />}>
              {t('form.cancel')}
            </AlertDialogClose>
            <Button onClick={() => void restore()} disabled={busy}>
              {busy ? <Spinner /> : <ArrowRotateLeft aria-hidden='true' />}
              {t('form.restore')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
