import { CSPProvider } from '@base-ui/react/csp-provider';
import { useEffect, type ReactNode } from 'react';
import {
  AdminSessionProvider,
  signOutAndLeave,
  useSessionCheck,
} from './features/auth/admin-session.tsx';
import { LoginPage } from './features/auth/login-page.tsx';
import { InquiryDetailPage } from './features/inquiries/inquiry-detail-page.tsx';
import { InquiryListPage } from './features/inquiries/inquiry-list-page.tsx';
import { AdminLayout } from './features/layout/admin-layout.tsx';
import { AuthLayout } from './features/layout/auth-layout.tsx';
import {
  ForbiddenPage,
  NotFoundPage,
  PageError,
  PageLoading,
} from './features/layout/page-states.tsx';
import { SetupPage } from './features/setup/setup-page.tsx';
import { errorMessage } from './shared/api/error-message.ts';
import { I18nProvider, useI18n } from './shared/i18n/i18n-provider.tsx';
import { useLocation } from './shared/router/router.tsx';
import { matchRoute, type Route } from './shared/router/routes.ts';
import { ToastProvider } from './shared/ui/toast.tsx';

/** List and detail: only after the session check passes. */
const SignedInScreens = ({
  route,
}: {
  route: Extract<Route, { name: 'list' | 'detail' }>;
}) => {
  const { t } = useI18n();
  const [check, retry] = useSessionCheck();
  if (check.state === 'checking') {
    return (
      <AuthLayout>
        <PageLoading />
      </AuthLayout>
    );
  }
  if (check.state === 'forbidden') {
    return (
      <AuthLayout>
        <ForbiddenPage onSignOut={() => void signOutAndLeave()} />
      </AuthLayout>
    );
  }
  if (check.state === 'error') {
    return (
      <AuthLayout>
        <PageError message={errorMessage(t, check.error)} onRetry={retry} />
      </AuthLayout>
    );
  }
  return (
    <AdminSessionProvider admin={check.admin}>
      <AdminLayout>
        {route.name === 'list' ? (
          <InquiryListPage />
        ) : (
          <InquiryDetailPage key={route.id} id={route.id} />
        )}
      </AdminLayout>
    </AdminSessionProvider>
  );
};

const Screens = () => {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const route = matchRoute(pathname);

  useEffect(() => {
    document.title = `${t('app.adminLabel')} | ${t('app.name')}`;
  }, [t]);

  switch (route.name) {
    case 'login':
      return <LoginPage />;
    case 'setup':
      return <SetupPage />;
    case 'list':
    case 'detail':
      return <SignedInScreens route={route} />;
    case 'not-found':
      return (
        <AuthLayout>
          <NotFoundPage />
        </AuthLayout>
      );
  }
};

const Toasts = ({ children }: { children: ReactNode }) => {
  const { t } = useI18n();
  return (
    <ToastProvider closeLabel={t('notice.close')}>{children}</ToastProvider>
  );
};

/** The admin SPA. */
export const App = () => (
  // The admin CSP forbids inline <style>; the one rule Base UI would inject
  // is in styles.css instead.
  <CSPProvider disableStyleElements>
    <I18nProvider>
      <Toasts>
        <Screens />
      </Toasts>
    </I18nProvider>
  </CSPProvider>
);
