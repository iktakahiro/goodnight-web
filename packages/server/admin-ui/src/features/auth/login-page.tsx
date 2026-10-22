import { KeyRound, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Link, navigate, useLocation } from '../../shared/router/router.tsx';
import { safeNextPath } from '../../shared/router/routes.ts';
import { Button } from '../../shared/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../shared/ui/card.tsx';
import {
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from '../../shared/ui/field.tsx';
import { Notice } from '../../shared/ui/notice.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';
import { AuthLayout } from '../layout/auth-layout.tsx';
import { fetchMe, fetchSetupState } from './admin-api.ts';
import { authClient } from './auth-client.ts';

const currentNext = () =>
  safeNextPath(new URLSearchParams(window.location.search).get('next'));

const supportsConditionalUi = async (): Promise<boolean> => {
  try {
    return (
      typeof PublicKeyCredential !== 'undefined' &&
      typeof PublicKeyCredential.isConditionalMediationAvailable ===
        'function' &&
      (await PublicKeyCredential.isConditionalMediationAvailable())
    );
  } catch {
    return false;
  }
};

/**
 * Sign-in with a passkey. Offers the passkey in the browser's autofill
 * (conditional UI) when supported, and a button that opens the passkey
 * prompt. Returns to `?next=` (an admin path) afterwards.
 */
export const LoginPage = () => {
  const { t } = useI18n();
  const { search } = useLocation();
  const next = safeNextPath(search.get('next'));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    let active = true;
    // Already signed in: skip this screen.
    fetchMe().then(
      () => {
        if (active) navigate(currentNext(), { replace: true });
      },
      () => undefined,
    );
    fetchSetupState().then(
      (state) => {
        if (active) setSetupOpen(state.open);
      },
      () => undefined,
    );
    // Conditional UI: the browser offers saved passkeys in the input's
    // autofill. Starting the button flow aborts this request.
    void supportsConditionalUi().then(async (supported) => {
      if (!supported || !active) return;
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (active && !result.error) navigate(currentNext(), { replace: true });
    });
    return () => {
      active = false;
    };
  }, []);

  const signIn = async () => {
    setBusy(true);
    setFailed(false);
    const result = await authClient.signIn.passkey();
    setBusy(false);
    if (result.error) {
      setFailed(true);
      return;
    }
    navigate(next, { replace: true });
  };

  return (
    <AuthLayout>
      <Card>
        <CardHeader className='items-center text-center'>
          <div className='mb-2 flex size-14 items-center justify-center rounded-full bg-accent text-primary'>
            <KeyRound aria-hidden='true' className='size-6' />
          </div>
          <CardTitle>
            <span className='sr-only'>{t('app.name')} </span>
            {t('login.title')}
          </CardTitle>
          <CardDescription>{t('login.lead')}</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-5'>
          <Field>
            <FieldLabel>{t('login.autofillLabel')}</FieldLabel>
            <Input
              name='username'
              type='text'
              autoComplete='username webauthn'
              autoCapitalize='none'
              spellCheck={false}
            />
            <FieldDescription>{t('login.autofillHint')}</FieldDescription>
          </Field>
          {failed ? (
            <Notice
              tone='error'
              role='alert'
              icon={<KeyRound aria-hidden='true' />}
            >
              <p>{t('login.failed')}</p>
            </Notice>
          ) : null}
          <Button size='lg' onClick={() => void signIn()} disabled={busy}>
            {busy ? <Spinner /> : <KeyRound aria-hidden='true' />}
            {busy ? t('login.signingIn') : t('admin.signIn')}
          </Button>
          {setupOpen ? (
            <Notice
              tone='info'
              data-testid='setup-open'
              icon={<Sparkles aria-hidden='true' />}
            >
              <p>
                {t('login.setupOpen')}{' '}
                <Link
                  href='/admin/setup'
                  className='rounded-sm font-semibold text-primary underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/60'
                >
                  {t('login.setupLink')}
                </Link>
              </p>
            </Notice>
          ) : (
            <p className='text-center text-[0.8125rem] leading-relaxed text-muted-foreground'>
              {t('login.setupNote')}
            </p>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
};
