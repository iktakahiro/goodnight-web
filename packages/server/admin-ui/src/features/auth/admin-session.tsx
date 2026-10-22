import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AdminStatus } from '../../../../src/features/admin-api/admin-routes.ts';
import { ApiError } from '../../shared/api/api-client.ts';
import { navigate } from '../../shared/router/router.tsx';
import { loginPath } from '../../shared/router/routes.ts';
import {
  fetchMe,
  fetchSetupState,
  fetchStatus,
  type AdminUser,
} from './admin-api.ts';
import { authClient } from './auth-client.ts';

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

/** Session check result before the admin screens render. */
export type SessionCheck =
  | { state: 'checking' }
  | { state: 'forbidden' }
  | { state: 'error'; error: ApiError }
  | { state: 'signed-in'; admin: AdminUser };

const currentPath = () => window.location.pathname + window.location.search;

/**
 * Where to send a visitor without a session: the setup screen while setup is
 * open (no admin can sign in yet), otherwise the sign-in screen, which
 * returns to the current path afterwards.
 */
const redirectSignedOut = async (): Promise<void> => {
  const setup = await fetchSetupState().catch(() => null);
  if (setup?.open) navigate('/admin/setup', { replace: true });
  else navigate(loginPath(currentPath()), { replace: true });
};

/** Signs out and goes to the sign-in screen. */
export const signOutAndLeave = async (): Promise<void> => {
  await authClient.signOut().catch(() => undefined);
  navigate('/admin/login', { replace: true });
};

/**
 * Checks the session with `GET /api/admin/me`:
 *
 * - 401: goes to setup (while open) or sign-in;
 * - 403 `passkey_required`: goes to setup to register the passkey;
 * - 403 `forbidden`: the address is no longer in `ADMIN_EMAILS`.
 */
export const useSessionCheck = (): [SessionCheck, () => void] => {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    check: SessionCheck;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetchMe().then(
      (admin) => {
        if (active)
          setResult({ attempt, check: { state: 'signed-in', admin } });
      },
      (error: unknown) => {
        if (!active) return;
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError(0, 'server_error', 'unexpected error');
        if (apiError.code === 'unauthorized') {
          void redirectSignedOut();
        } else if (apiError.code === 'passkey_required') {
          navigate('/admin/setup', { replace: true });
        } else if (apiError.code === 'forbidden') {
          setResult({ attempt, check: { state: 'forbidden' } });
        } else {
          setResult({ attempt, check: { state: 'error', error: apiError } });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const check: SessionCheck =
    result?.attempt === attempt ? result.check : { state: 'checking' };
  return [check, () => setAttempt((n) => n + 1)];
};

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
        signOut: signOutAndLeave,
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
 * (401) while a screen was open.
 */
export const useSignInOnUnauthorized = (error: ApiError | null): void => {
  useEffect(() => {
    if (error?.code === 'unauthorized') {
      navigate(loginPath(currentPath()), { replace: true });
    }
  }, [error]);
};
