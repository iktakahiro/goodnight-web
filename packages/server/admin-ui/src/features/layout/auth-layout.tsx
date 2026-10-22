import type { ReactNode } from 'react';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { LanguageSwitch } from './language-switch.tsx';
import { LogoLockup } from './logo-mark.tsx';
import { ThemeSwitch } from './theme-switch.tsx';

/** Layout for the sign-in and setup screens: a centered card. */
export const AuthLayout = ({ children }: { children: ReactNode }) => {
  const { t } = useI18n();
  return (
    <div className='flex min-h-dvh flex-col'>
      <header className='mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6'>
        <div className='flex items-center gap-3'>
          <LogoLockup label={t('app.name')} className='h-10 w-auto' />
          <span className='border-l border-border pl-3 text-sm text-muted-foreground'>
            {t('app.adminLabel')}
          </span>
        </div>
        <div className='flex items-center gap-1 sm:gap-2'>
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
      </header>
      <main
        id='main'
        className='flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0'
      >
        <div className='w-full max-w-md'>{children}</div>
      </main>
    </div>
  );
};
