import { useLocation, useRouter } from '@tanstack/react-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AdminStatus } from '../../../../src/features/admin-api/admin-routes.ts';
import type { SetupState } from '../../../../src/features/setup/setup-routes.ts';
import { ApiError } from '../../shared/api/api-client.ts';
import { toAdminPath } from '../../shared/router/admin-paths.ts';
import {
  fetchMe,
  fetchSetupState,
  fetchStatus,
  type AdminUser,
} from './admin-api.ts';
import { authClient } from './auth-client.ts';

/** Result of the session check that guards the signed-in screens. */
export type SessionCheck =
  | { state: 'signed-in'; admin: AdminUser }
  /** No session. `setupOpen`: no admin exists yet, so setup comes first. */
  | { state: 'signed-out'; setupOpen: boolean }
  /** Setup step 1 is done, but no passkey is registered yet. */
  | { state: 'needs-passkey' };

/**
 * Checks the session for the route guard and remembers the signed-in admin,
 * so moving between signed-in screens does not call the API again.
 */
export interface SessionGuard {
  /**
   * Checks the session with `GET /api/admin/me`, or returns the remembered
   * admin.
   *
   * @throws {ApiError} `forbidden` when the address is no longer in
   *   `ADMIN_EMAILS`, or any other API error.
   */
  check: () => SessionCheck | Promise<SessionCheck>;
  /** Forgets the remembered admin (after sign-out or a 401). */
  forget: () => void;
}

/** The API calls a {@link SessionGuard} makes. Tests replace them. */
export interface SessionApi {
  fetchMe: () => Promise<AdminUser>;
  fetchSetupState: () => Promise<SetupState>;
}

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiError
    ? error
    : new ApiError(0, 'server_error', 'unexpected error');

/** Creates the {@link SessionGuard} that the router passes to its routes. */
export const createSessionGuard = (
  api: SessionApi = { fetchMe, fetchSetupState },
): SessionGuard => {
  let admin: AdminUser | null = null;

  const load = async (): Promise<SessionCheck> => {
    try {
      admin = await api.fetchMe();
      return { state: 'signed-in', admin };
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'unauthorized') {
        const setup = await api.fetchSetupState().catch(() => null);
        return { state: 'signed-out', setupOpen: setup?.open === true };
      }
      if (apiError.code === 'passkey_required')
        return { state: 'needs-passkey' };
      throw apiError;
    }
  };

  return {
    check: () => (admin ? { state: 'signed-in', admin } : load()),
    forget: () => {
      admin = null;
    },
  };
};

/** Returns the router's {@link SessionGuard}. */
const useSessionGuard = (): SessionGuard => useRouter().options.context.session;

/** Returns a function that signs out and goes to the sign-in screen. */
export const useSignOut = (): (() => Promise<void>) => {
  const router = useRouter();
  const session = useSessionGuard();
  return useCallback(async () => {
    await authClient.signOut().catch(() => undefined);
    session.forget();
    await router.navigate({ to: '/login', replace: true });
  }, [router, session]);
};

interface AdminSessionValue {
  admin: AdminUser;
  /** Settings from `GET /api/admin/status`; `null` until loaded or on error. */
  status: AdminStatus | null;
  /** Unread inquiries, from the latest status or list response. */
  unreadCount: number | null;
  setUnreadCount: (count: number) => void;
  /** Reloads `GET /api/admin/status` (for example after a status change). */
  refreshStatus: () => void;
  signOut: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

/**
 * Holds the signed-in admin, the site status (for the setup notices), and the
 * unread count shown in the header.
 */
export const AdminSessionProvider = ({
  admin,
  children,
}: {
  admin: AdminUser;
  children: ReactNode;
}) => {
  const signOut = useSignOut();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [statusAttempt, setStatusAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetchStatus().then(
      (next) => {
        if (!active) return;
        setStatus(next);
        setUnreadCount(next.unreadCount);
      },
      () => {
        // The notices and the count are extras; the screens still work.
      },
    );
    return () => {
      active = false;
    };
  }, [statusAttempt]);

  const refreshStatus = useCallback(() => setStatusAttempt((n) => n + 1), []);

  return (
    <AdminSessionContext
      value={{
        admin,
        status,
        unreadCount,
        setUnreadCount,
        refreshStatus,
        signOut,
      }}
    >
      {children}
    </AdminSessionContext>
  );
};

/** The signed-in admin's session. Use inside {@link AdminSessionProvider}. */
export const useAdminSession = (): AdminSessionValue => {
  const value = useContext(AdminSessionContext);
  if (!value) {
    throw new Error('useAdminSession must be used inside AdminSessionProvider');
  }
  return value;
};

/**
 * Sends the user to sign-in when an API call reports that the session ended
 * (401) while a screen was open. Sign-in returns to the current screen.
 */
export const useSignInOnUnauthorized = (error: ApiError | null): void => {
  const router = useRouter();
  const session = useSessionGuard();
  const href = useLocation({ select: (location) => location.href });
  useEffect(() => {
    if (error?.code !== 'unauthorized') return;
    session.forget();
    void router.navigate({
      to: '/login',
      search: { next: toAdminPath(href) },
      replace: true,
    });
  }, [error, href, router, session]);
};
