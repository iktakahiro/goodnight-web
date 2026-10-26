import CircleExclamation from '@gravity-ui/icons/CircleExclamation';
import Compass from '@gravity-ui/icons/Compass';
import PersonXmark from '@gravity-ui/icons/PersonXmark';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Button, buttonVariants } from '../../shared/ui/button.tsx';
import { Card } from '../../shared/ui/card.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';

/** A centered loading message for a whole screen. */
export const PageLoading = () => {
  const { t } = useI18n();
  return (
    <div
      role='status'
      className='flex min-h-[50dvh] items-center justify-center gap-2.5 text-muted-foreground'
    >
      <Spinner className='size-5 text-primary' />
      <span>{t('app.loading')}</span>
    </div>
  );
};

/**
 * A friendly message card with an icon, for errors and empty screens. The card
 * and the title are centered; the body text is left-aligned.
 */
export const MessageCard = ({
  icon,
  title,
  children,
  action,
  role,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'alert';
}) => (
  <Card
    role={role}
    className='mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-10 sm:px-10'
  >
    <div className='mb-1 flex size-14 items-center justify-center rounded-full bg-accent text-primary [&_svg]:size-6'>
      {icon}
    </div>
    <h1 className='text-center text-lg font-semibold'>{title}</h1>
    {children ? (
      <div className='text-left text-[0.95rem] text-muted-foreground'>
        {children}
      </div>
    ) : null}
    {action ? <div className='mt-3'>{action}</div> : null}
  </Card>
);

/** An error card with a retry button. */
export const PageError = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => {
  const { t } = useI18n();
  return (
    <MessageCard
      role='alert'
      icon={<CircleExclamation aria-hidden='true' />}
      title={t('app.errorTitle')}
      action={
        onRetry ? (
          <Button variant='outline' onClick={onRetry}>
            {t('app.retry')}
          </Button>
        ) : null
      }
    >
      {message}
    </MessageCard>
  );
};

/** Shown when the address is no longer in `ADMIN_EMAILS`. */
export const ForbiddenPage = ({ onSignOut }: { onSignOut: () => void }) => {
  const { t } = useI18n();
  return (
    <MessageCard
      icon={<PersonXmark aria-hidden='true' />}
      title={t('forbidden.title')}
      action={
        <Button variant='outline' onClick={onSignOut}>
          {t('admin.signOut')}
        </Button>
      }
    >
      {t('forbidden.body')}
    </MessageCard>
  );
};

/** Shown for an unknown admin path. */
export const NotFoundPage = () => {
  const { t } = useI18n();
  return (
    <MessageCard
      icon={<Compass aria-hidden='true' />}
      title={t('app.notFound.title')}
      action={
        <Link to='/' className={buttonVariants({ variant: 'outline' })}>
          {t('app.backToList')}
        </Link>
      }
    >
      {t('app.notFound.body')}
    </MessageCard>
  );
};
