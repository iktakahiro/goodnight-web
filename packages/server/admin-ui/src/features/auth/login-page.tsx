import { useForm } from '@tanstack/react-form';
import { Link, getRouteApi, useRouter } from '@tanstack/react-router';
import { KeyRound, Sparkles } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { safeNextPath, toRouterHref } from '../../shared/router/admin-paths.ts';
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

const loginRoute = getRouteApi('/login');

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
  const router = useRouter();
  const next = safeNextPath(loginRoute.useSearch().next);
  const [failed, setFailed] = useState<'failed' | 'rate_limited' | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const leave = () => {
    router.options.context.session.forget();
    void router.navigate({ href: toRouterHref(next), replace: true });
  };
  const leaveFromEffect = useEffectEvent(leave);

  useEffect(() => {
    let active = true;
    // Already signed in: skip this screen.
    fetchMe().then(
      () => {
        if (active) leaveFromEffect();
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
      if (active && !result.error) leaveFromEffect();
    });
    return () => {
      active = false;
    };
  }, []);

  // The form has no fields to send: submitting it (the button or Enter in the
  // account field) opens the browser's passkey prompt.
  const form = useForm({
    defaultValues: { username: '' },
    onSubmit: async () => {
      setFailed(null);
      const result = await authClient.signIn.passkey();
      if (result.error) {
        // Sign-in requests are rate-limited per ip_hash (429).
        setFailed(result.error.status === 429 ? 'rate_limited' : 'failed');
        return;
      }
      leave();
    },
  });

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
        <CardContent>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
            className='flex flex-col gap-5'
          >
            <form.Field name='username'>
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>{t('login.autofillLabel')}</FieldLabel>
                  <Input
                    type='text'
                    autoComplete='username webauthn'
                    autoCapitalize='none'
                    spellCheck={false}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                  <FieldDescription>{t('login.autofillHint')}</FieldDescription>
                </Field>
              )}
            </form.Field>
            {failed ? (
              <Notice
                tone='error'
                role='alert'
                icon={<KeyRound aria-hidden='true' />}
              >
                <p>
                  {failed === 'rate_limited'
                    ? t('error.rate_limited')
                    : t('login.failed')}
                </p>
              </Notice>
            ) : null}
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(busy) => (
                <Button type='submit' size='lg' disabled={busy}>
                  {busy ? <Spinner /> : <KeyRound aria-hidden='true' />}
                  {busy ? t('login.signingIn') : t('admin.signIn')}
                </Button>
              )}
            </form.Subscribe>
            {setupOpen ? (
              <Notice
                tone='info'
                data-testid='setup-open'
                icon={<Sparkles aria-hidden='true' />}
              >
                <p>
                  {t('login.setupOpen')}{' '}
                  <Link
                    to='/setup'
                    className='rounded-sm font-semibold text-link underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring'
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
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
};
