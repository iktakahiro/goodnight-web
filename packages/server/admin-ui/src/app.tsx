import { CSPProvider } from '@base-ui/react/csp-provider';
import { RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { AdminRouter } from './app-router.tsx';
import { I18nProvider, useI18n } from './shared/i18n/i18n-provider.tsx';
import { ToastProvider } from './shared/ui/toast.tsx';

const Toasts = ({ children }: { children: ReactNode }) => {
  const { t } = useI18n();
  return (
    <ToastProvider closeLabel={t('notice.close')}>{children}</ToastProvider>
  );
};

/** The admin SPA. */
export const App = ({ router }: { router: AdminRouter }) => (
  // The admin CSP forbids inline <style>; the one rule Base UI would inject
  // is in styles.css instead.
  <CSPProvider disableStyleElements>
    <I18nProvider>
      <Toasts>
        <RouterProvider router={router} />
      </Toasts>
    </I18nProvider>
  </CSPProvider>
);
