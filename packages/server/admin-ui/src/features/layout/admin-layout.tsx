import type { ReactNode } from 'react';
import { useAdminSession } from '../auth/admin-session.tsx';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { AppHeader } from './app-header.tsx';

/** Layout for signed-in screens: header, content, and a small footer. */
export const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { t } = useI18n();
  const { status } = useAdminSession();
  return (
    <div className='flex min-h-dvh flex-col'>
      <a
        href='#main'
        className='sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3'
      >
        {t('app.skipToContent')}
      </a>
      <AppHeader />
      <main
        id='main'
        tabIndex={-1}
        className='mx-auto w-full max-w-5xl flex-1 px-4 pt-7 pb-16 outline-none sm:px-6 sm:pt-10'
      >
        {children}
      </main>
      <footer className='mx-auto w-full max-w-5xl px-4 pb-8 text-xs text-muted-foreground sm:px-6'>
        {t('app.name')}
        {status ? ` ${status.version}` : ''}
      </footer>
    </div>
  );
};
