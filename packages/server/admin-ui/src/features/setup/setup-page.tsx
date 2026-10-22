import { Form } from '@base-ui/react/form';
import {
  CircleAlert,
  CircleCheck,
  Fingerprint,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '../../shared/api/api-client.ts';
import { errorMessage } from '../../shared/api/error-message.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Link, navigate } from '../../shared/router/router.tsx';
import { Button, buttonVariants } from '../../shared/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../shared/ui/card.tsx';
import { cn } from '../../shared/ui/cn.ts';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from '../../shared/ui/field.tsx';
import { Notice } from '../../shared/ui/notice.tsx';
import { Spinner } from '../../shared/ui/spinner.tsx';
import { fetchMe, fetchSetupState } from '../auth/admin-api.ts';
import { authClient } from '../auth/auth-client.ts';
import { AuthLayout } from '../layout/auth-layout.tsx';
import { PageLoading } from '../layout/page-states.tsx';

type Step =
  | { name: 'loading' }
  | { name: 'unavailable' }
  | { name: 'closed'; signedIn: boolean }
  | { name: 'token' }
  | { name: 'passkey' }
  | { name: 'done' };

const STEPS = ['setup.step1', 'setup.step2', 'setup.step3'] as const;

const StepIndicator = ({ current }: { current: 1 | 2 | 3 }) => {
  const { t } = useI18n();
  return (
    <ol
      aria-label={t('setup.stepOf', { current, total: STEPS.length })}
      className='flex items-center gap-2'
    >
      {STEPS.map((key, index) => {
        const number = index + 1;
        const state =
          number < current ? 'done' : number === current ? 'current' : 'todo';
        return (
          <li
            key={key}
            aria-current={state === 'current' ? 'step' : undefined}
            className='flex flex-1 flex-col gap-2'
          >
            <span
              className={cn(
                'h-1.5 rounded-full',
                state === 'todo' ? 'bg-accent' : 'bg-primary',
                state === 'current' && 'bg-primary/70',
              )}
            />
            <span
              className={cn(
                'text-xs leading-snug',
                state === 'current'
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {t(key)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const formString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** Step 1: `SETUP_TOKEN`, an address in `ADMIN_EMAILS`, and a name. */
const TokenStep = ({ onDone }: { onDone: () => void }) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    token?: string;
    email?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return;
    const data = new FormData(form);
    setBusy(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await apiFetch('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          token: formString(data.get('token')),
          email: formString(data.get('email')),
          name: formString(data.get('name')) || undefined,
        }),
      });
      onDone();
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(0, 'server_error', 'unexpected error');
      const message = errorMessage(t, apiError);
      if (apiError.code === 'invalid_setup_token') {
        setFieldErrors({ token: message });
      } else if (apiError.code === 'email_not_allowed') {
        setFieldErrors({ email: message });
      } else {
        setFormError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form
      onInput={() => {
        if (fieldErrors.token || fieldErrors.email) setFieldErrors({});
      }}
      onSubmit={(event) => void submit(event)}
      className='flex flex-col gap-5'
    >
      <Field name='token' invalid={fieldErrors.token ? true : undefined}>
        <FieldLabel>{t('admin.setup.token')}</FieldLabel>
        <Input type='password' required autoComplete='off' spellCheck={false} />
        <FieldDescription>{t('setup.tokenHint')}</FieldDescription>
        <FieldError match='valueMissing'>{t('field.required')}</FieldError>
        {fieldErrors.token ? (
          <FieldError match>{fieldErrors.token}</FieldError>
        ) : null}
      </Field>
      <Field name='email' invalid={fieldErrors.email ? true : undefined}>
        <FieldLabel>{t('admin.setup.email')}</FieldLabel>
        <Input type='email' required autoComplete='email' spellCheck={false} />
        <FieldDescription>{t('setup.emailHint')}</FieldDescription>
        <FieldError match='valueMissing'>{t('field.required')}</FieldError>
        <FieldError match='typeMismatch'>{t('field.invalid')}</FieldError>
        {fieldErrors.email ? (
          <FieldError match>{fieldErrors.email}</FieldError>
        ) : null}
      </Field>
      <Field name='name'>
        <FieldLabel>{t('admin.setup.name')}</FieldLabel>
        <Input type='text' autoComplete='name' maxLength={100} />
        <FieldDescription>{t('setup.nameHint')}</FieldDescription>
      </Field>
      {formError ? (
        <Notice
          tone='error'
          role='alert'
          icon={<CircleAlert aria-hidden='true' />}
        >
          <p>{formError}</p>
        </Notice>
      ) : null}
      <Button type='submit' size='lg' disabled={busy} className='mt-1'>
        {busy ? <Spinner /> : null}
        {busy ? t('setup.checking') : t('setup.continue')}
      </Button>
    </Form>
  );
};

/** Step 2: register a passkey with the session from step 1. */
const PasskeyStep = ({ onDone }: { onDone: () => void }) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const register = async () => {
    setBusy(true);
    setFailed(false);
    const result = await authClient.passkey.addPasskey({
      name: 'goodnight-web',
    });
    setBusy(false);
    if (result?.error) {
      setFailed(true);
      return;
    }
    onDone();
  };

  return (
    <div className='flex flex-col gap-5'>
      <p className='text-[0.95rem] leading-relaxed'>{t('setup.passkeyLead')}</p>
      <Notice tone='info' icon={<ShieldCheck aria-hidden='true' />}>
        <p>{t('setup.passkeyDomain', { host: window.location.host })}</p>
      </Notice>
      {failed ? (
        <Notice
          tone='error'
          role='alert'
          icon={<CircleAlert aria-hidden='true' />}
        >
          <p>{t('setup.passkeyFailed')}</p>
        </Notice>
      ) : null}
      <Button size='lg' onClick={() => void register()} disabled={busy}>
        {busy ? <Spinner /> : <Fingerprint aria-hidden='true' />}
        {busy ? t('setup.registering') : t('admin.setup.registerPasskey')}
      </Button>
    </div>
  );
};

/**
 * First-admin setup: the setup token form (`POST /api/setup`), passkey
 * registration, and a done step. Shows why setup cannot run when it is not
 * configured or already closed. A visitor who finished step 1 earlier but
 * left before registering a passkey continues at step 2.
 */
export const SetupPage = () => {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>({ name: 'loading' });

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchSetupState().catch(() => null),
      fetchMe().then(
        () => 'signed-in' as const,
        (error: unknown) =>
          error instanceof ApiError && error.code === 'passkey_required'
            ? ('needs-passkey' as const)
            : ('signed-out' as const),
      ),
    ]).then(([state, session]) => {
      if (!active) return;
      if (!state || !state.configured) setStep({ name: 'unavailable' });
      else if (!state.open)
        setStep({ name: 'closed', signedIn: session === 'signed-in' });
      else if (session === 'needs-passkey') setStep({ name: 'passkey' });
      else setStep({ name: 'token' });
    });
    return () => {
      active = false;
    };
  }, []);

  if (step.name === 'loading') {
    return (
      <AuthLayout>
        <PageLoading />
      </AuthLayout>
    );
  }

  if (step.name === 'unavailable' || step.name === 'closed') {
    const closed = step.name === 'closed';
    return (
      <AuthLayout>
        <Card>
          <CardHeader className='items-center text-center'>
            <div className='mb-2 flex size-14 items-center justify-center rounded-full bg-accent text-primary'>
              {closed ? (
                <CircleCheck aria-hidden='true' className='size-6' />
              ) : (
                <CircleAlert aria-hidden='true' className='size-6' />
              )}
            </div>
            <CardTitle>
              {closed ? t('setup.closedTitle') : t('setup.unavailableTitle')}
            </CardTitle>
            <CardDescription>
              {closed ? t('setup.closedLead') : t('error.setup_unavailable')}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex justify-center'>
            {closed ? (
              <Link
                href={step.signedIn ? '/admin' : '/admin/login'}
                className={buttonVariants({ variant: 'primary' })}
              >
                {step.signedIn ? t('setup.goToList') : t('setup.goToLogin')}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  const current = step.name === 'token' ? 1 : step.name === 'passkey' ? 2 : 3;
  return (
    <AuthLayout>
      <Card>
        <CardHeader className='gap-5'>
          <StepIndicator current={current} />
          <div className='flex flex-col gap-1.5'>
            <CardTitle className='flex items-center gap-2'>
              {step.name === 'done' ? (
                <CircleCheck
                  aria-hidden='true'
                  className='size-5 text-primary'
                />
              ) : (
                <KeyRound aria-hidden='true' className='size-5 text-primary' />
              )}
              {step.name === 'token'
                ? t('admin.setup.title')
                : step.name === 'passkey'
                  ? t('admin.setup.registerPasskey')
                  : t('setup.doneTitle')}
            </CardTitle>
            {step.name === 'token' ? (
              <CardDescription>{t('setup.lead')}</CardDescription>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {step.name === 'token' ? (
            <TokenStep onDone={() => setStep({ name: 'passkey' })} />
          ) : step.name === 'passkey' ? (
            <PasskeyStep onDone={() => setStep({ name: 'done' })} />
          ) : (
            <div className='flex flex-col gap-6'>
              <p className='text-[0.95rem] leading-relaxed'>
                {t('setup.doneLead')}
              </p>
              <Button
                size='lg'
                onClick={() => navigate('/admin', { replace: true })}
              >
                {t('setup.goToList')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
};
