import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  useRouter,
  type ErrorComponentProps,
  type RouterHistory,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import {
  AdminSessionProvider,
  createSessionGuard,
  useSignOut,
  type SessionGuard,
} from './features/auth/admin-session.tsx';
import { LoginPage } from './features/auth/login-page.tsx';
import { loginSearchSchema } from './features/auth/login-search.ts';
import { InquiryDetailPage } from './features/inquiries/inquiry-detail-page.tsx';
import { InquiryListPage } from './features/inquiries/inquiry-list-page.tsx';
import { listSearchSchema } from './features/inquiries/list-search.ts';
import { AdminLayout } from './features/layout/admin-layout.tsx';
import { AuthLayout } from './features/layout/auth-layout.tsx';
import {
  ForbiddenPage,
  NotFoundPage,
  PageError,
  PageLoading,
} from './features/layout/page-states.tsx';
import { SetupPage } from './features/setup/setup-page.tsx';
import { ApiError } from './shared/api/api-client.ts';
import { errorMessage } from './shared/api/error-message.ts';
import { useI18n } from './shared/i18n/i18n-provider.tsx';
import {
  adminBasepathRewrite,
  toAdminPath,
} from './shared/router/admin-paths.ts';

/** What every route can read from the router context. */
export interface AdminRouterContext {
  session: SessionGuard;
}

const Root = () => {
  const { t } = useI18n();
  useEffect(() => {
    document.title = `${t('app.adminLabel')} | ${t('app.name')}`;
  }, [t]);
  return <Outlet />;
};

const rootRoute = createRootRouteWithContext<AdminRouterContext>()({
  component: Root,
  notFoundComponent: () => (
    <AuthLayout>
      <NotFoundPage />
    </AuthLayout>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupPage,
});

const SignedInLayout = () => {
  const { admin } = signedInRoute.useRouteContext();
  return (
    <AdminSessionProvider admin={admin}>
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    </AdminSessionProvider>
  );
};

/** The session check failed: the address left `ADMIN_EMAILS`, or an error. */
const SignedInError = ({ error }: ErrorComponentProps) => {
  const { t } = useI18n();
  const router = useRouter();
  const signOut = useSignOut();
  const apiError = error instanceof ApiError ? error : null;
  return (
    <AuthLayout>
      {apiError?.code === 'forbidden' ? (
        <ForbiddenPage onSignOut={() => void signOut()} />
      ) : (
        <PageError
          message={apiError ? errorMessage(t, apiError) : t('error.generic')}
          onRetry={() => void router.invalidate()}
        />
      )}
    </AuthLayout>
  );
};

/**
 * Every screen behind sign-in. Without a session it sends the visitor to
 * setup (while no admin exists or the passkey is still missing) or to
 * sign-in, which returns to the requested screen afterwards.
 */
const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'signed-in',
  beforeLoad: async ({ context, location }) => {
    const check = await context.session.check();
    if (check.state === 'signed-in') return { admin: check.admin };
    if (check.state === 'signed-out' && !check.setupOpen) {
      throw redirect({
        to: '/login',
        search: { next: toAdminPath(location.href) },
        replace: true,
      });
    }
    throw redirect({ to: '/setup', replace: true });
  },
  component: SignedInLayout,
  pendingComponent: () => (
    <AuthLayout>
      <PageLoading />
    </AuthLayout>
  ),
  errorComponent: SignedInError,
});

const listRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: '/',
  validateSearch: listSearchSchema,
  component: InquiryListPage,
});

const DetailRoute = () => {
  const { id } = detailRoute.useParams();
  return <InquiryDetailPage key={id} id={id} />;
};

/** `/admin/inquiries/<id>`: the page that Slack notifications link to. */
const detailRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: '/inquiries/$id',
  component: DetailRoute,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  signedInRoute.addChildren([listRoute, detailRoute]),
]);

/**
 * Creates the admin UI router: typed routes under `/admin`, in the browser
 * history unless `history` is given.
 */
export const createAdminRouter = ({
  session = createSessionGuard(),
  history,
}: { session?: SessionGuard; history?: RouterHistory } = {}) =>
  createRouter({
    routeTree,
    rewrite: adminBasepathRewrite,
    context: { session },
    ...(history ? { history } : {}),
    scrollRestoration: true,
  });

/** The admin UI router type. */
export type AdminRouter = ReturnType<typeof createAdminRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AdminRouter;
  }
}
