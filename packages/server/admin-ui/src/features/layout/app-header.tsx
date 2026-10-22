import { Link, useLocation } from '@tanstack/react-router';
import { Inbox, ListChecks, LogOut, Mail, type LucideIcon } from 'lucide-react';
import { useAdminSession } from '../auth/admin-session.tsx';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { formatNumber } from '../../shared/i18n/format.ts';
import { Button } from '../../shared/ui/button.tsx';
import { cn } from '../../shared/ui/cn.ts';
import { LanguageSwitch } from './language-switch.tsx';
import { LogoMark } from './logo-mark.tsx';

const NavLink = ({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: '/' | '/form';
  icon: LucideIcon;
  label: string;
  active: boolean;
}) => (
  <Link
    to={to}
    aria-current={active ? 'page' : undefined}
    data-testid={`nav-${to === '/' ? 'inquiries' : 'form'}`}
    className={cn(
      'inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60 sm:px-3',
      active
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )}
  >
    <Icon aria-hidden='true' className='size-4' />
    <span className='sr-only md:not-sr-only'>{label}</span>
  </Link>
);

/**
 * The header on signed-in screens: the mark, the section links (inquiries
 * and the contact form), the unread count (always shown,
 * so a missed Slack notification is not a missed inquiry), the language
 * switch, and sign-out.
 */
export const AppHeader = () => {
  const { locale, t } = useI18n();
  const { admin, unreadCount, signOut } = useAdminSession();
  const hasUnread = (unreadCount ?? 0) > 0;
  const onForm = useLocation({
    select: (location) =>
      location.pathname === '/form' || location.pathname.startsWith('/form/'),
  });
  return (
    <header className='sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md'>
      <div className='mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:gap-3 sm:px-6'>
        <Link
          to='/'
          className='-ml-1 flex items-center gap-2.5 rounded-xl px-1 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/60'
        >
          <LogoMark className='size-9' />
          <span className='hidden flex-col leading-tight lg:flex'>
            <span className='text-[0.95rem] font-semibold'>
              {t('app.name')}
            </span>
            <span className='text-xs text-muted-foreground'>
              {t('app.adminLabel')}
            </span>
          </span>
        </Link>

        <nav aria-label={t('nav.label')} className='flex items-center gap-0.5'>
          <NavLink
            to='/'
            icon={Inbox}
            label={t('nav.inquiries')}
            active={!onForm}
          />
          <NavLink
            to='/form'
            icon={ListChecks}
            label={t('nav.form')}
            active={onForm}
          />
        </nav>

        <div className='ml-auto flex items-center gap-1 sm:gap-2'>
          <Link
            to='/'
            search={{ status: 'new' }}
            aria-label={`${t('header.unread')}: ${t('admin.unreadCount', {
              count: formatNumber(unreadCount ?? 0, locale),
            })}`}
            data-testid='unread-count'
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
              hasUnread
                ? 'border-primary/25 bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            <Mail aria-hidden='true' className='size-4' />
            <span aria-hidden='true'>
              {unreadCount === null
                ? '…'
                : t('admin.unreadCount', {
                    count: formatNumber(unreadCount, locale),
                  })}
            </span>
          </Link>
          <LanguageSwitch />
          <Button
            variant='ghost'
            size='sm'
            onClick={() => void signOut()}
            title={t('header.signedInAs', { email: admin.email })}
            className='px-3'
          >
            <LogOut aria-hidden='true' />
            <span className='sr-only sm:not-sr-only'>{t('admin.signOut')}</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
